#include "online.h"

#include <stdbool.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "commands.h"
#include "config.h"
#include "cycle.h"
#include "device.h"
#include "net.h"
#include "ota.h"
#include "sensors.h"

static const char *TAG = "online";

#define POLL_MS           250
#define STATUS_LOG_US     (60LL * 1000000LL)
#define WIFI_LOST_US      (120LL * 1000000LL)
#define RECONNECT_MS      5000

online_result_t online_run(uint64_t slot_in_s, uint64_t *remaining_s)
{
    const cg_config_t *cfg = config_get();
    ESP_LOGW(TAG, "Online-Modus: USB + AKTIV + WLAN, Befehle alle %lu s, naechste Messung in %llu min",
             (unsigned long)cfg->online_poll_s, slot_in_s / 60);
    net_set_auto_reconnect(RECONNECT_MS);

    // Beim Start des Online-Modus nach Updates fragen (Vertrag v7 §7)
    if (ota_check_latest(true, false) == OTA_R_INSTALLED) {
        ota_restart();
    }
    net_set_auto_reconnect(RECONNECT_MS);

    int64_t now = esp_timer_get_time();
    int64_t next_slot = now + (int64_t)slot_in_s * 1000000LL;
    int64_t next_poll = now;  // beim Start sofort abfragen
    int64_t next_log = now;
    int64_t lost_since = 0;
    int low_count = 0;

    for (;;) {
        now = esp_timer_get_time();

        // USB entprellt pruefen
        low_count = sensors_vbus_present() ? 0 : low_count + 1;
        if (low_count >= 2) {
            int64_t rem = next_slot - now;
            *remaining_s = rem > 1000000LL ? (uint64_t)((rem + 999999) / 1000000) : 1;
            ESP_LOGW(TAG, "Online-Modus beendet: USB abgezogen, naechste Messung in %llu s", *remaining_s);
            return ONLINE_UNPLUGGED;
        }
        if (device_state() != DEV_ACTIVE) {
            ESP_LOGW(TAG, "Online-Modus beendet: Zustand %s", device_state_name(device_state()));
            return ONLINE_STATE_CHANGED;
        }

        if (!net_wifi_connected()) {
            if (lost_since == 0) {
                lost_since = now;
                ESP_LOGW(TAG, "WLAN getrennt, verbinde neu");
            } else if (now - lost_since >= WIFI_LOST_US) {
                ESP_LOGW(TAG, "Online-Modus beendet: WLAN seit %lld s weg", (now - lost_since) / 1000000LL);
                return ONLINE_WIFI_LOST;
            }
            vTaskDelay(pdMS_TO_TICKS(POLL_MS));
            continue;
        }
        if (lost_since) {
            ESP_LOGI(TAG, "WLAN wieder verbunden nach %lld s", (now - lost_since) / 1000000LL);
            lost_since = 0;
        }

        // Messung nach Plan
        if (now >= next_slot) {
            cycle_result_t r = cycle_run("timer", true);
            if (ota_process_offer(true) == OTA_R_INSTALLED) {
                ota_restart();
            }
            now = esp_timer_get_time();
            next_slot = now + (int64_t)r.sleep_s * 1000000LL;
            if (r.commands_pending) {
                next_poll = now;
            }
            net_set_auto_reconnect(RECONNECT_MS);
        }

        // Befehle abfragen
        if (now >= next_poll && net_wifi_connected()) {
            commands_poll(true);
            now = esp_timer_get_time();
            next_poll = now + (int64_t)cfg->online_poll_s * 1000000LL;
            // set_wifi oder measure_now koennen die Verbindungsparameter geaendert haben
            net_set_auto_reconnect(RECONNECT_MS);
        }

        if (now >= next_log) {
            ESP_LOGI(TAG, "Online: Akku %.2f V, STAT %s, Heap %lu, naechste Messung in %lld s",
                     sensors_battery_v(), sensors_is_charging() ? "laedt" : "laedt nicht",
                     (unsigned long)esp_get_free_heap_size(), (next_slot - now) / 1000000LL);
            next_log = now + STATUS_LOG_US;
        }
        vTaskDelay(pdMS_TO_TICKS(POLL_MS));
    }
}
