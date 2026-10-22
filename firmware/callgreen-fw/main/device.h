#pragma once

#include <stdbool.h>

// Geraetezustand laut Vertrag Abschnitt 2. Wird aus dem NVS-Inhalt abgeleitet:
// WLAN-Daten (vom Provisioning im NVS verwaltet) und device_token.
typedef enum {
    DEV_NEW,         // keine WLAN-Daten
    DEV_ACTIVE,      // WLAN-Daten und device_token
    DEV_UNCLAIMED,   // WLAN-Daten, aber kein (gueltiges) device_token
} dev_state_t;

#define DEVICE_TOKEN_MAX 64

// Nach net_init() aufrufen (liest gespeicherte WLAN-Daten und Token)
void device_init(void);

const char *device_id(void);        // "cg-XXXXXX"
const char *device_ble_name(void);  // "CALLGREEN-XXXXXX"

dev_state_t device_state(void);
const char *device_state_name(dev_state_t state);

const char *device_token(void);     // "" wenn keins
bool device_set_token(const char *token, const char *reason);
void device_clear_token(const char *reason);

// Befehl factory_reset: Token und WLAN-Daten loeschen, RTC-Puffer leeren, Neustart.
// seq-Zaehler und config bleiben. Kehrt nicht zurueck.
void device_factory_reset(void) __attribute__((noreturn));

// Vom Onboarding, wenn neue WLAN-Daten erfolgreich verbunden wurden
void device_set_wifi_present(bool present, const char *reason);

// Fuer Logs: erste 4 Zeichen, Rest gekuerzt
void device_redact(const char *secret, char *out, int out_len);
