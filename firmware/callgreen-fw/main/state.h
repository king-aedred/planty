#pragma once

#include <stdbool.h>
#include <stdint.h>

// Persistenter Zustand ueber Deep Sleep (RTC-RAM). Geht beim Abklemmen der Zelle verloren.
#define RTC_MAGIC 0x43470702  // "CG" v7, Layout 2

// error_flags laut Vertrag Abschnitt 5
#define FLAG_WIFI_FAILED      0x01
#define FLAG_TIME_SYNC_FAILED 0x02
#define FLAG_AHT20_MISSING    0x04
#define FLAG_BH1750_MISSING   0x08
#define FLAG_SEND_FAILED      0x10
#define FLAG_COLD_BOOT        0x40
#define FLAG_SLEEP_PROBLEM    0x80

#define READING_BUF_MAX 24

// reading_t.flags
#define RD_TIME_SYNCED 0x01
#define RD_CHARGING    0x02
#define RD_USB         0x04
#define RD_HAS_TEMP    0x08
#define RD_HAS_HUM     0x10
#define RD_HAS_LUX     0x20
#define RD_HAS_MOIST   0x40

typedef struct {
    uint32_t seq;
    uint32_t measured_at;   // Unix-Sekunden UTC
    uint16_t moisture_raw;
    uint16_t moisture_raw_min;
    uint16_t moisture_raw_max;
    uint16_t battery_mv;
    float    temperature_c;
    float    humidity_pct;
    uint32_t lux;
    uint8_t  moisture_pct;
    uint8_t  flags;
} reading_t;

typedef struct {
    uint32_t  magic;
    uint32_t  boot_count;
    uint8_t   error_flags;
    uint8_t   wifi_fail_count;
    uint32_t  next_wifi_at;  // Unix-Sekunden, 0 = sofort (Backoff nach WLAN-Fehler)
    uint32_t  seq_next;      // 0 = aus dem NVS neu reservieren
    uint32_t  seq_limit;
    uint8_t   buf_count;
    reading_t buf[READING_BUF_MAX];  // aelteste zuerst
} persist_t;

extern persist_t g_persist;

// Prueft das Magic. Bei Kaltstart Zustand zuruecksetzen und FLAG_COLD_BOOT setzen.
// Rueckgabe: true = Kaltstart.
bool state_begin(void);
void state_set_flag(uint8_t flag);

// Naechste seq. Wird im NVS blockweise vorreserviert (ueberlebt Stromverlust).
// Braucht initialisiertes NVS.
uint32_t state_next_seq(void);

// Messpuffer. push verwirft bei Ueberlauf die aelteste Messung und liefert deren Anzahl.
int        buf_push(const reading_t *r);
reading_t *buf_find(uint32_t seq);
void       buf_remove_seqs(const uint32_t *seqs, int n);
void       buf_clear(void);
