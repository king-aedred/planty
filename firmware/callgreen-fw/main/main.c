/*
 * Callgreen Firmware v7 (ESP-IDF), Hardware Rev. v3
 * Phase A: Geraeteidentitaet, Zustaende, BLE-Onboarding, Claim.
 * Phase B: Messen mit WLAN aus, Puffer, POST /readings/batch, Backoff, Akkuschutz.
 * Phase C: Befehle (GET /device/commands, Ack), Online-Modus bei USB.
 * Phase D: OTA mit sha256-Pruefung und Rollback.
 */
#include <stdbool.h>
#include <stdint.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_system.h"
#include "sdkconfig.h"
#include "commands.h"
#include "config.h"
#include "cycle.h"
#include "device.h"
#include "net.h"
#include "onboarding.h"
#include "online.h"
#include "ota.h"
#include "power.h"
#include "sensors.h"
#include "state.h"
#include "version.h"

static const char *TAG = "main";

#define SETTLE_TEST_SLEEP_S    (30 * 60)
#define COLD_BOOT_BLE_WINDOW_S (10 * 60)
#define ONB_FAILED_WAIT_MS     60000

void app_main(void)
{
    // Sensor-FET zuerst definiert ausschalten, bevor irgendwas anderes passiert
    sensors_gate_init_off();

    // Nach Deep Sleep braucht USB-Serial/JTAG etwas, bis der Host wieder verbunden ist
    vTaskDelay(pdMS_TO_TICKS(2000));
    ESP_LOGI(TAG, "--- Callgreen v%s (HW %s): Aufwachen ---", CALLGREEN_FW_VERSION, CALLGREEN_HW_REV);
    power_log_wakeup_causes();

    if (state_begin()) {
        ESP_LOGW(TAG, "Kaltstart: RTC-Zustand und Messpuffer zurueckgesetzt");
    }
    sensors_init();

#if CONFIG_CALLGREEN_SETTLE_TEST
    cycle_settle_test();
    power_deep_sleep(SETTLE_TEST_SLEEP_S);
#else
    const char *wake_cause = power_wake_cause();
    if (!net_init()) {
        ESP_LOGE(TAG, "Netzwerk-Init fehlgeschlagen");
        power_deep_sleep(30 * 60);
    }
    device_init();
    config_init();
    ota_boot_check();

    // Kaltstart (Zelle eingesetzt) ohne WLAN-Daten: 10 min BLE auch ohne USB
    bool ble_window = (esp_reset_reason() == ESP_RST_POWERON) && device_state() == DEV_NEW;

    for (;;) {
        dev_state_t st = device_state();
        bool usb = sensors_vbus_present();

        if (st == DEV_ACTIVE) {
            ESP_LOGW(TAG, "Modus: %s + AKTIV -> Messzyklus", usb ? "USB" : "Akku");
            cycle_result_t r = cycle_run(wake_cause, usb);
            wake_cause = "timer";  // weitere Zyklen in diesem Boot laufen nach Plan
            if (r.wifi_ok && r.commands_pending && device_state() == DEV_ACTIVE) {
                // Auch im Akkubetrieb sofort abholen (Vertrag v7 §5)
                commands_poll(sensors_vbus_present());
            }
            if (r.wifi_ok && device_state() == DEV_ACTIVE &&
                ota_process_offer(sensors_vbus_present()) == OTA_R_INSTALLED) {
                ota_restart();
            }
            if (device_state() != DEV_ACTIVE) {
                net_wifi_off();
                continue;  // 401: neu entscheiden
            }
            if (!sensors_vbus_present()) {
                net_wifi_off();
                power_deep_sleep(r.sleep_s);
            }
            if (!r.wifi_ok) {
                ESP_LOGW(TAG, "Modus: USB + AKTIV, WLAN nicht erreichbar -> BLE-Onboarding, parallel WLAN");
                onboarding_run(0);
                continue;
            }
            uint64_t remaining_s = 0;
            online_result_t o = online_run(r.sleep_s, &remaining_s);
            if (o == ONLINE_UNPLUGGED) {
                net_wifi_off();
                power_deep_sleep(remaining_s);
            }
            if (o == ONLINE_WIFI_LOST) {
                net_wifi_off();
                ESP_LOGW(TAG, "Modus: USB + AKTIV, WLAN verloren -> BLE-Onboarding, parallel WLAN");
                onboarding_run(0);
            } else {
                net_wifi_off();
            }
            continue;
        }

        if (usb) {
            ESP_LOGW(TAG, "Modus: USB + %s -> BLE-Onboarding", device_state_name(st));
        } else if (ble_window) {
            ESP_LOGW(TAG, "Modus: Kaltstart ohne WLAN-Daten -> BLE fuer %d min", COLD_BOOT_BLE_WINDOW_S / 60);
        } else {
            ESP_LOGW(TAG, "Modus: Akku + %s -> Deep Sleep, nur USB weckt", device_state_name(st));
            power_deep_sleep_usb_only();
        }

        onb_result_t res = onboarding_run(ble_window && !usb ? COLD_BOOT_BLE_WINDOW_S : 0);
        ble_window = false;
        if (res == ONB_FAILED) {
            ESP_LOGE(TAG, "Onboarding fehlgeschlagen, neuer Versuch in %d s", ONB_FAILED_WAIT_MS / 1000);
            vTaskDelay(pdMS_TO_TICKS(ONB_FAILED_WAIT_MS));
        }
    }
#endif
}
