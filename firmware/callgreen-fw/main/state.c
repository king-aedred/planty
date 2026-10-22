#include "state.h"

#include <string.h>
#include "esp_attr.h"
#include "esp_log.h"
#include "esp_random.h"
#include "nvs.h"

static const char *TAG = "state";

#define NVS_NAMESPACE  "callgreen"
#define NVS_KEY_SEQ    "seq_resv"   // erste noch nicht reservierte seq
#define SEQ_BLOCK      100

RTC_DATA_ATTR persist_t g_persist;

bool state_begin(void)
{
    if (g_persist.magic == RTC_MAGIC) {
        return false;
    }
    memset(&g_persist, 0, sizeof(g_persist));
    g_persist.magic = RTC_MAGIC;
    state_set_flag(FLAG_COLD_BOOT);
    return true;
}

void state_set_flag(uint8_t flag)
{
    g_persist.error_flags |= flag;
}

static void reserve_seq_block(void)
{
    uint32_t resv = 0;
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &h);
    if (err == ESP_OK && nvs_get_u32(h, NVS_KEY_SEQ, &resv) != ESP_OK) {
        // Noch nie reserviert (neues Geraet oder NVS geloescht): zufaelliger Start, damit
        // nach einem Loeschen keine alten (device_id, seq) wiederverwendet werden
        resv = 1 + (esp_random() & 0x00FFFFFF);
        ESP_LOGW(TAG, "seq: kein Zaehler im NVS, starte neue Reihe bei %lu", (unsigned long)resv);
        if (g_persist.buf_count > 0) {
            // Kein Batch darf seqs aus alter und neuer Reihe mischen
            ESP_LOGW(TAG, "seq-Zaehler neu gesetzt: %u gepufferte Messungen verworfen", g_persist.buf_count);
            buf_clear();
        }
    }
    uint32_t start = g_persist.seq_next > resv ? g_persist.seq_next : resv;
    uint32_t limit = start + SEQ_BLOCK;
    if (err == ESP_OK) {
        err = nvs_set_u32(h, NVS_KEY_SEQ, limit);
        if (err == ESP_OK) err = nvs_commit(h);
        nvs_close(h);
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "seq-Block im NVS reservieren: %s", esp_err_to_name(err));
    }
    g_persist.seq_next = start;
    g_persist.seq_limit = limit;
    ESP_LOGI(TAG, "seq-Block reserviert: %lu bis %lu", (unsigned long)start, (unsigned long)(limit - 1));
}

uint32_t state_next_seq(void)
{
    if (g_persist.seq_next == 0 || g_persist.seq_next >= g_persist.seq_limit) {
        reserve_seq_block();
    }
    return g_persist.seq_next++;
}

int buf_push(const reading_t *r)
{
    int dropped = 0;
    if (g_persist.buf_count >= READING_BUF_MAX) {
        ESP_LOGW(TAG, "Puffer voll, verwerfe aelteste Messung seq %lu",
                 (unsigned long)g_persist.buf[0].seq);
        memmove(&g_persist.buf[0], &g_persist.buf[1], sizeof(reading_t) * (READING_BUF_MAX - 1));
        g_persist.buf_count = READING_BUF_MAX - 1;
        dropped = 1;
    }
    g_persist.buf[g_persist.buf_count++] = *r;
    return dropped;
}

reading_t *buf_find(uint32_t seq)
{
    for (int i = 0; i < g_persist.buf_count; i++) {
        if (g_persist.buf[i].seq == seq) return &g_persist.buf[i];
    }
    return NULL;
}

void buf_remove_seqs(const uint32_t *seqs, int n)
{
    int w = 0;
    for (int i = 0; i < g_persist.buf_count; i++) {
        bool remove = false;
        for (int k = 0; k < n; k++) {
            if (seqs[k] == g_persist.buf[i].seq) {
                remove = true;
                break;
            }
        }
        if (!remove) {
            g_persist.buf[w++] = g_persist.buf[i];
        }
    }
    g_persist.buf_count = (uint8_t)w;
}

void buf_clear(void)
{
    g_persist.buf_count = 0;
}
