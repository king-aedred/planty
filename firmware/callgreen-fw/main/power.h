#pragma once

#include <stdint.h>

// Weckgrund(e) per esp_sleep_get_wakeup_causes() auswerten und loggen
void power_log_wakeup_causes(void);

// wake_cause fuer /readings/batch: "usb", "timer" oder "cold_boot"
const char *power_wake_cause(void);

// Sensor aus, Timer-Wakeup + GPIO-Wakeup IO5 HIGH, Deep Sleep. Kehrt nicht zurueck.
void power_deep_sleep(uint64_t seconds) __attribute__((noreturn));

// Deep Sleep ohne Timer, nur GPIO-Wakeup IO5 HIGH (Zustand NEU / NICHT ZUGEORDNET)
void power_deep_sleep_usb_only(void) __attribute__((noreturn));
