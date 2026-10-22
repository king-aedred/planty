#pragma once

#include <stdbool.h>

// Gate des Bodenfeuchtesensors als Ausgang konfigurieren und definiert AUS (HIGH).
// Muss als Erstes nach dem Aufwachen laufen.
void sensors_gate_init_off(void);
void sensors_gate_on(void);   // LOW = Sensor AN
void sensors_gate_off(void);  // HIGH = Sensor AUS

// GPIO-Eingaenge (CHRG, VBUS) und ADC. Fehler werden geloggt, kein Abbruch.
void sensors_init(void);

bool sensors_vbus_present(void);  // IO5 HIGH = USB steckt
bool sensors_is_charging(void);   // IO0 LOW = laedt

int   sensors_moisture_raw(void);      // Einzelwert, -1 bei Fehler
// samples Rohwerte im Abstand interval_ms, Median, Min, Max. false, wenn kein Wert lesbar.
bool  sensors_moisture_sample(int samples, int interval_ms, int *median, int *min, int *max);
int   sensors_moisture_pct_from_raw(int raw);  // Kalibrierung, 0..100
float sensors_battery_v(void);         // kalibriert, 8 Samples, mal 2

// I2C-Sensoren. Init gibt false zurueck, wenn der Sensor fehlt.
bool sensors_aht20_init(void);
bool sensors_aht20_read(float *temperature, float *humidity);
bool sensors_bh1750_init(void);
bool sensors_bh1750_read(float *lux);
