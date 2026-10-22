#pragma once

#include <stdbool.h>
#include <stdint.h>

// Konfiguration laut Vertrag Abschnitt 8. Fehlende Felder behalten den bisherigen Wert.
typedef struct {
    uint32_t settle_ms;
    uint32_t samples;
    float    low_battery_v;
    float    critical_battery_v;
    uint32_t online_poll_s;
} cg_config_t;

// Aus dem NVS laden, sonst Standardwerte
void config_init(void);
const cg_config_t *config_get(void);

typedef enum {
    CONFIG_OK,       // alle vorhandenen Felder gueltig
    CONFIG_PARTIAL,  // gueltige und ungueltige Felder
    CONFIG_INVALID,  // nur ungueltige Felder
    CONFIG_EMPTY,    // kein bekanntes Feld oder kein Objekt
} config_result_t;

// "config"-Objekt aus einer Backend-Antwort (cJSON *) uebernehmen.
// Ungueltige Werte werden ignoriert. Speichert nur bei Aenderung.
config_result_t config_apply_json(const void *cjson_obj, const char *source);
