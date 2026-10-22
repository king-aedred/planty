#include "ota.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "cJSON.h"
#include "esp_app_desc.h"
#include "esp_attr.h"
#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_https_ota.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "esp_system.h"
#include "nvs.h"
#include "psa/crypto.h"
#include "sdkconfig.h"
#include "config.h"
#include "device.h"
#include "net.h"
#include "sensors.h"
#include "version.h"

static const char *TAG = "ota";

#define PROJECT_NAME     "callgreen_fw"
#define OTA_URL_MAX      256
#define OTA_VER_MAX      31
#define OTA_FAIL_MAX     3
#define OTA_PAUSE_S      (24 * 3600)
#define HTTP_TIMEOUT_MS  15000
#define BAT_MARGIN_V     0.2f
#define SHA_CHUNK        4096
#define RESP_MAX         1024
#define NVS_NAMESPACE    "callgreen"
#define NVS_KEY_OTA      "ota_state"
#define STORE_VERSION    1
#define FAIL_MAGIC       0x4F544146  // "OTAF"

typedef struct {
    char     version[OTA_VER_MAX + 1];
    char     url[OTA_URL_MAX + 1];
    char     sha256[65];
    uint32_t size;
} offer_t;

typedef struct {
    uint32_t version;
    char     blocked[OTA_VER_MAX + 1];  // zurueckgerollte Version
    uint8_t  report_pending;            // noch nicht per Batch gemeldet
} ota_store_t;

// Fehlversuche ueber Deep Sleep (geht bei Stromverlust verloren, dann wird einfach neu versucht)
typedef struct {
    uint32_t magic;
    char     version[OTA_VER_MAX + 1];
    uint8_t  count;
    uint32_t retry_after;
} ota_fail_t;

RTC_DATA_ATTR static ota_fail_t s_fail;
static ota_store_t s_store;
static offer_t s_offer;
static bool s_have_offer;
static bool s_pending_verify;

static const char *running_version(void) { return esp_app_get_description()->version; }

static uint32_t now_unix(void)
{
    time_t t = time(NULL);
    return t > 0 ? (uint32_t)t : 0;
}

// ---------- NVS ----------
static void store_save(void)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &h);
    if (err == ESP_OK) {
        err = nvs_set_blob(h, NVS_KEY_OTA, &s_store, sizeof(s_store));
        if (err == ESP_OK) err = nvs_commit(h);
        nvs_close(h);
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "OTA-Zustand speichern: %s", esp_err_to_name(err));
    }
}

static void store_load(void)
{
    memset(&s_store, 0, sizeof(s_store));
    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE, NVS_READONLY, &h) == ESP_OK) {
        size_t len = sizeof(s_store);
        if (nvs_get_blob(h, NVS_KEY_OTA, &s_store, &len) != ESP_OK || len != sizeof(s_store) ||
            s_store.version != STORE_VERSION) {
            memset(&s_store, 0, sizeof(s_store));
        }
        nvs_close(h);
    }
    s_store.version = STORE_VERSION;
}

// ---------- Start ----------
static const char *state_name(esp_ota_img_states_t st)
{
    switch (st) {
    case ESP_OTA_IMG_NEW:            return "neu";
    case ESP_OTA_IMG_PENDING_VERIFY: return "PENDING_VERIFY";
    case ESP_OTA_IMG_VALID:          return "gueltig";
    case ESP_OTA_IMG_INVALID:        return "ungueltig";
    case ESP_OTA_IMG_ABORTED:        return "abgebrochen";
    default:                         return "undefiniert";
    }
}

void ota_boot_check(void)
{
    store_load();
    if (s_fail.magic != FAIL_MAGIC) {
        memset(&s_fail, 0, sizeof(s_fail));
        s_fail.magic = FAIL_MAGIC;
    }

    const esp_partition_t *run = esp_ota_get_running_partition();
    esp_ota_img_states_t st = ESP_OTA_IMG_UNDEFINED;
    bool have_state = (run && esp_ota_get_state_partition(run, &st) == ESP_OK);
    s_pending_verify = have_state && st == ESP_OTA_IMG_PENDING_VERIFY;
    ESP_LOGW(TAG, "Firmware %s aus %s, Zustand %s%s", running_version(), run ? run->label : "?",
             have_state ? state_name(st) : "ohne OTA-Eintrag (per USB geflasht)",
             s_pending_verify ? ", wird beim ersten Backend-Kontakt bestaetigt" : "");

    // Rollback erkennen: die zuletzt verworfene Partition
    const esp_partition_t *inv = esp_ota_get_last_invalid_partition();
    esp_app_desc_t desc;
    if (inv && esp_ota_get_partition_description(inv, &desc) == ESP_OK &&
        strcmp(desc.version, running_version()) != 0 && strcmp(desc.version, s_store.blocked) != 0) {
        ESP_LOGE(TAG, "Rollback: %s wurde verworfen, laufend %s, Version gesperrt", desc.version,
                 running_version());
        strlcpy(s_store.blocked, desc.version, sizeof(s_store.blocked));
        s_store.report_pending = 1;
        store_save();
    }

#if CONFIG_CALLGREEN_OTA_TEST_FAIL
    if (s_pending_verify) {
        // Nur fuer den Rollback-Test: Absturz vor dem ersten Backend-Kontakt
        ESP_LOGE(TAG, "TEST: absichtlicher Absturz vor Backend-Kontakt in 5 s");
        vTaskDelay(pdMS_TO_TICKS(5000));
        abort();
    }
#endif
}

void ota_mark_valid_if_pending(void)
{
    if (!s_pending_verify) return;
    esp_err_t err = esp_ota_mark_app_valid_cancel_rollback();
    if (err == ESP_OK) {
        s_pending_verify = false;
        ESP_LOGW(TAG, "%s als gueltig markiert, Rollback abgebrochen", running_version());
    } else {
        ESP_LOGE(TAG, "Als gueltig markieren: %s", esp_err_to_name(err));
    }
}

const char *ota_rollback_version(void)
{
    return s_store.report_pending ? s_store.blocked : NULL;
}

void ota_rollback_reported(void)
{
    if (s_store.report_pending) {
        s_store.report_pending = 0;
        store_save();
    }
}

// ---------- Angebot ----------
static bool parse_offer(const cJSON *o, offer_t *out)
{
    const cJSON *v = cJSON_GetObjectItemCaseSensitive(o, "version");
    const cJSON *u = cJSON_GetObjectItemCaseSensitive(o, "url");
    const cJSON *h = cJSON_GetObjectItemCaseSensitive(o, "sha256");
    const cJSON *s = cJSON_GetObjectItemCaseSensitive(o, "size");
    if (!cJSON_IsString(v) || !cJSON_IsString(u) || !cJSON_IsString(h) || !cJSON_IsNumber(s)) {
        ESP_LOGW(TAG, "Angebot unvollstaendig");
        return false;
    }
    size_t vlen = strlen(v->valuestring), ulen = strlen(u->valuestring);
    if (vlen == 0 || vlen > OTA_VER_MAX) {
        ESP_LOGW(TAG, "Angebot: version ungueltig");
        return false;
    }
    if (ulen > OTA_URL_MAX || strncmp(u->valuestring, "https://", 8) != 0) {
        ESP_LOGW(TAG, "Angebot: url ungueltig (%u Zeichen)", (unsigned)ulen);
        return false;
    }
    if (strlen(h->valuestring) != 64) {
        ESP_LOGW(TAG, "Angebot: sha256 ungueltig");
        return false;
    }
    for (int i = 0; i < 64; i++) {
        if (!isxdigit((unsigned char)h->valuestring[i])) {
            ESP_LOGW(TAG, "Angebot: sha256 ungueltig");
            return false;
        }
        out->sha256[i] = (char)tolower((unsigned char)h->valuestring[i]);
    }
    out->sha256[64] = '\0';
    const esp_partition_t *target = esp_ota_get_next_update_partition(NULL);
    if (s->valuedouble < 1 || !target || s->valuedouble > target->size) {
        ESP_LOGW(TAG, "Angebot: size ungueltig");
        return false;
    }
    strlcpy(out->version, v->valuestring, sizeof(out->version));
    strlcpy(out->url, u->valuestring, sizeof(out->url));
    out->size = (uint32_t)s->valuedouble;
    return true;
}

void ota_set_offer(const void *cjson_obj)
{
    const cJSON *o = cjson_obj;
    s_have_offer = false;
    if (!o || cJSON_IsNull(o) || !cJSON_IsObject(o)) {
        return;
    }
    s_have_offer = parse_offer(o, &s_offer);
}

// ---------- Installation ----------
static bool sha256_of_partition(const esp_partition_t *part, uint32_t size, char hex[65])
{
    uint8_t *buf = malloc(SHA_CHUNK);
    if (!buf) return false;
    psa_crypto_init();
    psa_hash_operation_t op = PSA_HASH_OPERATION_INIT;
    bool ok = (psa_hash_setup(&op, PSA_ALG_SHA_256) == PSA_SUCCESS);
    for (uint32_t off = 0; ok && off < size; off += SHA_CHUNK) {
        uint32_t n = (size - off) < SHA_CHUNK ? (size - off) : SHA_CHUNK;
        ok = esp_partition_read(part, off, buf, n) == ESP_OK &&
             psa_hash_update(&op, buf, n) == PSA_SUCCESS;
    }
    uint8_t digest[32];
    size_t dlen = 0;
    if (ok) {
        ok = psa_hash_finish(&op, digest, sizeof(digest), &dlen) == PSA_SUCCESS && dlen == 32;
    } else {
        psa_hash_abort(&op);
    }
    free(buf);
    if (ok) {
        for (int i = 0; i < 32; i++) {
            snprintf(hex + i * 2, 3, "%02x", digest[i]);
        }
    }
    return ok;
}

static void note_failure(const char *version)
{
    if (strcmp(s_fail.version, version) != 0) {
        strlcpy(s_fail.version, version, sizeof(s_fail.version));
        s_fail.count = 0;
    }
    if (s_fail.count < 255) s_fail.count++;
    if (s_fail.count >= OTA_FAIL_MAX) {
        s_fail.retry_after = now_unix() + OTA_PAUSE_S;
        ESP_LOGW(TAG, "%s: %u Fehlversuche, Pause 24 h", version, s_fail.count);
    }
}

static ota_result_t install(const offer_t *o, bool forced, bool usb)
{
    if (strcmp(o->version, running_version()) == 0) {
        ESP_LOGI(TAG, "Angebot %s laeuft bereits", o->version);
        return OTA_R_NO_UPDATE;
    }
    if (forced && strcmp(o->version, s_store.blocked) == 0) {
        // ota_now: gesperrte Version trotzdem versuchen. Sperre aufheben, damit ein
        // erneutes Rollback wieder erkannt und gemeldet wird.
        ESP_LOGW(TAG, "ota_now: gesperrte Version %s wird erneut versucht", o->version);
        s_store.blocked[0] = '\0';
        s_store.report_pending = 0;
        store_save();
    }
    if (!forced) {
        if (strcmp(o->version, s_store.blocked) == 0) {
            ESP_LOGW(TAG, "Angebot %s gesperrt (Rollback), ignoriert", o->version);
            return OTA_R_SKIPPED;
        }
        if (strcmp(o->version, s_fail.version) == 0 && s_fail.count >= OTA_FAIL_MAX &&
            now_unix() < s_fail.retry_after) {
            ESP_LOGW(TAG, "Angebot %s pausiert nach %u Fehlversuchen", o->version, s_fail.count);
            return OTA_R_SKIPPED;
        }
    }
    if (!usb) {
        float bat = sensors_battery_v();
        float min_v = config_get()->low_battery_v + BAT_MARGIN_V;
        if (bat < min_v) {
            ESP_LOGW(TAG, "Angebot %s: Akku %.2f V unter %.2f V, verschoben", o->version, bat, min_v);
            return OTA_R_LOW_BATTERY;
        }
    }

    ESP_LOGW(TAG, "Angebot %s (%lu Byte), laufend %s -> installiere", o->version, (unsigned long)o->size,
             running_version());
    // Eigene TLS-Verbindung fuer den Download, die API-Verbindung freigeben (Heap)
    net_http_close();

    esp_http_client_config_t http = {
        .url = o->url,
        .timeout_ms = HTTP_TIMEOUT_MS,
        .keep_alive_enable = true,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };
    esp_https_ota_config_t cfg = {
        .http_config = &http,
    };
    esp_https_ota_handle_t h = NULL;
    esp_err_t err = esp_https_ota_begin(&cfg, &h);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Download-Start: %s", esp_err_to_name(err));
        note_failure(o->version);
        return OTA_R_DOWNLOAD_FAILED;
    }

    esp_app_desc_t desc;
    memset(&desc, 0, sizeof(desc));
    if (esp_https_ota_get_img_desc(h, &desc) != ESP_OK ||
        strcmp(desc.project_name, PROJECT_NAME) != 0 || strcmp(desc.version, o->version) != 0) {
        ESP_LOGE(TAG, "Image passt nicht zum Angebot (Projekt \"%.32s\", Version \"%.32s\")",
                 desc.project_name, desc.version);
        esp_https_ota_abort(h);
        note_failure(o->version);
        return OTA_R_INVALID_IMAGE;
    }

    int last_pct = -1;
    do {
        err = esp_https_ota_perform(h);
        int pct = (int)((int64_t)esp_https_ota_get_image_len_read(h) * 100 / o->size);
        if (pct / 10 != last_pct / 10) {
            ESP_LOGI(TAG, "Download %d%%", pct);
            last_pct = pct;
        }
    } while (err == ESP_ERR_HTTPS_OTA_IN_PROGRESS);

    int len = esp_https_ota_get_image_len_read(h);
    if (err != ESP_OK || !esp_https_ota_is_complete_data_received(h) || len != (int)o->size) {
        ESP_LOGE(TAG, "Download fehlgeschlagen (%s, %d von %lu Byte)", esp_err_to_name(err), len,
                 (unsigned long)o->size);
        esp_https_ota_abort(h);
        note_failure(o->version);
        return OTA_R_DOWNLOAD_FAILED;
    }

    // sha256 ueber die komplette .bin, gelesen aus dem geschriebenen Slot
    char hex[65] = "";
    const esp_partition_t *target = esp_ota_get_next_update_partition(NULL);
    if (!target || !sha256_of_partition(target, o->size, hex) || strcmp(hex, o->sha256) != 0) {
        ESP_LOGE(TAG, "sha256 stimmt nicht, verworfen");
        esp_https_ota_abort(h);
        note_failure(o->version);
        return OTA_R_SHA_MISMATCH;
    }
    ESP_LOGI(TAG, "sha256 ok");

    err = esp_https_ota_finish(h);  // prueft das Image und setzt die Boot-Partition
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Installation: %s", esp_err_to_name(err));
        note_failure(o->version);
        return err == ESP_ERR_OTA_VALIDATE_FAILED ? OTA_R_INVALID_IMAGE : OTA_R_DOWNLOAD_FAILED;
    }
    s_fail.count = 0;
    ESP_LOGW(TAG, "%s installiert in %s, Neustart folgt", o->version, target->label);
    return OTA_R_INSTALLED;
}

ota_result_t ota_process_offer(bool usb)
{
    if (!s_have_offer) {
        return OTA_R_NO_UPDATE;
    }
    s_have_offer = false;
    return install(&s_offer, false, usb);
}

ota_result_t ota_check_latest(bool usb, bool forced)
{
    char path[160];
    snprintf(path, sizeof(path), "/firmware/latest?hw_rev=%s&fw_version=%s&device_id=%s",
             CALLGREEN_HW_REV, running_version(), device_id());
    char *resp = calloc(1, RESP_MAX);
    if (!resp) {
        return OTA_R_DOWNLOAD_FAILED;
    }
    // Ohne Token: ein Fehler an diesem Endpoint darf nie den 401-Pfad ausloesen
    int code = net_get_json(path, false, resp, RESP_MAX);
    ota_result_t r;
    if (code == 204) {
        ESP_LOGI(TAG, "Kein Update (204)");
        r = OTA_R_NO_UPDATE;
    } else if (code == 200) {
        cJSON *root = cJSON_Parse(resp);
        offer_t o;
        if (root && parse_offer(root, &o)) {
            r = install(&o, forced, usb);
        } else {
            r = OTA_R_INVALID_IMAGE;
        }
        cJSON_Delete(root);
    } else {
        ESP_LOGW(TAG, "GET /firmware/latest: %d", code);
        r = OTA_R_DOWNLOAD_FAILED;
    }
    free(resp);
    return r;
}

bool ota_result_ok(ota_result_t r)
{
    return r == OTA_R_INSTALLED || r == OTA_R_NO_UPDATE;
}

const char *ota_result_detail(ota_result_t r)
{
    switch (r) {
    case OTA_R_INSTALLED:       return "";
    case OTA_R_NO_UPDATE:       return "no_update";
    case OTA_R_LOW_BATTERY:     return "low_battery";
    case OTA_R_SHA_MISMATCH:    return "sha256_mismatch";
    case OTA_R_INVALID_IMAGE:   return "invalid_image";
    case OTA_R_SKIPPED:         return "no_update";
    default:                    return "download_failed";
    }
}

void ota_restart(void)
{
    ESP_LOGW(TAG, "Neustart in die neue Firmware");
    net_wifi_off();
    fflush(stdout);
    vTaskDelay(pdMS_TO_TICKS(200));
    esp_restart();
}
