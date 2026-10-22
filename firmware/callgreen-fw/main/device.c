#include "device.h"

#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "nvs.h"
#include "net.h"
#include "state.h"

static const char *TAG = "device";

#define NVS_NAMESPACE "callgreen"
#define NVS_KEY_TOKEN "dev_token"

static char s_device_id[16];
static char s_ble_name[20];
static char s_token[DEVICE_TOKEN_MAX + 1];
static bool s_has_wifi;
static dev_state_t s_state;

const char *device_state_name(dev_state_t state)
{
    switch (state) {
    case DEV_NEW:       return "NEU";
    case DEV_ACTIVE:    return "AKTIV";
    case DEV_UNCLAIMED: return "NICHT ZUGEORDNET";
    }
    return "?";
}

static dev_state_t derive_state(void)
{
    if (!s_has_wifi) return DEV_NEW;
    return s_token[0] ? DEV_ACTIVE : DEV_UNCLAIMED;
}

static void update_state(const char *reason)
{
    dev_state_t next = derive_state();
    if (next != s_state) {
        ESP_LOGW(TAG, "Zustand: %s -> %s (%s)", device_state_name(s_state),
                 device_state_name(next), reason);
        s_state = next;
    }
}

void device_redact(const char *secret, char *out, int out_len)
{
    if (!secret || !secret[0]) {
        snprintf(out, out_len, "(leer)");
        return;
    }
    snprintf(out, out_len, "%.4s... (%u Zeichen)", secret, (unsigned)strlen(secret));
}

void device_init(void)
{
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(s_device_id, sizeof(s_device_id), "cg-%02X%02X%02X", mac[3], mac[4], mac[5]);
    snprintf(s_ble_name, sizeof(s_ble_name), "CALLGREEN-%02X%02X%02X", mac[3], mac[4], mac[5]);

    s_token[0] = '\0';
    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE, NVS_READONLY, &h) == ESP_OK) {
        size_t len = sizeof(s_token);
        if (nvs_get_str(h, NVS_KEY_TOKEN, s_token, &len) != ESP_OK) {
            s_token[0] = '\0';
        }
        nvs_close(h);
    }
    s_has_wifi = net_get_stored_wifi(NULL);
    s_state = derive_state();

    char red[32];
    device_redact(s_token, red, sizeof(red));
    ESP_LOGI(TAG, "device_id %s, BLE-Name %s", s_device_id, s_ble_name);
    ESP_LOGI(TAG, "Zustand: %s (WLAN-Daten: %s, device_token: %s)",
             device_state_name(s_state), s_has_wifi ? "ja" : "nein", red);
}

const char *device_id(void)       { return s_device_id; }
const char *device_ble_name(void) { return s_ble_name; }
dev_state_t device_state(void)    { return s_state; }
const char *device_token(void)    { return s_token; }

bool device_set_token(const char *token, const char *reason)
{
    size_t len = strlen(token);
    if (len == 0 || len > DEVICE_TOKEN_MAX) {
        ESP_LOGE(TAG, "device_token mit Laenge %u abgelehnt", (unsigned)len);
        return false;
    }
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &h);
    if (err == ESP_OK) {
        err = nvs_set_str(h, NVS_KEY_TOKEN, token);
        if (err == ESP_OK) err = nvs_commit(h);
        nvs_close(h);
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "device_token speichern: %s", esp_err_to_name(err));
        return false;
    }
    strlcpy(s_token, token, sizeof(s_token));
    char red[32];
    device_redact(s_token, red, sizeof(red));
    ESP_LOGI(TAG, "device_token gespeichert: %s", red);
    update_state(reason);
    return true;
}

void device_clear_token(const char *reason)
{
    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE, NVS_READWRITE, &h) == ESP_OK) {
        nvs_erase_key(h, NVS_KEY_TOKEN);
        nvs_commit(h);
        nvs_close(h);
    }
    s_token[0] = '\0';
    ESP_LOGW(TAG, "device_token geloescht");
    update_state(reason);
}

void device_factory_reset(void)
{
    ESP_LOGW(TAG, "factory_reset: loesche device_token und WLAN-Daten, seq-Zaehler bleibt");
    device_clear_token("factory_reset");
    // Setzt alle WLAN-Einstellungen im NVS zurueck
    esp_err_t err = esp_wifi_restore();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_wifi_restore: %s", esp_err_to_name(err));
    }
    device_set_wifi_present(false, "factory_reset");
    buf_clear();
    ESP_LOGW(TAG, "factory_reset fertig, Neustart");
    fflush(stdout);
    vTaskDelay(pdMS_TO_TICKS(200));
    esp_restart();
}

void device_set_wifi_present(bool present, const char *reason)
{
    s_has_wifi = present;
    update_state(reason);
}
