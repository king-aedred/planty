#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "esp_wifi_types.h"

// NVS, Netif, Event-Loop, WLAN-Treiber. Idempotent.
bool net_init(void);

// Gespeicherte WLAN-Daten (NVS) lesen. out darf NULL sein.
bool net_get_stored_wifi(wifi_config_t *out);

// Mit den gespeicherten WLAN-Daten verbinden. true bei IP innerhalb des Timeouts.
bool net_wifi_connect(uint32_t timeout_ms);
void net_wifi_off(void);

// Waehrend des BLE-Onboardings: gespeichertes WLAN parallel versuchen,
// nach Fehlschlag alle retry_delay_ms erneut
void net_parallel_connect_start(const wifi_config_t *cfg, uint32_t retry_delay_ms);
void net_parallel_connect_stop(void);

// POST an CONFIG_CALLGREEN_BASE_URL + path. auth = Bearer device_token mitsenden.
// Antwort-Body landet (gekuerzt) in resp, falls nicht NULL. 401 loescht das device_token.
// Rueckgabe HTTP-Status oder negativ bei Transportfehler.
int net_post_json(const char *path, const char *body, bool auth, char *resp, size_t resp_len);

// GET an CONFIG_CALLGREEN_BASE_URL + path, sonst wie net_post_json
int net_get_json(const char *path, bool auth, char *resp, size_t resp_len);

// Offene HTTPS-Verbindung schliessen (gibt den TLS-Speicher frei)
void net_http_close(void);

// Online-Modus: bei Verbindungsverlust alle retry_delay_ms neu verbinden
void net_set_auto_reconnect(uint32_t retry_delay_ms);

typedef enum {
    NET_WIFI_OK,
    NET_WIFI_FAIL_AUTH,       // falsches Passwort
    NET_WIFI_FAIL_NOT_FOUND,  // Netz nicht gefunden
    NET_WIFI_FAIL_TIMEOUT,    // keine IP innerhalb der Zeit
} net_wifi_fail_t;

// set_wifi: neue WLAN-Daten nur im RAM setzen und verbinden (NVS bleibt unveraendert).
// Danach entweder net_wifi_commit() oder mit den alten Daten erneut net_wifi_try().
net_wifi_fail_t net_wifi_try(const wifi_config_t *cfg, uint32_t timeout_ms);
// Aktuelle WLAN-Daten ins NVS uebernehmen
void net_wifi_commit(void);
bool net_wifi_connected(void);
const char *net_ip_str(void);

typedef enum {
    TIME_SYNCED,    // echter SNTP-Sync
    TIME_FALLBACK,  // kein Sync, weiterlaufende Uhr aus dem Deep Sleep (RC-Drift moeglich)
    TIME_INVALID,   // weder Sync noch gueltige Uhr
} time_sync_result_t;

// NTP mit TZ "CET-1CEST,M3.5.0,M10.5.0/3". Wartet bis sync_timeout_ms auf einen echten
// Sync. Ist die Uhr noch gar nicht gesetzt (Kaltstart), wird bis invalid_timeout_ms gewartet.
time_sync_result_t net_time_sync(uint32_t sync_timeout_ms, uint32_t invalid_timeout_ms);
