#include "config.h"

#include <string.h>
#include "cJSON.h"
#include "esp_log.h"
#include "nvs.h"
#include "sdkconfig.h"

static const char *TAG = "config";

#define NVS_NAMESPACE  "callgreen"
#define NVS_KEY_CONFIG "config"
#define CONFIG_VERSION 1

typedef struct {
    uint32_t    version;
    cg_config_t cfg;
} stored_config_t;

static cg_config_t s_cfg;

static void set_defaults(cg_config_t *c)
{
    c->settle_ms = CONFIG_CALLGREEN_SETTLE_MS;
    c->samples = CONFIG_CALLGREEN_SAMPLES;
    c->low_battery_v = 3.4f;
    c->critical_battery_v = 3.2f;
    c->online_poll_s = 10;
}

static void log_config(const char *prefix)
{
    ESP_LOGI(TAG, "%s: settle_ms=%lu samples=%lu low_battery_v=%.2f critical_battery_v=%.2f online_poll_s=%lu",
             prefix, (unsigned long)s_cfg.settle_ms, (unsigned long)s_cfg.samples,
             s_cfg.low_battery_v, s_cfg.critical_battery_v, (unsigned long)s_cfg.online_poll_s);
}

void config_init(void)
{
    set_defaults(&s_cfg);
    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE, NVS_READONLY, &h) == ESP_OK) {
        stored_config_t st;
        size_t len = sizeof(st);
        if (nvs_get_blob(h, NVS_KEY_CONFIG, &st, &len) == ESP_OK && len == sizeof(st) &&
            st.version == CONFIG_VERSION) {
            s_cfg = st.cfg;
        }
        nvs_close(h);
    }
    log_config("Konfiguration");
}

const cg_config_t *config_get(void) { return &s_cfg; }

typedef struct {
    int  valid;    // Felder mit gueltigem Wert (geaendert oder gleich)
    int  invalid;  // Felder ausserhalb des Bereichs oder falscher Typ
    bool changed;
} take_stats_t;

static void take_u32(const cJSON *obj, const char *key, uint32_t lo, uint32_t hi, uint32_t *dst,
                     take_stats_t *st)
{
    const cJSON *it = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (!it) return;
    if (!cJSON_IsNumber(it) || it->valuedouble < lo || it->valuedouble > hi) {
        ESP_LOGW(TAG, "config.%s ungueltig, ignoriert", key);
        st->invalid++;
        return;
    }
    st->valid++;
    uint32_t v = (uint32_t)it->valuedouble;
    if (v != *dst) {
        *dst = v;
        st->changed = true;
    }
}

static void take_f(const cJSON *obj, const char *key, float lo, float hi, float *dst, take_stats_t *st)
{
    const cJSON *it = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (!it) return;
    if (!cJSON_IsNumber(it) || it->valuedouble < lo || it->valuedouble > hi) {
        ESP_LOGW(TAG, "config.%s ungueltig, ignoriert", key);
        st->invalid++;
        return;
    }
    st->valid++;
    float v = (float)it->valuedouble;
    if (v != *dst) {
        *dst = v;
        st->changed = true;
    }
}

config_result_t config_apply_json(const void *cjson_obj, const char *source)
{
    const cJSON *obj = cjson_obj;
    if (!cJSON_IsObject(obj)) {
        return CONFIG_EMPTY;
    }
    // Bereiche mit dem Backend abgestimmt (v8 Abschnitt 5.5)
    cg_config_t next = s_cfg;
    take_stats_t st = {0};
    take_u32(obj, "settle_ms", 50, 30000, &next.settle_ms, &st);
    take_u32(obj, "samples", 1, 200, &next.samples, &st);
    take_u32(obj, "online_poll_s", 2, 3600, &next.online_poll_s, &st);

    take_stats_t bat = {0};
    float low = next.low_battery_v, crit = next.critical_battery_v;
    take_f(obj, "low_battery_v", 3.0f, 4.2f, &low, &bat);
    take_f(obj, "critical_battery_v", 2.8f, 4.0f, &crit, &bat);
    st.invalid += bat.invalid;
    if (bat.valid > 0) {
        if (crit < low) {
            st.valid += bat.valid;
            if (bat.changed) {
                next.low_battery_v = low;
                next.critical_battery_v = crit;
                st.changed = true;
            }
        } else {
            ESP_LOGW(TAG, "config: critical_battery_v (%.2f) muss kleiner als low_battery_v (%.2f) sein, "
                     "beide ignoriert", crit, low);
            st.invalid += bat.valid;
        }
    }

    if (st.changed) {
        s_cfg = next;
        stored_config_t sc = {.version = CONFIG_VERSION, .cfg = s_cfg};
        nvs_handle_t h;
        esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &h);
        if (err == ESP_OK) {
            err = nvs_set_blob(h, NVS_KEY_CONFIG, &sc, sizeof(sc));
            if (err == ESP_OK) err = nvs_commit(h);
            nvs_close(h);
        }
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Konfiguration speichern: %s", esp_err_to_name(err));
        }
        log_config(source);
    }
    if (st.valid == 0 && st.invalid == 0) return CONFIG_EMPTY;
    if (st.valid == 0) return CONFIG_INVALID;
    return st.invalid ? CONFIG_PARTIAL : CONFIG_OK;
}
