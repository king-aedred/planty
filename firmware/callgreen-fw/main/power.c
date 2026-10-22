#include "power.h"

#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_sleep.h"
#include "sensors.h"

static const char *TAG = "power";

#define PIN_VBUS             GPIO_NUM_5
#define USB_ONLY_FALLBACK_S  (6 * 3600)

void power_log_wakeup_causes(void)
{
    uint32_t causes = esp_sleep_get_wakeup_causes();
    if (causes & (1UL << ESP_SLEEP_WAKEUP_GPIO)) {
        ESP_LOGI(TAG, "Weckgrund: GPIO (USB eingesteckt), Maske 0x%08lx", (unsigned long)causes);
    } else if (causes & (1UL << ESP_SLEEP_WAKEUP_TIMER)) {
        ESP_LOGI(TAG, "Weckgrund: Timer, Maske 0x%08lx", (unsigned long)causes);
    } else {
        ESP_LOGI(TAG, "Weckgrund: kein Deep-Sleep-Wakeup (Reset/Power-on), Maske 0x%08lx",
                 (unsigned long)causes);
    }
}

const char *power_wake_cause(void)
{
    uint32_t causes = esp_sleep_get_wakeup_causes();
    if (causes & (1UL << ESP_SLEEP_WAKEUP_GPIO))  return "usb";
    if (causes & (1UL << ESP_SLEEP_WAKEUP_TIMER)) return "timer";
    return "cold_boot";
}

void power_deep_sleep(uint64_t seconds)
{
    ESP_LOGI(TAG, "Schlafe %llu Min %llu Sek", seconds / 60, seconds % 60);

    // Externer Pull-up haelt das Gate auch im Deep Sleep oben
    sensors_gate_off();

    esp_sleep_enable_timer_wakeup(seconds * 1000000ULL);
    esp_err_t err = esp_sleep_enable_gpio_wakeup_on_hp_periph_powerdown(1ULL << PIN_VBUS,
                                                                        ESP_GPIO_WAKEUP_GPIO_HIGH);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "GPIO-Wakeup IO5: %s, nur Timer aktiv", esp_err_to_name(err));
    }
    fflush(stdout);
    vTaskDelay(pdMS_TO_TICKS(50));
    esp_deep_sleep_start();
}

void power_deep_sleep_usb_only(void)
{
    ESP_LOGI(TAG, "Schlafe ohne Timer, nur USB-Einstecken weckt");
    sensors_gate_off();

    esp_err_t err = esp_sleep_enable_gpio_wakeup_on_hp_periph_powerdown(1ULL << PIN_VBUS,
                                                                        ESP_GPIO_WAKEUP_GPIO_HIGH);
    if (err != ESP_OK) {
        // Ohne GPIO-Wakeup wuerde das Geraet nie wieder aufwachen
        ESP_LOGE(TAG, "GPIO-Wakeup IO5: %s, Fallback Timer %d h", esp_err_to_name(err),
                 USB_ONLY_FALLBACK_S / 3600);
        esp_sleep_enable_timer_wakeup(USB_ONLY_FALLBACK_S * 1000000ULL);
    }
    fflush(stdout);
    vTaskDelay(pdMS_TO_TICKS(50));
    esp_deep_sleep_start();
}
