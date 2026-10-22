#pragma once

#include <stdint.h>

typedef enum {
    ONB_CLAIMED,     // Claim ok, Zustand AKTIV (BLE nach 60 s Nachlauf beendet)
    ONB_WIFI_READY,  // Zustand AKTIV und WLAN verbunden, BLE nicht mehr noetig
    ONB_UNPLUGGED,   // USB abgezogen
    ONB_TIMEOUT,     // Kaltstart-Fenster ohne USB abgelaufen
    ONB_FAILED,      // Provisioning liess sich nicht starten
} onb_result_t;

// BLE-Onboarding (Vertrag Abschnitt 4). Laeuft, solange USB steckt. Ist
// battery_window_s > 0, darf es auch ohne USB so lange laufen (Kaltstart ohne WLAN-Daten).
// Gespeichertes WLAN wird parallel weiter versucht.
// Ein zweiter Aufruf im selben Boot startet das Geraet neu (BT-Speicher wurde freigegeben).
onb_result_t onboarding_run(uint32_t battery_window_s);
