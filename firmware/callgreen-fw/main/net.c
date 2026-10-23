#include "net.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_netif_sntp.h"
#include "esp_sntp.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "nvs_flash.h"
#include "sdkconfig.h"
#include "device.h"
#include "state.h"

static const char *TAG = "net";

#define TZ_INFO             "CET-1CEST,M3.5.0,M10.5.0/3"
#define HTTP_TIMEOUT_MS     15000
#define SNTP_RESEND_MS      2000    // SNTP-Anfrage neu senden, wenn bis dahin keine Antwort kam
#define HTTP_RETRY_DELAY_MS 1000
#define URL_MAX             160

#define BIT_GOT_IP BIT0

typedef struct {
    char  *buf;
    size_t cap;
    size_t len;
} resp_ctx_t;

static esp_http_client_handle_t s_http;  // wiederverwendet: eine TLS-Verbindung pro Zyklus
static resp_ctx_t s_resp;
static EventGroupHandle_t s_events;
static esp_timer_handle_t s_retry_timer;
static bool s_inited;
static volatile bool s_started;
static volatile bool s_want_connect;
static volatile uint32_t s_retry_delay_ms;
static volatile bool s_connected;
static volatile uint8_t s_last_reason;  // letzter Trennungsgrund (wifi_err_reason_t)
static bool s_sntp_inited;
static char s_ip[16] = "0.0.0.0";

static void http_release(void);

static void retry_timer_cb(void *arg)
{
    if (s_want_connect && !s_connected) {
        esp_wifi_connect();
    }
}

static void on_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        s_started = true;
        if (s_want_connect) {
            esp_wifi_connect();
        }
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_STOP) {
        s_started = false;
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        const wifi_event_sta_disconnected_t *ev = data;
        s_last_reason = ev->reason;
        s_connected = false;
        xEventGroupClearBits(s_events, BIT_GOT_IP);
        if (s_want_connect) {
            if (s_retry_delay_ms == 0) {
                esp_wifi_connect();
            } else {
                esp_timer_stop(s_retry_timer);
                esp_timer_start_once(s_retry_timer, (uint64_t)s_retry_delay_ms * 1000ULL);
            }
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        const ip_event_got_ip_t *ev = data;
        snprintf(s_ip, sizeof(s_ip), IPSTR, IP2STR(&ev->ip_info.ip));
        s_connected = true;
        xEventGroupSetBits(s_events, BIT_GOT_IP);
        ESP_LOGI(TAG, "WLAN verbunden, IP %s", s_ip);
    }
}

bool net_init(void)
{
    if (s_inited) {
        return true;
    }
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        err = nvs_flash_init();
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NVS-Init: %s", esp_err_to_name(err));
        return false;
    }
    s_events = xEventGroupCreate();
    if (!s_events ||
        esp_netif_init() != ESP_OK ||
        esp_event_loop_create_default() != ESP_OK ||
        !esp_netif_create_default_wifi_sta()) {
        ESP_LOGE(TAG, "Netzwerk-Stack-Init fehlgeschlagen");
        return false;
    }
    const esp_timer_create_args_t targs = {
        .callback = retry_timer_cb,
        .name = "wifi_retry",
    };
    if (esp_timer_create(&targs, &s_retry_timer) != ESP_OK) {
        return false;
    }
    // WLAN-Daten liegen im NVS (WIFI_STORAGE_FLASH, Standard) und werden vom Provisioning verwaltet
    wifi_init_config_t init_cfg = WIFI_INIT_CONFIG_DEFAULT();
    err = esp_wifi_init(&init_cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "WLAN-Init: %s", esp_err_to_name(err));
        return false;
    }
    esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, on_event, NULL, NULL);
    esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_event, NULL, NULL);
    esp_wifi_set_mode(WIFI_MODE_STA);

    s_inited = true;
    return true;
}

bool net_get_stored_wifi(wifi_config_t *out)
{
    wifi_config_t cfg = {0};
    if (esp_wifi_get_config(WIFI_IF_STA, &cfg) != ESP_OK || cfg.sta.ssid[0] == '\0') {
        return false;
    }
    if (out) {
        *out = cfg;
    }
    return true;
}

bool net_wifi_connect(uint32_t timeout_ms)
{
    if (!net_init()) {
        return false;
    }
    if (s_connected) {
        return true;
    }
    if (!net_get_stored_wifi(NULL)) {
        ESP_LOGW(TAG, "Keine WLAN-Daten gespeichert");
        return false;
    }
    xEventGroupClearBits(s_events, BIT_GOT_IP);
    s_retry_delay_ms = 0;
    s_want_connect = true;
    if (!s_started) {
        if (esp_wifi_start() != ESP_OK) {
            return false;
        }
    } else {
        esp_wifi_connect();
    }
    EventBits_t bits = xEventGroupWaitBits(s_events, BIT_GOT_IP, pdFALSE, pdTRUE,
                                           pdMS_TO_TICKS(timeout_ms));
    if (!(bits & BIT_GOT_IP)) {
        net_wifi_off();
        return false;
    }
    return true;
}

void net_parallel_connect_start(const wifi_config_t *cfg, uint32_t retry_delay_ms)
{
    wifi_config_t c = *cfg;
    esp_wifi_set_config(WIFI_IF_STA, &c);
    s_retry_delay_ms = retry_delay_ms;
    s_want_connect = true;
    esp_wifi_connect();
}

void net_set_auto_reconnect(uint32_t retry_delay_ms)
{
    s_retry_delay_ms = retry_delay_ms;
    s_want_connect = true;
    if (s_started && !s_connected) {
        esp_wifi_connect();
    }
}

static bool wait_disconnected(uint32_t timeout_ms)
{
    for (uint32_t t = 0; s_connected && t < timeout_ms; t += 50) {
        vTaskDelay(pdMS_TO_TICKS(50));
    }
    return !s_connected;
}

static net_wifi_fail_t map_reason(uint8_t reason)
{
    switch (reason) {
    case WIFI_REASON_AUTH_FAIL:
    case WIFI_REASON_AUTH_EXPIRE:
    case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
    case WIFI_REASON_HANDSHAKE_TIMEOUT:
    case WIFI_REASON_MIC_FAILURE:
        return NET_WIFI_FAIL_AUTH;
    case WIFI_REASON_NO_AP_FOUND:
    case WIFI_REASON_NO_AP_FOUND_W_COMPATIBLE_SECURITY:
    case WIFI_REASON_NO_AP_FOUND_IN_AUTHMODE_THRESHOLD:
    case WIFI_REASON_NO_AP_FOUND_IN_RSSI_THRESHOLD:
        return NET_WIFI_FAIL_NOT_FOUND;
    default:
        return NET_WIFI_FAIL_TIMEOUT;
    }
}

// Laufende Verbindung oder laufenden Verbindungsversuch abbrechen. Waehrend die STA
// verbindet, lehnt esp_wifi_set_config() neue Daten ab ("sta is connecting").
static void sta_stop_connecting(void)
{
    s_want_connect = false;
    esp_timer_stop(s_retry_timer);
    esp_wifi_disconnect();
    wait_disconnected(3000);
    vTaskDelay(pdMS_TO_TICKS(100));  // Treiber den Abbruch abschliessen lassen
}

net_wifi_fail_t net_wifi_try(const wifi_config_t *cfg, uint32_t timeout_ms)
{
    // Bestehende HTTPS-Verbindung gehoert zum alten Netz
    http_release();
    sta_stop_connecting();
    // Nur im RAM setzen, NVS behaelt die bisherigen Daten
    esp_wifi_set_storage(WIFI_STORAGE_RAM);
    wifi_config_t c = *cfg;
    esp_err_t err = esp_wifi_set_config(WIFI_IF_STA, &c);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "WLAN-Daten setzen fehlgeschlagen: %s", esp_err_to_name(err));
        return NET_WIFI_FAIL_TIMEOUT;
    }

    s_last_reason = 0;
    xEventGroupClearBits(s_events, BIT_GOT_IP);
    s_retry_delay_ms = 1000;
    s_want_connect = true;
    esp_wifi_connect();
    EventBits_t bits = xEventGroupWaitBits(s_events, BIT_GOT_IP, pdFALSE, pdTRUE, pdMS_TO_TICKS(timeout_ms));
    if (bits & BIT_GOT_IP) {
        return NET_WIFI_OK;
    }
    return map_reason(s_last_reason);
}

void net_wifi_restore(const wifi_config_t *cfg, uint32_t timeout_ms)
{
    http_release();
    sta_stop_connecting();
    // Bisherige Daten direkt setzen und ins NVS schreiben, nicht die aktuelle (fehlgeschlagene)
    // Konfiguration uebernehmen
    esp_wifi_set_storage(WIFI_STORAGE_FLASH);
    wifi_config_t c = *cfg;
    esp_err_t err = esp_wifi_set_config(WIFI_IF_STA, &c);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Bisheriges WLAN setzen fehlgeschlagen: %s", esp_err_to_name(err));
        return;
    }
    xEventGroupClearBits(s_events, BIT_GOT_IP);
    s_retry_delay_ms = 1000;
    s_want_connect = true;
    esp_wifi_connect();
    xEventGroupWaitBits(s_events, BIT_GOT_IP, pdFALSE, pdTRUE, pdMS_TO_TICKS(timeout_ms));
}

void net_wifi_commit(void)
{
    wifi_config_t cur;
    esp_wifi_set_storage(WIFI_STORAGE_FLASH);
    if (esp_wifi_get_config(WIFI_IF_STA, &cur) == ESP_OK) {
        esp_wifi_set_config(WIFI_IF_STA, &cur);  // schreibt ins NVS
    }
}

void net_parallel_connect_stop(void)
{
    s_want_connect = false;
    esp_timer_stop(s_retry_timer);
    s_retry_delay_ms = 0;
}

static void http_release(void)
{
    if (s_http) {
        esp_http_client_cleanup(s_http);
        s_http = NULL;
    }
}

void net_http_close(void)
{
    http_release();
}

void net_wifi_off(void)
{
    http_release();
    net_parallel_connect_stop();
    if (s_started) {
        esp_wifi_disconnect();
        esp_wifi_stop();
    }
    s_connected = false;
}

bool net_wifi_connected(void) { return s_connected; }
const char *net_ip_str(void)  { return s_ip; }

static bool clock_valid(void) { return time(NULL) >= 24 * 3600; }

time_sync_result_t net_time_sync(uint32_t sync_timeout_ms, uint32_t invalid_timeout_ms)
{
    setenv("TZ", TZ_INFO, 1);
    tzset();

    if (s_sntp_inited) {
        esp_netif_sntp_deinit();
    }
    // COMPLETED wird nur einmal gemeldet; alten Status aus einem frueheren Zyklus verwerfen
    esp_sntp_get_sync_status();

    esp_sntp_config_t cfg = ESP_NETIF_SNTP_DEFAULT_CONFIG_MULTIPLE(
        2, ESP_SNTP_SERVER_LIST("pool.ntp.org", "time.nist.gov"));
    s_sntp_inited = (esp_netif_sntp_init(&cfg) == ESP_OK);
    if (!s_sntp_inited) {
        return clock_valid() ? TIME_FALLBACK : TIME_INVALID;
    }

    // Ohne 32-kHz-Quarz driftet die Uhr im Deep Sleep um einige Prozent,
    // daher auf einen echten Sync warten und nur bei Timeout auf die Uhr zurueckfallen.
    // lwIP fragt nach einer verlorenen Anfrage erst nach SNTP_RECV_TIMEOUT (15 s) erneut.
    // Direkt nach dem Verbinden geht die erste Anfrage im Akkubetrieb oft verloren,
    // deshalb die Anfrage selbst in kurzen Abstaenden neu anstossen.
    int64_t start = esp_timer_get_time();
    int64_t last_restart = start;
    int attempts = 1;
    for (;;) {
        if (esp_sntp_get_sync_status() == SNTP_SYNC_STATUS_COMPLETED) {
            ESP_LOGI(TAG, "SNTP-Sync nach %lu ms (%d. Anfrage)",
                     (unsigned long)((esp_timer_get_time() - start) / 1000), attempts);
            return TIME_SYNCED;
        }
        int64_t now = esp_timer_get_time();
        uint32_t elapsed_ms = (uint32_t)((now - start) / 1000);
        uint32_t limit_ms = clock_valid() ? sync_timeout_ms : invalid_timeout_ms;
        if (elapsed_ms >= limit_ms) {
            ESP_LOGW(TAG, "SNTP: kein Sync nach %lu ms und %d Anfragen", (unsigned long)elapsed_ms, attempts);
            return clock_valid() ? TIME_FALLBACK : TIME_INVALID;
        }
        if (now - last_restart >= (int64_t)SNTP_RESEND_MS * 1000) {
            esp_sntp_restart();
            last_restart = now;
            attempts++;
        }
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

static esp_err_t http_event(esp_http_client_event_t *e)
{
    if (e->event_id == HTTP_EVENT_ON_DATA && s_resp.buf && s_resp.cap > 0) {
        size_t room = s_resp.cap - 1 - s_resp.len;
        size_t n = (size_t)e->data_len < room ? (size_t)e->data_len : room;
        memcpy(s_resp.buf + s_resp.len, e->data, n);
        s_resp.len += n;
        s_resp.buf[s_resp.len] = '\0';
    }
    return ESP_OK;
}

typedef enum {
    RETRY_NONE,       // Antwort erhalten oder unklar, ob der Request ankam: nicht wiederholen
    RETRY_IMMEDIATE,  // wiederverwendete Verbindung war vom Server geschlossen
    RETRY_DELAYED,    // Request kam sicher nicht an (Verbindungsaufbau/Senden gescheitert)
} retry_t;

static int http_request_once(esp_http_client_method_t method, const char *url, const char *body,
                             bool auth, retry_t *retry)
{
    *retry = RETRY_NONE;
    bool reused = (s_http != NULL);
    if (!s_http) {
        esp_http_client_config_t cfg = {
            .url = url,
            .method = HTTP_METHOD_POST,
            .timeout_ms = HTTP_TIMEOUT_MS,
            .keep_alive_enable = true,
            .crt_bundle_attach = esp_crt_bundle_attach,
            .event_handler = http_event,
        };
        s_http = esp_http_client_init(&cfg);
        if (!s_http) {
            *retry = RETRY_DELAYED;
            return -1;
        }
        esp_http_client_set_header(s_http, "Content-Type", "application/json");
    }
    // Gleicher Host: die bestehende Verbindung bleibt offen
    esp_http_client_set_url(s_http, url);
    esp_http_client_set_method(s_http, method);
    esp_http_client_set_post_field(s_http, body, body ? (int)strlen(body) : 0);
    if (auth && device_token()[0]) {
        char hdr[DEVICE_TOKEN_MAX + 8];
        snprintf(hdr, sizeof(hdr), "Bearer %s", device_token());
        esp_http_client_set_header(s_http, "Authorization", hdr);
    } else {
        esp_http_client_delete_header(s_http, "Authorization");
    }
    if (s_resp.buf) {
        s_resp.len = 0;
        s_resp.buf[0] = '\0';
    }

    esp_err_t err = esp_http_client_perform(s_http);
    if (err == ESP_OK) {
        return esp_http_client_get_status_code(s_http);
    }

    // Bei 401 versucht esp_http_client Basic/Digest-Auth und bricht ohne passenden
    // WWW-Authenticate-Header mit ESP_ERR_NOT_SUPPORTED ab. Der Status ist dann schon
    // gelesen. Ein veralteter 401 ist ausgeschlossen: nach jedem Fehler wird der Client neu angelegt.
    if (esp_http_client_get_status_code(s_http) == 401) {
        http_release();
        return 401;
    }

    ESP_LOGW(TAG, "HTTP: %s", esp_err_to_name(err));
    // Verbindung ist in unbekanntem Zustand, beim naechsten Versuch neu aufbauen
    http_release();

    if (err == ESP_ERR_HTTP_CONNECT) {
        *retry = RETRY_DELAYED;
    } else if (err == ESP_ERR_HTTP_WRITE_DATA) {
        // Request unvollstaendig gesendet, der Server verwirft ihn
        *retry = reused ? RETRY_IMMEDIATE : RETRY_DELAYED;
    } else if (err == ESP_ERR_HTTP_CONNECTION_CLOSED && reused) {
        // Keep-Alive-Verbindung war schon vom Server geschlossen
        *retry = RETRY_IMMEDIATE;
    }
    // Codes wie Arduino HTTPClient: -1 Verbindung, -11 Timeout
    return (err == ESP_ERR_TIMEOUT || err == ESP_ERR_HTTP_EAGAIN ||
            err == ESP_ERR_HTTP_READ_TIMEOUT) ? -11 : -1;
}

static int http_request(esp_http_client_method_t method, const char *path, const char *body,
                        bool auth, char *resp, size_t resp_len)
{
    if (!s_connected) {
        return -1;
    }
    char url[URL_MAX];
    snprintf(url, sizeof(url), "%s%s", CONFIG_CALLGREEN_BASE_URL, path);
    s_resp.buf = resp;
    s_resp.cap = resp ? resp_len : 0;
    s_resp.len = 0;

    retry_t retry;
    int code = http_request_once(method, url, body, auth, &retry);
    if (retry != RETRY_NONE) {
        if (retry == RETRY_IMMEDIATE) {
            ESP_LOGW(TAG, "Keep-Alive-Verbindung geschlossen, verbinde sofort neu");
        } else {
            ESP_LOGW(TAG, "Request nicht gesendet (%d), Wiederholung in 1 s", code);
            vTaskDelay(pdMS_TO_TICKS(HTTP_RETRY_DELAY_MS));
        }
        code = s_connected ? http_request_once(method, url, body, auth, &retry) : -1;
    }
    s_resp.buf = NULL;
    s_resp.cap = 0;

    if (code == 401 && auth) {
        // Vertrag v7 §10 mit v8: Token loeschen, NICHT ZUGEORDNET, Puffer leeren
        ESP_LOGE(TAG, "%s: 401, device_token abgelehnt", path);
        device_clear_token("401 von Backend");
        if (g_persist.buf_count > 0) {
            ESP_LOGW(TAG, "401: %u gepufferte Messungen verworfen", g_persist.buf_count);
            buf_clear();
        }
    }
    return code;
}

int net_post_json(const char *path, const char *body, bool auth, char *resp, size_t resp_len)
{
    return http_request(HTTP_METHOD_POST, path, body, auth, resp, resp_len);
}

int net_get_json(const char *path, bool auth, char *resp, size_t resp_len)
{
    return http_request(HTTP_METHOD_GET, path, NULL, auth, resp, resp_len);
}
