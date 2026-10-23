#include "cycle.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "cJSON.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "sdkconfig.h"
#include "config.h"
#include "device.h"
#include "net.h"
#include "ota.h"
#include "sensors.h"
#include "state.h"
#include "version.h"

static const char *TAG = "cycle";

#define WIFI_TIMEOUT_MS      15000
#define NTP_SYNC_TIMEOUT_MS  9000    // Warten auf echten Sync, wenn die Uhr schon laeuft (bis zu 5 Anfragen)
#define NTP_TIMEOUT_MS       15000   // Warten, wenn die Uhr noch gar nicht gesetzt ist
#define SAMPLE_INTERVAL_MS   50
#define BH1750_FIRST_MS      180     // erste Messung nach Mode-Befehl
#define BACKOFF_BASE_S       (30 * 60)
#define BACKOFF_MAX_S        (4 * 3600)
#define CRITICAL_SLEEP_S     (6 * 3600)
#define FALLBACK_SLEEP_S     (30 * 60)
#define SEND_ATTEMPTS        3
#define READING_JSON_MAX     400
#define RESP_MAX             2048

static void get_local_time_parts(int *hour, int *minute, int *second)
{
    time_t now = time(NULL);
    struct tm t;
    localtime_r(&now, &t);
    *hour = t.tm_hour;
    *minute = t.tm_min;
    *second = t.tm_sec;
}

// Messplan (Vertrag Abschnitt 8), identisch zu v4.3/v5/v6
static uint64_t calc_seconds_until_next_slot(int hour, int minute, int second)
{
    int total_seconds = hour * 3600 + minute * 60 + second;
    if (hour >= 0 && hour < 5)  return (uint64_t)((5 * 3600) - total_seconds);
    if (hour >= 5 && hour < 13) return (uint64_t)(3600 - (minute * 60 + second));
    if (hour >= 13 && hour < 20) {
        int into = minute * 60 + second;
        return (minute < 30) ? (uint64_t)((30 * 60) - into)
                             : (uint64_t)((60 * 60) - into);
    }
    return (uint64_t)((24 * 3600) - total_seconds);
}

static uint64_t sleep_until_next_slot(void)
{
    int h, m, s;
    get_local_time_parts(&h, &m, &s);
    uint64_t secs = calc_seconds_until_next_slot(h, m, s);
    if (secs == 0 || secs > 24 * 3600) {
        ESP_LOGE(TAG, "Schlaf-Berechnung Problem! Fallback 30 Min");
        state_set_flag(FLAG_SLEEP_PROBLEM);
        secs = FALLBACK_SLEEP_S;
    }
    return secs;
}

static uint32_t now_unix(void)
{
    time_t t = time(NULL);
    return t > 0 ? (uint32_t)t : 0;
}

// ---------- Messen (WLAN aus) ----------
static void measure(reading_t *r, int64_t *meas_us, bool usb)
{
    const cg_config_t *cfg = config_get();
    memset(r, 0, sizeof(*r));

    bool aht20_ok = sensors_aht20_init();
    bool bh1750_ok = sensors_bh1750_init();
    int64_t bh_start = esp_timer_get_time();
    if (!aht20_ok) state_set_flag(FLAG_AHT20_MISSING);
    if (!bh1750_ok) state_set_flag(FLAG_BH1750_MISSING);

    sensors_gate_on();
    vTaskDelay(pdMS_TO_TICKS(cfg->settle_ms));
    int med = 0, mn = 0, mx = 0;
    bool moist_ok = sensors_moisture_sample((int)cfg->samples, SAMPLE_INTERVAL_MS, &med, &mn, &mx);
    sensors_gate_off();
    *meas_us = esp_timer_get_time();

    if (aht20_ok) {
        float t, h;
        if (sensors_aht20_read(&t, &h)) {
            r->temperature_c = t;
            r->humidity_pct = h;
            r->flags |= RD_HAS_TEMP | RD_HAS_HUM;
        } else {
            ESP_LOGW(TAG, "AHT20 Lesefehler");
            state_set_flag(FLAG_AHT20_MISSING);
        }
    }
    if (bh1750_ok) {
        int64_t wait_ms = BH1750_FIRST_MS - (esp_timer_get_time() - bh_start) / 1000;
        if (wait_ms > 0) vTaskDelay(pdMS_TO_TICKS(wait_ms));
        float lux;
        if (sensors_bh1750_read(&lux)) {
            r->lux = (uint32_t)lux;
            r->flags |= RD_HAS_LUX;
        } else {
            ESP_LOGW(TAG, "BH1750 Lesefehler");
            state_set_flag(FLAG_BH1750_MISSING);
        }
    }

    float bat = sensors_battery_v();
    r->battery_mv = (uint16_t)(bat * 1000.0f + 0.5f);
    if (sensors_is_charging()) r->flags |= RD_CHARGING;
    if (usb) r->flags |= RD_USB;

    if (moist_ok) {
        r->moisture_raw = (uint16_t)med;
        r->moisture_raw_min = (uint16_t)mn;
        r->moisture_raw_max = (uint16_t)mx;
        r->moisture_pct = (uint8_t)sensors_moisture_pct_from_raw(med);
        r->flags |= RD_HAS_MOIST;
    } else {
        ESP_LOGE(TAG, "Bodenfeuchte nicht lesbar, sende moisture_pct null");
    }

    r->seq = state_next_seq();
    r->measured_at = now_unix();
}

static void log_reading(const reading_t *r)
{
    char mo[32] = "null", t[12] = "null", h[12] = "null", l[12] = "null";
    if (r->flags & RD_HAS_MOIST) {
        snprintf(mo, sizeof(mo), "%u%% raw=%u (%u..%u)", r->moisture_pct, r->moisture_raw,
                 r->moisture_raw_min, r->moisture_raw_max);
    }
    if (r->flags & RD_HAS_TEMP) snprintf(t, sizeof(t), "%.1fC", r->temperature_c);
    if (r->flags & RD_HAS_HUM)  snprintf(h, sizeof(h), "%.1f%%", r->humidity_pct);
    if (r->flags & RD_HAS_LUX)  snprintf(l, sizeof(l), "%lu", (unsigned long)r->lux);
    ESP_LOGI(TAG, "Messung seq %lu: moisture=%s temp=%s rh=%s lux=%s bat=%.2fV%s%s",
             (unsigned long)r->seq, mo, t, h, l, r->battery_mv / 1000.0f,
             (r->flags & RD_CHARGING) ? " laedt" : "", (r->flags & RD_USB) ? " usb" : "");
}

// ---------- JSON (Vertrag Abschnitt 5) ----------
static int append_reading(char *out, size_t cap, const reading_t *r)
{
    char t[16] = "null", h[16] = "null", l[16] = "null";
    if (r->flags & RD_HAS_TEMP) snprintf(t, sizeof(t), "%.1f", r->temperature_c);
    if (r->flags & RD_HAS_HUM)  snprintf(h, sizeof(h), "%.1f", r->humidity_pct);
    if (r->flags & RD_HAS_LUX)  snprintf(l, sizeof(l), "%lu", (unsigned long)r->lux);
    // Bodenfeuchte nicht lesbar: moisture_pct null, Rohwerte weglassen
    char mo[96] = "\"moisture_pct\":null";
    if (r->flags & RD_HAS_MOIST) {
        snprintf(mo, sizeof(mo),
                 "\"moisture_pct\":%u,\"moisture_raw\":%u,\"moisture_raw_min\":%u,\"moisture_raw_max\":%u",
                 r->moisture_pct, r->moisture_raw, r->moisture_raw_min, r->moisture_raw_max);
    }
    return snprintf(out, cap,
                    "{\"seq\":%lu,\"measured_at\":%lu,\"time_synced\":%s,%s,"
                    "\"temperature_c\":%s,\"humidity_pct\":%s,\"lux\":%s,"
                    "\"battery_v\":%.2f,\"charging\":%s,\"usb\":%s}",
                    (unsigned long)r->seq, (unsigned long)r->measured_at,
                    (r->flags & RD_TIME_SYNCED) ? "true" : "false", mo,
                    t, h, l, r->battery_mv / 1000.0f,
                    (r->flags & RD_CHARGING) ? "true" : "false",
                    (r->flags & RD_USB) ? "true" : "false");
}

static char *build_batch(const char *wake_cause, uint32_t wifi_ms, int rssi, uint32_t next_contact_at)
{
    persist_t *p = &g_persist;
    size_t cap = (size_t)p->buf_count * READING_JSON_MAX + 512;
    char *out = malloc(cap);
    if (!out) {
        return NULL;
    }
    size_t len = (size_t)snprintf(out, cap, "{\"device_id\":\"%s\",\"fw_version\":\"%s\",\"readings\":[",
                                  device_id(), CALLGREEN_FW_VERSION);
    for (int i = 0; i < p->buf_count && len < cap; i++) {
        if (i > 0) out[len++] = ',';
        len += (size_t)append_reading(out + len, cap - len, &p->buf[i]);
    }
    // Optional: zurueckgerollte Version, bis ein Batch mit 200 bestaetigt wurde (v8 Abschnitt 6.2)
    char rb[48] = "";
    if (ota_rollback_version()) {
        snprintf(rb, sizeof(rb), ",\"ota_rollback_version\":\"%s\"", ota_rollback_version());
    }
    if (len < cap) {
        len += (size_t)snprintf(out + len, cap - len,
                                "],\"status\":{\"boot_count\":%lu,\"wake_cause\":\"%s\","
                                "\"wifi_connect_ms\":%lu,\"rssi\":%d,\"error_flags\":%u,"
                                "\"buffered_count\":%d,\"next_contact_at\":%lu%s}}",
                                (unsigned long)p->boot_count, wake_cause, (unsigned long)wifi_ms, rssi,
                                p->error_flags, p->buf_count > 0 ? p->buf_count - 1 : 0,
                                (unsigned long)next_contact_at, rb);
    }
    if (len >= cap) {
        ESP_LOGE(TAG, "Batch-JSON zu gross");
        free(out);
        return NULL;
    }
    return out;
}

static bool s_commands_pending;

// Antwort 200 auswerten: accepted_seqs aus dem Puffer entfernen, config uebernehmen
static void handle_batch_response(const char *resp)
{
    cJSON *root = cJSON_Parse(resp);
    if (!root) {
        ESP_LOGW(TAG, "Antwort nicht lesbar, Messungen bleiben im Puffer");
        return;
    }
    uint32_t seqs[READING_BUF_MAX];
    int n = 0;
    const cJSON *acc = cJSON_GetObjectItemCaseSensitive(root, "accepted_seqs");
    const cJSON *it;
    cJSON_ArrayForEach(it, acc) {
        if (cJSON_IsNumber(it) && n < READING_BUF_MAX) {
            seqs[n++] = (uint32_t)it->valuedouble;
        }
    }
    int before = g_persist.buf_count;
    buf_remove_seqs(seqs, n);
    ESP_LOGI(TAG, "Backend: %d von %d Messungen bestaetigt, %d bleiben im Puffer",
             before - g_persist.buf_count, before, g_persist.buf_count);

    config_apply_json(cJSON_GetObjectItemCaseSensitive(root, "config"), "Konfiguration vom Backend");

    s_commands_pending = cJSON_IsTrue(cJSON_GetObjectItemCaseSensitive(root, "commands_pending"));
    if (s_commands_pending) {
        ESP_LOGI(TAG, "Backend meldet commands_pending");
    }
    // OTA-Angebot (schon nach device_id und Rollout gefiltert), bearbeitet der Aufrufer
    ota_set_offer(cJSON_GetObjectItemCaseSensitive(root, "ota"));
    cJSON_Delete(root);
}

// Rueckgabe: HTTP-Code der letzten Antwort oder negativ
static int send_batch(const char *wake_cause, uint32_t wifi_ms, int rssi, uint32_t next_contact_at)
{
    char *body = build_batch(wake_cause, wifi_ms, rssi, next_contact_at);
    if (!body) {
        return -1;
    }
    char *resp = calloc(1, RESP_MAX);
    int code = -1;
    for (int attempt = 1; attempt <= SEND_ATTEMPTS; attempt++) {
        ESP_LOGI(TAG, "POST /readings/batch (%d Messungen, Versuch %d)", g_persist.buf_count, attempt);
        code = net_post_json("/readings/batch", body, true, resp, resp ? RESP_MAX : 0);
        // Idempotent ueber seq: Netzwerkfehler und 5xx duerfen wiederholt werden
        if (code > 0 && code < 500) break;
        if (attempt < SEND_ATTEMPTS) {
            ESP_LOGW(TAG, "Senden fehlgeschlagen (%d), neuer Versuch in %d s", code, attempt * 2);
            vTaskDelay(pdMS_TO_TICKS(attempt * 2000));
        }
    }

    if (code == 200) {
        // Erster Backend-Kontakt nach einem OTA: neue Firmware ist gueltig
        ota_mark_valid_if_pending();
        if (ota_rollback_version()) {
            ota_rollback_reported();
        }
        handle_batch_response(resp ? resp : "");
        // Gemeldete Fehler sind beim Backend angekommen
        g_persist.error_flags = 0;
    } else if (code == 401) {
        // net hat Token und Puffer bereits geloescht (v8 Abschnitt 5.7)
        ESP_LOGE(TAG, "401: Token abgelehnt");
    } else if (code >= 400 && code < 500) {
        // Vertrag Abschnitt 10: verwerfen, nicht endlos wiederholen, im naechsten Status melden
        ESP_LOGE(TAG, "HTTP %d: %d Messungen verworfen", code, g_persist.buf_count);
        buf_clear();
        state_set_flag(FLAG_SEND_FAILED);
    } else {
        ESP_LOGE(TAG, "Senden fehlgeschlagen (%d), %d Messungen bleiben im Puffer", code, g_persist.buf_count);
        state_set_flag(FLAG_SEND_FAILED);
    }
    free(resp);
    free(body);
    return code;
}

cycle_result_t cycle_run(const char *wake_cause, bool usb)
{
    persist_t *p = &g_persist;
    const cg_config_t *cfg = config_get();
    cycle_result_t res = {.sleep_s = FALLBACK_SLEEP_S, .wifi_ok = false};

    p->boot_count++;
    ESP_LOGI(TAG, "Zyklus #%lu, Weckgrund %s, Fehler-Flags 0x%02X, Puffer %u",
             (unsigned long)p->boot_count, wake_cause, p->error_flags, p->buf_count);

    // ---------- Messen mit WLAN aus ----------
    reading_t r;
    int64_t meas_us;
    measure(&r, &meas_us, usb);
    log_reading(&r);
    buf_push(&r);

    // ---------- Akkuschutz ----------
    float bat = r.battery_mv / 1000.0f;
    if (!usb && bat > 1.0f && bat < cfg->critical_battery_v) {
        ESP_LOGW(TAG, "Akku kritisch (%.2f V < %.2f V): kein WLAN, Messung gepuffert, Schlaf bis USB oder 6 h",
                 bat, cfg->critical_battery_v);
        res.sleep_s = CRITICAL_SLEEP_S;
        return res;
    }
    if (bat > 1.0f && bat < cfg->low_battery_v) {
        ESP_LOGW(TAG, "Akku niedrig (%.2f V < %.2f V)", bat, cfg->low_battery_v);
    }

    // ---------- WLAN-Backoff (nur Akkubetrieb) ----------
    uint32_t now = now_unix();
    if (!usb && p->next_wifi_at && now < p->next_wifi_at) {
        ESP_LOGW(TAG, "WLAN-Backoff: naechster Versuch in %lu min, Messung gepuffert (%u im Puffer)",
                 (unsigned long)((p->next_wifi_at - now) / 60), p->buf_count);
        res.sleep_s = sleep_until_next_slot();
        return res;
    }

    // ---------- WLAN ----------
    ESP_LOGI(TAG, "Verbinde WLAN...");
    int64_t wifi_start = esp_timer_get_time();
    bool wifi_ok = net_wifi_connect(WIFI_TIMEOUT_MS);
    uint32_t wifi_ms = (uint32_t)((esp_timer_get_time() - wifi_start) / 1000);
    if (!wifi_ok) {
        state_set_flag(FLAG_WIFI_FAILED);
        if (p->wifi_fail_count < 255) p->wifi_fail_count++;
        uint32_t backoff = BACKOFF_BASE_S;
        for (int i = 1; i < p->wifi_fail_count && backoff < BACKOFF_MAX_S; i++) backoff *= 2;
        if (backoff > BACKOFF_MAX_S) backoff = BACKOFF_MAX_S;
        p->next_wifi_at = now_unix() + backoff;
        ESP_LOGE(TAG, "WLAN fehlgeschlagen (%u. Mal), naechster Versuch fruehestens in %lu min",
                 p->wifi_fail_count, (unsigned long)(backoff / 60));
        net_wifi_off();
        res.sleep_s = sleep_until_next_slot();
        return res;
    }
    res.wifi_ok = true;
    p->wifi_fail_count = 0;
    p->next_wifi_at = 0;
    int rssi = 0;
    wifi_ap_record_t ap;
    if (esp_wifi_sta_get_ap_info(&ap) == ESP_OK) {
        rssi = ap.rssi;
    }
    ESP_LOGI(TAG, "WLAN verbunden in %lu ms, RSSI %d", (unsigned long)wifi_ms, rssi);

    // ---------- Zeit ----------
    time_sync_result_t ts = net_time_sync(NTP_SYNC_TIMEOUT_MS, NTP_TIMEOUT_MS);
    if (ts == TIME_SYNCED) {
        // Messzeitpunkt der aktuellen Messung auf die synchronisierte Uhr umrechnen
        reading_t *cur = buf_find(r.seq);
        if (cur) {
            int64_t ago_s = (esp_timer_get_time() - meas_us) / 1000000LL;
            cur->measured_at = now_unix() - (uint32_t)ago_s;
            cur->flags |= RD_TIME_SYNCED;
        }
        ESP_LOGI(TAG, "Zeit per SNTP synchronisiert");
    } else if (ts == TIME_FALLBACK) {
        ESP_LOGW(TAG, "Kein SNTP-Sync, Fallback auf weiterlaufende Uhr (time_synced=false)");
        state_set_flag(FLAG_TIME_SYNC_FAILED);
    } else {
        ESP_LOGE(TAG, "Zeit-Sync fehlgeschlagen, Uhr ungueltig (time_synced=false)");
        state_set_flag(FLAG_TIME_SYNC_FAILED);
    }

    // ---------- Senden ----------
    res.sleep_s = sleep_until_next_slot();
    uint32_t next_contact_at = now_unix() + (uint32_t)res.sleep_s;
    s_commands_pending = false;
    ota_set_offer(NULL);
    res.http = send_batch(wake_cause, wifi_ms, rssi, next_contact_at);
    res.commands_pending = s_commands_pending;

    int h, m, s;
    get_local_time_parts(&h, &m, &s);
    ESP_LOGI(TAG, "Zyklus fertig %02d:%02d, naechster in %llu min", h, m, res.sleep_s / 60);
    return res;
}

void cycle_settle_test(void)
{
    ESP_LOGI(TAG, "SETTLE-TEST: Sensor an, 60 s lang alle 100 ms Rohwert");
    sensors_gate_on();
    int64_t start = esp_timer_get_time();
    for (int i = 0; i < 600; i++) {
        int64_t t_ms = (esp_timer_get_time() - start) / 1000;
        ESP_LOGI(TAG, "t=%5lld ms raw=%d", t_ms, sensors_moisture_raw());
        vTaskDelay(pdMS_TO_TICKS(100));
    }
    sensors_gate_off();
    ESP_LOGI(TAG, "SETTLE-TEST fertig, Sensor aus");
}
