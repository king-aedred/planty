#pragma once

#include <stdbool.h>
#include <stdint.h>

// OTA laut Vertrag v7 §7 und v8 Abschnitt 6.

typedef enum {
    OTA_R_INSTALLED,        // ok, ""            : installiert, Neustart folgt (ota_restart)
    OTA_R_NO_UPDATE,        // ok, no_update
    OTA_R_LOW_BATTERY,      // failed, low_battery
    OTA_R_DOWNLOAD_FAILED,  // failed, download_failed
    OTA_R_SHA_MISMATCH,     // failed, sha256_mismatch
    OTA_R_INVALID_IMAGE,    // failed, invalid_image
    OTA_R_SKIPPED,          // nur automatisch: gesperrt oder pausiert, kein Ack
} ota_result_t;

// Beim Start: laufende Partition und Zustand loggen, Rollback erkennen und Version sperren
void ota_boot_check(void);

// Nach der ersten Backend-Antwort 200 aufrufen: neue Firmware als gueltig markieren
void ota_mark_valid_if_pending(void);

// Fuer status.ota_rollback_version im Batch: Version oder NULL. Nach Batch-200 ota_rollback_reported().
const char *ota_rollback_version(void);
void ota_rollback_reported(void);

// "ota"-Objekt aus der Batch-Antwort (cJSON *) als Angebot merken. NULL/null = kein Update.
void ota_set_offer(const void *cjson_obj);

// Gemerktes Angebot aus dem Batch bearbeiten (automatisch, ohne Ack)
ota_result_t ota_process_offer(bool usb);

// GET /firmware/latest und ggf. installieren. forced = ota_now (ignoriert Sperre und Pause).
ota_result_t ota_check_latest(bool usb, bool forced);

bool ota_result_ok(ota_result_t r);
const char *ota_result_detail(ota_result_t r);

// Nach OTA_R_INSTALLED: Neustart in die neue Firmware
void ota_restart(void) __attribute__((noreturn));
