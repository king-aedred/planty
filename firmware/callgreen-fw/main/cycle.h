#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    uint64_t sleep_s;           // Sekunden bis zum naechsten Slot
    bool     wifi_ok;           // WLAN war verbunden
    int      http;              // Ergebnis von /readings/batch (0 = nicht gesendet)
    bool     commands_pending;  // Backend meldet offene Befehle
} cycle_result_t;

// Ein Messzyklus (Vertrag Abschnitt 5): messen mit WLAN aus, puffern, dann ein
// POST /readings/batch mit allen unbestaetigten Messungen. WLAN-Backoff und
// Akkuschutz gelten nur ohne USB. Das WLAN bleibt bei Erfolg verbunden,
// der Aufrufer schaltet es ab (net_wifi_off) oder nutzt es weiter (Befehle, Online-Modus).
cycle_result_t cycle_run(const char *wake_cause, bool usb);

// Settle-Test: Sensor an, 60 s lang alle 100 ms Rohwert loggen, Sensor aus.
void cycle_settle_test(void);
