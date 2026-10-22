#pragma once

#include <stdint.h>

typedef enum {
    ONLINE_UNPLUGGED,      // USB abgezogen, Restzeit bis zum naechsten Slot in *remaining_s
    ONLINE_WIFI_LOST,      // WLAN laenger als 2 min weg
    ONLINE_STATE_CHANGED,  // Zustand nicht mehr AKTIV (401)
} online_result_t;

// Online-Modus (Vertrag v7 §2/§6): USB + AKTIV + WLAN. Bleibt verbunden, fragt alle
// online_poll_s GET /device/commands ab, misst weiter nach Plan. Ersetzt den Lademodus aus v6.
// slot_in_s: Sekunden bis zum naechsten Messslot.
online_result_t online_run(uint64_t slot_in_s, uint64_t *remaining_s);
