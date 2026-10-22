#include "sensors.h"

#include <stdint.h>
#include <stdlib.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "esp_log.h"

static const char *TAG = "sensors";

// ---------- Pins (Rev. v3) ----------
#define PIN_CHRG_STATUS GPIO_NUM_0   // ETA6003 STAT, LOW = laedt
#define PIN_VBUS        GPIO_NUM_5   // HIGH = USB steckt, keine internen Pulls
#define PIN_SENSOR_GATE GPIO_NUM_10  // P-FET, LOW = Sensor AN, externer Pull-up
#define PIN_SDA         GPIO_NUM_8
#define PIN_SCL         GPIO_NUM_9
#define ADC_CH_BAT      ADC_CHANNEL_1  // IO1
#define ADC_CH_MOISTURE ADC_CHANNEL_4  // IO4

// ---------- Kalibrierung ----------
#define MOISTURE_DRY       2320  // Rohwert = 0 %
#define MOISTURE_WET       845   // Rohwert = 100 %
#define MOISTURE_SAMPLES_MAX 200
#define BAT_SAMPLES        8
#define BAT_DIVIDER_FACTOR 2.0f

#define I2C_FREQ_HZ    100000
#define I2C_TIMEOUT_MS 100
#define AHT20_ADDR     0x38
#define BH1750_ADDR    0x23

static adc_oneshot_unit_handle_t s_adc;
static adc_cali_handle_t s_cali_bat;
static i2c_master_bus_handle_t s_bus;
static i2c_master_dev_handle_t s_aht20;
static i2c_master_dev_handle_t s_bh1750;

// ---------- Gate ----------
void sensors_gate_init_off(void)
{
    // Pegel vor dem Aktivieren des Ausgangs setzen, damit kein LOW-Glitch entsteht
    gpio_set_level(PIN_SENSOR_GATE, 1);
    gpio_config_t cfg = {
        .pin_bit_mask = 1ULL << PIN_SENSOR_GATE,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&cfg);
    gpio_set_level(PIN_SENSOR_GATE, 1);
}

void sensors_gate_on(void)  { gpio_set_level(PIN_SENSOR_GATE, 0); }
void sensors_gate_off(void) { gpio_set_level(PIN_SENSOR_GATE, 1); }

// ---------- GPIO + ADC ----------
void sensors_init(void)
{
    gpio_config_t vbus = {
        .pin_bit_mask = 1ULL << PIN_VBUS,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&vbus);

    // STAT ist Open-Drain; Pull-up zieht nur Strom, waehrend geladen wird
    gpio_config_t chrg = {
        .pin_bit_mask = 1ULL << PIN_CHRG_STATUS,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&chrg);

    if (s_adc) {
        return;
    }
    adc_oneshot_unit_init_cfg_t unit_cfg = {
        .unit_id = ADC_UNIT_1,
        .ulp_mode = ADC_ULP_MODE_DISABLE,
    };
    esp_err_t err = adc_oneshot_new_unit(&unit_cfg, &s_adc);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "ADC-Init fehlgeschlagen: %s", esp_err_to_name(err));
        s_adc = NULL;
        return;
    }
    // 12 Bit, 12 dB entspricht Arduino analogRead()
    adc_oneshot_chan_cfg_t ch_cfg = {
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_12,
    };
    adc_oneshot_config_channel(s_adc, ADC_CH_BAT, &ch_cfg);
    adc_oneshot_config_channel(s_adc, ADC_CH_MOISTURE, &ch_cfg);

    adc_cali_curve_fitting_config_t cali_cfg = {
        .unit_id = ADC_UNIT_1,
        .chan = ADC_CH_BAT,
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_12,
    };
    err = adc_cali_create_scheme_curve_fitting(&cali_cfg, &s_cali_bat);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "ADC-Kalibrierung nicht verfuegbar: %s", esp_err_to_name(err));
        s_cali_bat = NULL;
    }
}

bool sensors_vbus_present(void) { return gpio_get_level(PIN_VBUS) == 1; }
bool sensors_is_charging(void)  { return gpio_get_level(PIN_CHRG_STATUS) == 0; }

int sensors_moisture_raw(void)
{
    int raw = 0;
    if (!s_adc || adc_oneshot_read(s_adc, ADC_CH_MOISTURE, &raw) != ESP_OK) {
        return -1;
    }
    return raw;
}

int sensors_moisture_pct_from_raw(int raw)
{
    // Ganzzahl-Arithmetik wie Arduino map(roh, trocken, nass, 0, 100)
    int32_t percent = ((int32_t)raw - MOISTURE_DRY) * 100 / (MOISTURE_WET - MOISTURE_DRY);
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    return (int)percent;
}

static int cmp_int(const void *a, const void *b)
{
    return *(const int *)a - *(const int *)b;
}

bool sensors_moisture_sample(int samples, int interval_ms, int *median, int *min, int *max)
{
    if (samples < 1) samples = 1;
    if (samples > MOISTURE_SAMPLES_MAX) samples = MOISTURE_SAMPLES_MAX;
    int vals[MOISTURE_SAMPLES_MAX];
    int n = 0;
    for (int i = 0; i < samples; i++) {
        int raw = sensors_moisture_raw();
        if (raw >= 0) {
            vals[n++] = raw;
        }
        if (i < samples - 1) {
            vTaskDelay(pdMS_TO_TICKS(interval_ms));
        }
    }
    if (n == 0) {
        ESP_LOGE(TAG, "Moisture-ADC liefert keine Werte");
        return false;
    }
    qsort(vals, n, sizeof(int), cmp_int);
    *min = vals[0];
    *max = vals[n - 1];
    *median = (n % 2) ? vals[n / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
    return true;
}

float sensors_battery_v(void)
{
    if (!s_adc || !s_cali_bat) {
        return 0.0f;
    }
    int32_t sum = 0;
    int n = 0;
    for (int i = 0; i < BAT_SAMPLES; i++) {
        int mv = 0;
        if (adc_oneshot_get_calibrated_result(s_adc, s_cali_bat, ADC_CH_BAT, &mv) == ESP_OK) {
            sum += mv;
            n++;
        }
        // Hohe Teilerimpedanz: bewusst mit Pausen
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    if (n == 0) {
        return 0.0f;
    }
    return ((float)sum / n * BAT_DIVIDER_FACTOR) / 1000.0f;
}

// ---------- I2C ----------
static bool i2c_bus_init(void)
{
    if (s_bus) {
        return true;
    }
    i2c_master_bus_config_t bus_cfg = {
        .i2c_port = I2C_NUM_0,
        .sda_io_num = PIN_SDA,
        .scl_io_num = PIN_SCL,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    esp_err_t err = i2c_new_master_bus(&bus_cfg, &s_bus);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "I2C-Bus-Init fehlgeschlagen: %s", esp_err_to_name(err));
        s_bus = NULL;
        return false;
    }
    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .scl_speed_hz = I2C_FREQ_HZ,
    };
    dev_cfg.device_address = AHT20_ADDR;
    if (i2c_master_bus_add_device(s_bus, &dev_cfg, &s_aht20) != ESP_OK) {
        s_aht20 = NULL;
    }
    dev_cfg.device_address = BH1750_ADDR;
    if (i2c_master_bus_add_device(s_bus, &dev_cfg, &s_bh1750) != ESP_OK) {
        s_bh1750 = NULL;
    }
    return true;
}

// ---------- AHT20 ----------
static uint8_t aht20_crc8(const uint8_t *data, int len)
{
    uint8_t crc = 0xFF;
    for (int i = 0; i < len; i++) {
        crc ^= data[i];
        for (int b = 0; b < 8; b++) {
            crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x31) : (uint8_t)(crc << 1);
        }
    }
    return crc;
}

static bool aht20_status(uint8_t *status)
{
    const uint8_t cmd = 0x71;
    return i2c_master_transmit_receive(s_aht20, &cmd, 1, status, 1, I2C_TIMEOUT_MS) == ESP_OK;
}

bool sensors_aht20_init(void)
{
    if (!i2c_bus_init() || !s_aht20) {
        return false;
    }
    const uint8_t init_cmd[3] = {0xBE, 0x08, 0x00};
    if (i2c_master_transmit(s_aht20, init_cmd, sizeof(init_cmd), I2C_TIMEOUT_MS) != ESP_OK) {
        return false;
    }
    vTaskDelay(pdMS_TO_TICKS(10));
    uint8_t status = 0;
    if (!aht20_status(&status)) {
        return false;
    }
    // Bit 3 = kalibriert
    return (status & 0x08) != 0;
}

bool sensors_aht20_read(float *temperature, float *humidity)
{
    if (!s_aht20) {
        return false;
    }
    const uint8_t meas_cmd[3] = {0xAC, 0x33, 0x00};
    if (i2c_master_transmit(s_aht20, meas_cmd, sizeof(meas_cmd), I2C_TIMEOUT_MS) != ESP_OK) {
        return false;
    }
    vTaskDelay(pdMS_TO_TICKS(80));

    uint8_t d[7];
    bool ready = false;
    for (int tries = 0; tries < 5; tries++) {
        if (i2c_master_receive(s_aht20, d, sizeof(d), I2C_TIMEOUT_MS) != ESP_OK) {
            return false;
        }
        if ((d[0] & 0x80) == 0) {  // Busy-Bit
            ready = true;
            break;
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    if (!ready) {
        ESP_LOGW(TAG, "AHT20 bleibt busy");
        return false;
    }
    if (aht20_crc8(d, 6) != d[6]) {
        ESP_LOGW(TAG, "AHT20 CRC-Fehler");
        return false;
    }
    uint32_t raw_h = ((uint32_t)d[1] << 12) | ((uint32_t)d[2] << 4) | (d[3] >> 4);
    uint32_t raw_t = (((uint32_t)d[3] & 0x0F) << 16) | ((uint32_t)d[4] << 8) | d[5];
    *humidity = raw_h * 100.0f / 1048576.0f;
    *temperature = raw_t * 200.0f / 1048576.0f - 50.0f;
    return true;
}

// ---------- BH1750 ----------
bool sensors_bh1750_init(void)
{
    if (!i2c_bus_init() || !s_bh1750) {
        return false;
    }
    const uint8_t power_on = 0x01;
    const uint8_t cont_h_res = 0x10;
    return i2c_master_transmit(s_bh1750, &power_on, 1, I2C_TIMEOUT_MS) == ESP_OK &&
           i2c_master_transmit(s_bh1750, &cont_h_res, 1, I2C_TIMEOUT_MS) == ESP_OK;
}

bool sensors_bh1750_read(float *lux)
{
    if (!s_bh1750) {
        return false;
    }
    uint8_t d[2];
    if (i2c_master_receive(s_bh1750, d, sizeof(d), I2C_TIMEOUT_MS) != ESP_OK) {
        return false;
    }
    *lux = (float)(((uint16_t)d[0] << 8) | d[1]) / 1.2f;
    return true;
}
