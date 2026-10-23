#include "commands.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "cJSON.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "nvs.h"
#include "config.h"
#include "cycle.h"
#include "device.h"
#include "net.h"
#include "ota.h"

static const char *TAG = "commands";

#define NVS_NAMESPACE        "callgreen"
#define NVS_KEY_DONE         "cmd_done"
#define DONE_VERSION         1
#define DONE_MAX             8
#define CMD_ID_MAX           48
#define DETAIL_MAX           16
#define CMD_MAX_PER_POLL     10
#define RESP_MAX             4096
#define WIFI_TRY_TIMEOUT_MS  15000
#define ACK_ATTEMPTS         2

// detail-Werte laut v8 Abschnitt 4.3 (ota_now: Abschnitt 6.3, aus ota.c)
#define D_AUTH_FAILED    "auth_failed"
#define D_NOT_FOUND      "not_found"
#define D_TIMEOUT        "timeout"
#define D_NO_BACKEND     "no_backend"
#define D_INVALID_PARAMS "invalid_params"
#define D_UNSUPPORTED    "unsupported"

typedef struct {
    char    id[CMD_ID_MAX + 1];
    uint8_t ok;
    char    detail[DETAIL_MAX];
} done_t;

typedef struct {
    uint32_t version;
    uint8_t  next;
    done_t   e[DONE_MAX];
} done_store_t;

static done_store_t s_done;
static bool s_done_loaded;

// ---------- Liste der ausgefuehrten ids (NVS) ----------
static void done_load(void)
{
    if (s_done_loaded) return;
    s_done_loaded = true;
    memset(&s_done, 0, sizeof(s_done));
    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE, NVS_READONLY, &h) == ESP_OK) {
        size_t len = sizeof(s_done);
        if (nvs_get_blob(h, NVS_KEY_DONE, &s_done, &len) != ESP_OK || len != sizeof(s_done) ||
            s_done.version != DONE_VERSION) {
            memset(&s_done, 0, sizeof(s_done));
        }
        nvs_close(h);
    }
    s_done.version = DONE_VERSION;
}

static const done_t *done_find(const char *id)
{
    done_load();
    for (int i = 0; i < DONE_MAX; i++) {
        if (s_done.e[i].id[0] && strcmp(s_done.e[i].id, id) == 0) return &s_done.e[i];
    }
    return NULL;
}

static void done_add(const char *id, bool ok, const char *detail)
{
    done_load();
    done_t *d = &s_done.e[s_done.next % DONE_MAX];
    strlcpy(d->id, id, sizeof(d->id));
    d->ok = ok ? 1 : 0;
    strlcpy(d->detail, detail, sizeof(d->detail));
    s_done.next = (uint8_t)((s_done.next + 1) % DONE_MAX);

    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &h);
    if (err == ESP_OK) {
        err = nvs_set_blob(h, NVS_KEY_DONE, &s_done, sizeof(s_done));
        if (err == ESP_OK) err = nvs_commit(h);
        nvs_close(h);
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Befehlsliste speichern: %s", esp_err_to_name(err));
    }
}

// ---------- Ack ----------
static bool valid_id(const char *id)
{
    size_t len = strlen(id);
    if (len == 0 || len > CMD_ID_MAX) return false;
    for (; *id; id++) {
        char c = *id;
        if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
              c == '_' || c == '-')) return false;
    }
    return true;
}

static bool send_ack(const char *id, bool ok, const char *detail)
{
    char body[128];
    snprintf(body, sizeof(body), "{\"id\":\"%s\",\"result\":\"%s\",\"detail\":\"%s\"}",
             id, ok ? "ok" : "failed", detail);
    for (int attempt = 1; attempt <= ACK_ATTEMPTS; attempt++) {
        int code = net_post_json("/device/commands/ack", body, true, NULL, 0);
        if (code >= 200 && code < 300) {
            ESP_LOGI(TAG, "Ack %s: %s%s%s", id, ok ? "ok" : "failed", detail[0] ? ", " : "", detail);
            return true;
        }
        ESP_LOGW(TAG, "Ack %s fehlgeschlagen (%d)", id, code);
        if (code == 401) break;
    }
    return false;
}

// Ergebnis merken und quittieren. Scheitert das Ack, wird es bei erneuter Auslieferung nachgeholt.
static void finish(const char *id, bool ok, const char *detail)
{
    done_add(id, ok, detail);
    send_ack(id, ok, detail);
}

// ---------- Befehle ----------
static void cmd_measure_now(const char *id, bool usb)
{
    ESP_LOGI(TAG, "measure_now: messen und senden");
    cycle_result_t r = cycle_run("command", usb);
    bool ok = (r.http == 200);
    if (device_state() != DEV_ACTIVE) {
        return;  // 401: kein Ack mehr moeglich
    }
    if (!r.wifi_ok && !net_wifi_connected()) {
        done_add(id, ok, ok ? "" : D_NO_BACKEND);  // Ack folgt bei erneuter Auslieferung
        return;
    }
    finish(id, ok, ok ? "" : D_NO_BACKEND);
}

static void cmd_set_config(const char *id, const cJSON *params)
{
    config_result_t r = config_apply_json(params, "Konfiguration per set_config");
    bool ok = (r == CONFIG_OK || r == CONFIG_PARTIAL);
    ESP_LOGI(TAG, "set_config: %s", r == CONFIG_OK ? "ok" : r == CONFIG_PARTIAL ? "teilweise uebernommen" :
             "kein gueltiges Feld");
    finish(id, ok, ok ? "" : D_INVALID_PARAMS);
}

static bool is_hex(const char *s)
{
    for (; *s; s++) {
        char c = *s;
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false;
    }
    return true;
}

static const char *fail_detail(net_wifi_fail_t f)
{
    switch (f) {
    case NET_WIFI_FAIL_AUTH:      return D_AUTH_FAILED;
    case NET_WIFI_FAIL_NOT_FOUND: return D_NOT_FOUND;
    default:                      return D_TIMEOUT;
    }
}

static void cmd_set_wifi(const char *id, const cJSON *params)
{
    const cJSON *jssid = cJSON_GetObjectItemCaseSensitive(params, "ssid");
    const cJSON *jpass = cJSON_GetObjectItemCaseSensitive(params, "password");
    const char *ssid = cJSON_IsString(jssid) ? jssid->valuestring : NULL;
    const char *pass = cJSON_IsString(jpass) ? jpass->valuestring : (jpass ? NULL : "");
    size_t ssid_len = ssid ? strlen(ssid) : 0;
    size_t pass_len = pass ? strlen(pass) : 0;
    // SSID 1-32 Byte; Passwort leer (offen), 8-63 (Passphrase) oder 64 Hex-Zeichen (PSK)
    bool valid = ssid && pass && ssid_len >= 1 && ssid_len <= 32 &&
                 (pass_len == 0 || (pass_len >= 8 && pass_len <= 63) || (pass_len == 64 && is_hex(pass)));
    if (!valid) {
        ESP_LOGW(TAG, "set_wifi: ungueltige Parameter (SSID %u, Passwort %u Zeichen)",
                 (unsigned)ssid_len, (unsigned)pass_len);
        finish(id, false, D_INVALID_PARAMS);
        return;
    }

    wifi_config_t old;
    if (!net_get_stored_wifi(&old)) {
        memset(&old, 0, sizeof(old));
    }
    wifi_config_t neu = {0};
    memcpy(neu.sta.ssid, ssid, ssid_len);
    memcpy(neu.sta.password, pass, pass_len);

    ESP_LOGW(TAG, "set_wifi: teste neues WLAN (SSID %u Zeichen), bisheriges bleibt gespeichert",
             (unsigned)ssid_len);
    net_wifi_fail_t f = net_wifi_try(&neu, WIFI_TRY_TIMEOUT_MS);
    const char *detail = NULL;
    if (f == NET_WIFI_OK) {
        // Erfolg erst, wenn das Backend ueber das neue WLAN erreichbar ist
        if (send_ack(id, true, "")) {
            net_wifi_commit();
            done_add(id, true, "");
            ESP_LOGW(TAG, "set_wifi: neues WLAN verbunden, Backend erreichbar, gespeichert");
            return;
        }
        detail = D_NO_BACKEND;
    } else {
        detail = fail_detail(f);
    }

    ESP_LOGW(TAG, "set_wifi fehlgeschlagen (%s), stelle bisheriges WLAN wieder her", detail);
    if (old.sta.ssid[0]) {
        net_wifi_restore(&old, WIFI_TRY_TIMEOUT_MS);
    }
    done_add(id, false, detail);
    if (net_wifi_connected()) {
        send_ack(id, false, detail);
    } else {
        ESP_LOGW(TAG, "set_wifi: bisheriges WLAN nicht erreichbar, Ack folgt beim naechsten Kontakt");
    }
}

static void cmd_factory_reset(const char *id)
{
    // Erst quittieren: danach gibt es kein Token mehr. Das Backend entwertet das Token beim Ack.
    if (!send_ack(id, true, "")) {
        ESP_LOGW(TAG, "factory_reset: Ack nicht angekommen, wird beim naechsten Kontakt erneut versucht");
        return;
    }
    done_add(id, true, "");
    device_factory_reset();
}

static void cmd_ota_now(const char *id, bool usb)
{
    ota_result_t r = ota_check_latest(usb, true);
    if (r == OTA_R_INSTALLED) {
        // Erst quittieren, dann in die neue Firmware starten
        finish(id, true, "");
        ota_restart();
    }
    finish(id, ota_result_ok(r), ota_result_detail(r));
}

static void execute(const char *id, const char *type, const cJSON *params, bool usb)
{
    ESP_LOGW(TAG, "Befehl %s: %s", id, type);
    if (strcmp(type, "measure_now") == 0) {
        cmd_measure_now(id, usb);
    } else if (strcmp(type, "set_config") == 0) {
        cmd_set_config(id, params);
    } else if (strcmp(type, "set_wifi") == 0) {
        cmd_set_wifi(id, params);
    } else if (strcmp(type, "factory_reset") == 0) {
        cmd_factory_reset(id);
    } else if (strcmp(type, "ota_now") == 0) {
        cmd_ota_now(id, usb);
    } else {
        // auch "unclaim": entfaellt, das Backend entwertet stattdessen das Token (401)
        finish(id, false, D_UNSUPPORTED);
    }
}

bool commands_poll(bool usb)
{
    if (device_state() != DEV_ACTIVE || !net_wifi_connected()) {
        return false;
    }
    char *resp = calloc(1, RESP_MAX);
    if (!resp) {
        return false;
    }
    int code = net_get_json("/device/commands", true, resp, RESP_MAX);
    if (code != 200) {
        ESP_LOGW(TAG, "GET /device/commands: %d", code);
        free(resp);
        return false;
    }
    // Erster Backend-Kontakt nach einem OTA: neue Firmware ist gueltig
    ota_mark_valid_if_pending();
    cJSON *root = cJSON_Parse(resp);
    free(resp);
    const cJSON *list = root ? cJSON_GetObjectItemCaseSensitive(root, "commands") : NULL;
    if (!cJSON_IsArray(list)) {
        ESP_LOGW(TAG, "Antwort ohne commands-Array");
        cJSON_Delete(root);
        return false;
    }

    int n = 0;
    const cJSON *it;
    cJSON_ArrayForEach(it, list) {
        if (n++ >= CMD_MAX_PER_POLL) break;
        if (device_state() != DEV_ACTIVE) break;  // 401 waehrend der Ausfuehrung
        const cJSON *jid = cJSON_GetObjectItemCaseSensitive(it, "id");
        const cJSON *jtype = cJSON_GetObjectItemCaseSensitive(it, "type");
        const cJSON *params = cJSON_GetObjectItemCaseSensitive(it, "params");
        if (!cJSON_IsString(jid) || !valid_id(jid->valuestring)) {
            ESP_LOGW(TAG, "Befehl mit ungueltiger id uebersprungen");
            continue;
        }
        const char *id = jid->valuestring;
        const done_t *d = done_find(id);
        if (d) {
            // Schon ausgefuehrt, nur das Ack war nicht angekommen
            ESP_LOGI(TAG, "Befehl %s bereits ausgefuehrt, sende Ack erneut", id);
            send_ack(id, d->ok, d->detail);
            continue;
        }
        if (!cJSON_IsString(jtype)) {
            finish(id, false, D_INVALID_PARAMS);
            continue;
        }
        execute(id, jtype->valuestring, params, usb);
    }
    if (n > 0) {
        ESP_LOGI(TAG, "%d Befehl(e) verarbeitet", n > CMD_MAX_PER_POLL ? CMD_MAX_PER_POLL : n);
    }
    cJSON_Delete(root);
    return true;
}
