#include "onboarding.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "cJSON.h"
#include "esp_event.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "network_provisioning/manager.h"
#include "network_provisioning/scheme_ble.h"
#include "protocomm_ble.h"
#include "sdkconfig.h"
#include "config.h"
#include "device.h"
#include "net.h"
#include "sensors.h"
#include "version.h"

static const char *TAG = "onboarding";

#define EP_CLAIM            "claim"
#define EP_STATUS           "status"
#define CLAIM_TOKEN_MAX     64
#define KEEP_OPEN_US        (60LL * 1000000LL)
#define CREDS_PAUSE_MAX_US  (30LL * 1000000LL)  // max. Pause des Nachlaufs fuer WLAN-Daten der App
#define PARALLEL_RETRY_MS   15000
#define HEAP_LOG_PERIOD_US  (10LL * 1000000LL)
#define POLL_MS             250

typedef enum {
    CLAIM_PENDING,
    CLAIM_OK,
    CLAIM_FAILED,
} claim_status_t;

static portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;
static char s_claim_token[CLAIM_TOKEN_MAX + 1];  // nur im RAM
static bool s_claim_new;
static volatile claim_status_t s_claim_status;
static volatile int s_claim_http;
static volatile bool s_claim_seen;   // App hat in dieser Session einen claim_token geschickt
typedef enum {
    CREDS_EV_NONE,
    CREDS_EV_OK,
    CREDS_EV_FAIL,
} creds_event_t;

static volatile bool s_creds_busy;   // App hat WLAN-Daten geschickt, Ergebnis steht noch aus
static volatile bool s_creds_ok;     // WLAN-Daten der App in dieser Session erfolgreich verbunden
static volatile creds_event_t s_creds_event;  // letztes Ergebnis, wird in der Schleife abgeholt
static volatile bool s_prov_ended;
static volatile bool s_ble_connected;  // App per BLE verbunden
static wifi_config_t s_stored;         // WLAN-Daten vor dem Onboarding
static bool s_have_stored;
static bool s_used_this_boot;

static const char *claim_status_name(claim_status_t s)
{
    switch (s) {
    case CLAIM_OK:     return "ok";
    case CLAIM_FAILED: return "failed";
    default:           return "pending";
    }
}

static void log_heap(const char *when)
{
    ESP_LOGI(TAG, "Heap %s: frei %lu, min %lu, groesster Block %u", when,
             (unsigned long)esp_get_free_heap_size(),
             (unsigned long)esp_get_minimum_free_heap_size(),
             (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
}

static bool is_base32(const char *s)
{
    for (; *s; s++) {
        if (!((*s >= 'A' && *s <= 'Z') || (*s >= '2' && *s <= '7'))) return false;
    }
    return true;
}

static bool is_base64url(const char *s)
{
    for (; *s; s++) {
        char c = *s;
        if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
              c == '-' || c == '_')) return false;
    }
    return true;
}

static esp_err_t reply(uint8_t **outbuf, ssize_t *outlen, const char *json)
{
    char *out = strdup(json);
    if (!out) {
        return ESP_ERR_NO_MEM;
    }
    *outbuf = (uint8_t *)out;
    *outlen = (ssize_t)strlen(out);
    return ESP_OK;
}

// Custom Endpoint "claim": {"claim_token":"..."} -> {"ok":true}
static esp_err_t claim_handler(uint32_t session_id, const uint8_t *inbuf, ssize_t inlen,
                               uint8_t **outbuf, ssize_t *outlen, void *priv)
{
    if (s_claim_status == CLAIM_OK) {
        // Ein Claim pro Onboarding-Session, sonst wuerde ein zweiter das neue Token entwerten
        ESP_LOGW(TAG, "BLE: Claim in dieser Session bereits erfolgt, weiterer claim abgelehnt");
        return reply(outbuf, outlen, "{\"ok\":false,\"error\":\"already_claimed\"}");
    }
    bool ok = false;
    cJSON *root = (inbuf && inlen > 0) ? cJSON_ParseWithLength((const char *)inbuf, (size_t)inlen) : NULL;
    const cJSON *tok = root ? cJSON_GetObjectItemCaseSensitive(root, "claim_token") : NULL;
    if (cJSON_IsString(tok) && tok->valuestring) {
        size_t len = strlen(tok->valuestring);
        if (len > 0 && len <= CLAIM_TOKEN_MAX && is_base32(tok->valuestring)) {
            taskENTER_CRITICAL(&s_mux);
            strlcpy(s_claim_token, tok->valuestring, sizeof(s_claim_token));
            s_claim_new = true;
            s_claim_seen = true;
            s_claim_status = CLAIM_PENDING;
            s_claim_http = 0;
            taskEXIT_CRITICAL(&s_mux);
            ok = true;
        }
    }
    if (ok) {
        char red[32];
        device_redact(tok->valuestring, red, sizeof(red));
        ESP_LOGI(TAG, "BLE: claim_token empfangen: %s", red);
    } else {
        ESP_LOGW(TAG, "BLE: ungueltiger claim-Request abgelehnt");
    }
    cJSON_Delete(root);
    return reply(outbuf, outlen, ok ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"invalid_token\"}");
}

// Custom Endpoint "status": Inhalt wird ignoriert.
// {"wifi":"connected|disconnected","claim":"pending|ok|failed","http":N,"ssid":"..."}
// ssid nur, wenn verbunden.
static esp_err_t status_handler(uint32_t session_id, const uint8_t *inbuf, ssize_t inlen,
                                uint8_t **outbuf, ssize_t *outlen, void *priv)
{
    bool connected = net_wifi_connected();
    cJSON *root = cJSON_CreateObject();
    if (!root) {
        return ESP_ERR_NO_MEM;
    }
    cJSON_AddStringToObject(root, "wifi", connected ? "connected" : "disconnected");
    cJSON_AddStringToObject(root, "claim", claim_status_name(s_claim_status));
    cJSON_AddNumberToObject(root, "http", s_claim_http);
    wifi_ap_record_t ap;
    if (connected && esp_wifi_sta_get_ap_info(&ap) == ESP_OK) {
        char ssid[sizeof(ap.ssid) + 1];
        memcpy(ssid, ap.ssid, sizeof(ap.ssid));
        ssid[sizeof(ap.ssid)] = '\0';
        cJSON_AddStringToObject(root, "ssid", ssid);
    }
    char *json = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (!json) {
        return ESP_ERR_NO_MEM;
    }
    ESP_LOGI(TAG, "BLE: status -> %s", json);
    *outbuf = (uint8_t *)json;
    *outlen = (ssize_t)strlen(json);
    return ESP_OK;
}

static void prov_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    switch (id) {
    case NETWORK_PROV_START:
        ESP_LOGI(TAG, "BLE-Provisioning gestartet als %s", device_ble_name());
        break;
    case NETWORK_PROV_WIFI_CRED_RECV: {
        const wifi_sta_config_t *sta = data;
        ESP_LOGI(TAG, "BLE: WLAN-Daten empfangen, SSID \"%s\"", (const char *)sta->ssid);
        s_creds_busy = true;
        // Ab jetzt verbindet der Provisioning-Manager mit den neuen Daten
        net_parallel_connect_stop();
        if (net_wifi_connected()) {
            esp_wifi_disconnect();
        }
        break;
    }
    case NETWORK_PROV_WIFI_CRED_FAIL: {
        network_prov_wifi_sta_fail_reason_t reason = *(network_prov_wifi_sta_fail_reason_t *)data;
        ESP_LOGW(TAG, "BLE: WLAN-Verbindung fehlgeschlagen (%s), warte auf neue Daten",
                 reason == NETWORK_PROV_WIFI_STA_AUTH_ERROR ? "AUTH_ERROR" : "NETWORK_NOT_FOUND");
        // Erlaubt der App, neue WLAN-Daten zu senden. Setzt dabei eine leere
        // WLAN-Konfiguration und loescht so auch die gespeicherten Daten im NVS.
        network_prov_mgr_reset_wifi_sm_state_on_failure();
        s_creds_busy = false;
        s_creds_event = CREDS_EV_FAIL;
        if (s_have_stored) {
            // Zuletzt funktionierendes WLAN wiederherstellen und parallel weiter versuchen
            ESP_LOGI(TAG, "Stelle bisheriges WLAN \"%s\" wieder her", (const char *)s_stored.sta.ssid);
            net_parallel_connect_start(&s_stored, PARALLEL_RETRY_MS);
        }
        break;
    }
    case NETWORK_PROV_WIFI_CRED_SUCCESS:
        ESP_LOGI(TAG, "BLE: WLAN-Daten ok, verbunden");
        // Zuletzt funktionierendes WLAN merken, falls spaetere WLAN-Daten fehlschlagen
        s_have_stored = net_get_stored_wifi(&s_stored);
        s_creds_ok = true;
        s_creds_busy = false;
        s_creds_event = CREDS_EV_OK;
        device_set_wifi_present(true, "WLAN per BLE eingerichtet");
        break;
    case NETWORK_PROV_END:
        s_prov_ended = true;
        break;
    default:
        break;
    }
}

static void ble_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (id == PROTOCOMM_TRANSPORT_BLE_CONNECTED) {
        s_ble_connected = true;
        ESP_LOGI(TAG, "BLE: App verbunden");
    } else if (id == PROTOCOMM_TRANSPORT_BLE_DISCONNECTED) {
        s_ble_connected = false;
        ESP_LOGI(TAG, "BLE: App getrennt");
    }
}

static void do_claim(const char *claim_token)
{
    char red[32];
    device_redact(claim_token, red, sizeof(red));
    ESP_LOGI(TAG, "POST /device/claim (claim_token %s)", red);

    char body[256];
    snprintf(body, sizeof(body),
             "{\"device_id\":\"%s\",\"claim_token\":\"%s\",\"fw_version\":\"%s\",\"hw_rev\":\"%s\"}",
             device_id(), claim_token, CALLGREEN_FW_VERSION, CALLGREEN_HW_REV);
    char *resp = calloc(1, 1024);
    int code = net_post_json("/device/claim", body, false, resp, resp ? 1024 : 0);

    claim_status_t status = CLAIM_FAILED;
    if (code == 200 && resp) {
        cJSON *root = cJSON_Parse(resp);
        const cJSON *tok = root ? cJSON_GetObjectItemCaseSensitive(root, "device_token") : NULL;
        if (cJSON_IsString(tok) && tok->valuestring && strlen(tok->valuestring) <= DEVICE_TOKEN_MAX &&
            is_base64url(tok->valuestring) && device_set_token(tok->valuestring, "Claim ok")) {
            status = CLAIM_OK;
        } else {
            ESP_LOGE(TAG, "Claim-Antwort ohne gueltiges device_token");
        }
        if (status == CLAIM_OK) {
            config_apply_json(cJSON_GetObjectItemCaseSensitive(root, "config"), "Konfiguration aus Claim");
        }
        cJSON_Delete(root);
    } else if (code == 400) {
        ESP_LOGE(TAG, "Claim fehlgeschlagen: 400 (ungueltige Anfrage)");
    } else if (code == 410) {
        ESP_LOGE(TAG, "Claim fehlgeschlagen: 410 (claim_token abgelaufen oder verbraucht)");
    } else {
        ESP_LOGE(TAG, "Claim fehlgeschlagen: %d", code);
    }
    free(resp);

    s_claim_http = code > 0 ? code : 0;
    s_claim_status = status;
    ESP_LOGI(TAG, "Claim-Status: %s, http %d", claim_status_name(status), s_claim_http);
}

onb_result_t onboarding_run(uint32_t battery_window_s)
{
    if (s_used_this_boot) {
        // BT-Speicher wurde nach dem ersten Onboarding freigegeben
        ESP_LOGW(TAG, "BLE erneut noetig, Neustart");
        fflush(stdout);
        vTaskDelay(pdMS_TO_TICKS(100));
        esp_restart();
    }
    if (CONFIG_CALLGREEN_POP[0] == '\0') {
        ESP_LOGE(TAG, "CONFIG_CALLGREEN_POP ist leer, Onboarding nicht moeglich");
        return ONB_FAILED;
    }
    s_used_this_boot = true;
    s_claim_token[0] = '\0';
    s_claim_new = false;
    s_claim_status = CLAIM_PENDING;
    s_claim_http = 0;
    s_claim_seen = false;
    s_creds_busy = false;
    s_creds_ok = false;
    s_creds_event = CREDS_EV_NONE;
    s_prov_ended = false;
    s_ble_connected = false;

    // Vor dem Start lesen: start_provisioning leert die WLAN-Konfiguration im RAM
    s_have_stored = net_get_stored_wifi(&s_stored);

    // security1 gibt sonst auf INFO den Session-Schluessel als Hexdump aus
    esp_log_level_set("security1", ESP_LOG_WARN);

    log_heap("vor BLE");
    network_prov_mgr_config_t cfg = {
        .scheme = network_prov_scheme_ble,
        .scheme_event_handler = NETWORK_PROV_SCHEME_BLE_EVENT_HANDLER_FREE_BTDM,
        .app_event_handler = NETWORK_PROV_EVENT_HANDLER_NONE,
    };
    esp_err_t err = network_prov_mgr_init(cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "network_prov_mgr_init: %s", esp_err_to_name(err));
        return ONB_FAILED;
    }
    esp_event_handler_instance_t evh = NULL;
    esp_event_handler_instance_t evh_ble = NULL;
    esp_event_handler_instance_register(NETWORK_PROV_EVENT, ESP_EVENT_ANY_ID, prov_event, NULL, &evh);
    esp_event_handler_instance_register(PROTOCOMM_TRANSPORT_BLE_EVENT, ESP_EVENT_ANY_ID, ble_event, NULL, &evh_ble);

    // BLE bleibt nach dem WLAN-Erfolg offen, gestoppt wird hier nach Claim + 60 s
    network_prov_mgr_disable_auto_stop(1000);
    network_prov_mgr_endpoint_create(EP_CLAIM);
    network_prov_mgr_endpoint_create(EP_STATUS);

    err = network_prov_mgr_start_provisioning(NETWORK_PROV_SECURITY_1, (const void *)CONFIG_CALLGREEN_POP,
                                              device_ble_name(), NULL);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "start_provisioning: %s", esp_err_to_name(err));
        esp_event_handler_instance_unregister(NETWORK_PROV_EVENT, ESP_EVENT_ANY_ID, evh);
        esp_event_handler_instance_unregister(PROTOCOMM_TRANSPORT_BLE_EVENT, ESP_EVENT_ANY_ID, evh_ble);
        network_prov_mgr_deinit();
        return ONB_FAILED;
    }
    network_prov_mgr_endpoint_register(EP_CLAIM, claim_handler, NULL);
    network_prov_mgr_endpoint_register(EP_STATUS, status_handler, NULL);

    if (s_have_stored) {
        ESP_LOGI(TAG, "Parallel: versuche gespeichertes WLAN \"%s\"", (const char *)s_stored.sta.ssid);
        net_parallel_connect_start(&s_stored, PARALLEL_RETRY_MS);
    }
    ESP_LOGW(TAG, "BLE-Onboarding aktiv (Zustand %s, %s)", device_state_name(device_state()),
             battery_window_s ? "Kaltstart-Fenster" : "solange USB steckt");
    log_heap("BLE aktiv");

    const int64_t start = esp_timer_get_time();
    const int64_t window_end = start + (int64_t)battery_window_s * 1000000LL;
    int64_t next_heap_log = start + HEAP_LOG_PERIOD_US;
    int64_t keep_until = 0;
    bool keep_active = false;     // Nachlauf nach Claim ok oder WLAN-Erfolg
    bool keep_no_timeout = false; // nach WLAN-Fehler im Nachlauf: offen, solange die App verbunden ist
    int64_t busy_since = 0;
    onb_result_t keep_result = ONB_CLAIMED;
    onb_result_t result;
    int low_count = 0;

    for (;;) {
        int64_t now = esp_timer_get_time();

        if (now >= next_heap_log) {
            log_heap("Onboarding");
            next_heap_log = now + HEAP_LOG_PERIOD_US;
        }

        // Claim, sobald Token und WLAN da sind
        char token[CLAIM_TOKEN_MAX + 1] = "";
        if (net_wifi_connected()) {
            taskENTER_CRITICAL(&s_mux);
            if (s_claim_new) {
                strlcpy(token, s_claim_token, sizeof(token));
                s_claim_new = false;
            }
            taskEXIT_CRITICAL(&s_mux);
        }
        if (token[0]) {
            do_claim(token);
            memset(token, 0, sizeof(token));
            // TLS-Verbindung nicht offen halten, solange BLE laeuft (Heap)
            net_http_close();

            // claim_token, der waehrend des laufenden POST ankam
            bool discarded = false;
            taskENTER_CRITICAL(&s_mux);
            if (s_claim_new) {
                if (s_claim_status == CLAIM_OK) {
                    // Ein Claim pro Session: neues Token haette das gerade erhaltene entwertet
                    s_claim_new = false;
                    memset(s_claim_token, 0, sizeof(s_claim_token));
                    discarded = true;
                } else {
                    // Fehlgeschlagen, das neue Token wird im naechsten Durchlauf verwendet
                    s_claim_status = CLAIM_PENDING;
                    s_claim_http = 0;
                }
            }
            taskEXIT_CRITICAL(&s_mux);
            if (discarded) {
                ESP_LOGW(TAG, "Waehrend des Claims empfangener claim_token verworfen (Claim bereits ok)");
            }
            now = esp_timer_get_time();
        }

        // Nachlauf starten. Ein Claim laeuft nur bei verbundenem WLAN, nach Claim ok steht es also.
        if (!keep_active) {
            if (s_claim_status == CLAIM_OK) {
                keep_active = true;
                keep_until = now + KEEP_OPEN_US;
                keep_result = ONB_CLAIMED;
                s_creds_event = CREDS_EV_NONE;
                ESP_LOGI(TAG, "Claim ok, WLAN verbunden: BLE bleibt noch max. 60 s offen fuer status, "
                         "Ende bei Trennung der App");
            } else if (!s_claim_seen && device_state() == DEV_ACTIVE && net_wifi_connected()) {
                // AKTIV und WLAN da, App hat keinen Claim begonnen: BLE wird nicht mehr gebraucht
                if (s_creds_ok) {
                    keep_active = true;
                    keep_until = now + KEEP_OPEN_US;
                    keep_result = ONB_WIFI_READY;
                    s_creds_event = CREDS_EV_NONE;
                    ESP_LOGI(TAG, "AKTIV und WLAN per BLE verbunden, BLE bleibt noch max. 60 s offen");
                } else if (!s_creds_busy) {
                    ESP_LOGI(TAG, "Gespeichertes WLAN verbunden und Zustand AKTIV, BLE nicht mehr noetig");
                    result = ONB_WIFI_READY;
                    break;
                }
            }
        }

        if (keep_active) {
            creds_event_t ev = s_creds_event;
            s_creds_event = CREDS_EV_NONE;
            if (ev == CREDS_EV_OK) {
                keep_until = now + KEEP_OPEN_US;
                keep_no_timeout = false;
                ESP_LOGI(TAG, "Nachlauf: neues WLAN verbunden, BLE bleibt noch max. 60 s offen");
            } else if (ev == CREDS_EV_FAIL) {
                keep_no_timeout = true;
                ESP_LOGW(TAG, "Nachlauf: WLAN-Daten fehlgeschlagen, BLE bleibt offen, solange die App verbunden ist");
            }

            bool paused = false;
            if (s_creds_busy) {
                // App hat im Nachlauf WLAN-Daten geschickt: auf das Ergebnis warten
                if (busy_since == 0) {
                    busy_since = now;
                    ESP_LOGI(TAG, "Nachlauf pausiert, warte auf Ergebnis der WLAN-Daten");
                }
                paused = (now - busy_since) < CREDS_PAUSE_MAX_US;
            } else {
                busy_since = 0;
            }

            if (!paused) {
                // Nachlauf nur fuer die bestehende Verbindung: trennt die App, sofort beenden,
                // sonst wuerde BLE wieder werben und ein zweites Onboarding zulassen
                if (!s_ble_connected) {
                    ESP_LOGI(TAG, "App nicht mehr verbunden, Nachlauf beendet");
                    result = keep_result;
                    break;
                }
                if (!keep_no_timeout && now >= keep_until) {
                    ESP_LOGI(TAG, "Nachlauf abgelaufen");
                    result = keep_result;
                    break;
                }
            }
        }

        // USB entprellt pruefen
        low_count = sensors_vbus_present() ? 0 : low_count + 1;
        if (low_count >= 2) {
            if (keep_active) {
                ESP_LOGW(TAG, "USB abgezogen, Onboarding beendet");
                result = keep_result;
                break;
            }
            if (battery_window_s == 0) {
                ESP_LOGW(TAG, "USB abgezogen, Onboarding beendet");
                result = ONB_UNPLUGGED;
                break;
            }
            if (now >= window_end) {
                ESP_LOGW(TAG, "Kaltstart-Fenster (%lu s) abgelaufen, Onboarding beendet",
                         (unsigned long)battery_window_s);
                result = ONB_TIMEOUT;
                break;
            }
        }

        if (s_prov_ended) {
            ESP_LOGW(TAG, "Provisioning unerwartet beendet");
            result = (device_state() == DEV_ACTIVE) ? ONB_CLAIMED : ONB_FAILED;
            break;
        }
        vTaskDelay(pdMS_TO_TICKS(POLL_MS));
    }

    net_parallel_connect_stop();
    network_prov_mgr_deinit();  // stoppt BLE, gibt BT-Speicher frei
    esp_event_handler_instance_unregister(NETWORK_PROV_EVENT, ESP_EVENT_ANY_ID, evh);
    esp_event_handler_instance_unregister(PROTOCOMM_TRANSPORT_BLE_EVENT, ESP_EVENT_ANY_ID, evh_ble);
    memset(s_claim_token, 0, sizeof(s_claim_token));
    ESP_LOGW(TAG, "BLE-Onboarding beendet, Zustand %s", device_state_name(device_state()));
    log_heap("nach BLE");
    return result;
}
