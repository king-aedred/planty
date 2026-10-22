/*
 * Planty - Firmware v5.0 (Port auf neue Hardware)
 * Hardware: ESP32-C3-MINI-1 + ETA6003 + AHT20 + BH1750 + kapazitiver Bodenfeuchtesensor
 *
 * Portiert von v4.3 (XIAO ESP32-C3 + Logger HAT).
 *
 * WICHTIGE UNTERSCHIEDE ZUR ALTEN HARDWARE:
 * 1. KEIN PCF8563 RTC. Zeit wird bei jedem Aufwachen per NTP geholt.
 *    Der batteriegepufferte RTC-RAM entfaellt, stattdessen RTC_DATA_ATTR
 *    im ESP32. Das ueberlebt Deep Sleep, aber NICHT das Abklemmen der Zelle.
 * 2. SHT40 ersetzt durch AHT20 (liefert zusaetzlich Luftfeuchte).
 * 3. SENSOR_GATE ist INVERTIERT: P-FET mit Pull-up, LOW = Sensor AN.
 *    Auf der alten Hardware war HIGH = an. Verwechslung waere fatal.
 * 4. SENSOR_GATE schaltet NUR den Bodenfeuchtesensor. AHT20 und BH1750
 *    haengen fest an 3V3 und lassen sich nicht abschalten.
 * 5. Moisture-Pfad hat jetzt einen Spannungsteiler (100k/220k).
 *    Alte Kalibrierwerte (2800/1200) sind NICHT uebertragbar.
 * 6. Neu: Ladestatus ueber STAT-Pin des ETA6003 (GPIO1).
 *    Backend hat dafuer kein Feld, wird nur lokal gelogg
 t.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <BH1750.h>
#include <time.h>
#include <esp_sleep.h>

// ---------- WLAN ----------
const char* ssid     = "";
const char* password = "";

// ---------- Endpoints ----------
const char* endpointReadings = "https://dusty-shrimp-80.eu-west-1.convex.site/readings";
const char* endpointLogs     = "https://dusty-shrimp-80.eu-west-1.convex.site/logs";
const char* sensorId         = "planty-proto-01";

// ---------- Pins (NEUE Hardware) ----------
const int PIN_SENSOR_GATE = 10;  // P-FET Gate. LOW = Sensor AN, HIGH = AUS
const int PIN_MOISTURE    = 3;   // ADC1_CH3, hinter 100k/220k Teiler
const int PIN_BAT_ADC     = 0;   // ADC1_CH0, hinter 470k/470k Teiler
const int PIN_CHRG_STATUS = 1;   // ETA6003 STAT, LOW = laedt

// ---------- Kalibrierung Bodenfeuchte ----------
// TODO: Beide Werte am realen Sensor messen und eintragen.
// Gemessener Trockenwert am Prototyp lag bei ca. 2220 (Sensor in Luft).
// Nasswert noch nicht bestimmt: Sonde in Wasser tauchen, Rohwert ablesen.
// Die alten Werte 2800/1200 gelten NICHT, da jetzt ein Teiler davor sitzt.
int trocken = 2220;
int nass    = 1200;   // PLATZHALTER, unbedingt messen

// ---------- Batterie ----------
// 470k/470k Teiler -> Faktor 2
const float BAT_DIVIDER_FACTOR = 2.0f;

// ---------- Timing ----------
const unsigned long MOISTURE_SETTLE_MS = 60UL * 1000UL;
const int READINGS_COUNT = 18;
const unsigned long READING_INTERVAL_MS = 10000;

// ---------- Zeitzone (wie alt: MESZ, aber mit automatischer Umstellung) ----------
const char* TZ_INFO = "CET-1CEST,M3.5.0,M10.5.0/3";

// ---------- Persistenter Zustand ueber Deep Sleep ----------
// Ersetzt den RTC-RAM des PCF8563. Achtung: geht bei Stromverlust verloren.
#define RTC_MAGIC 0x504C4E54  // "PLNT"

RTC_DATA_ATTR uint32_t rtcMagic          = 0;
RTC_DATA_ATTR uint8_t  bootCount         = 0;
RTC_DATA_ATTR uint8_t  lastGoodHour      = 255;
RTC_DATA_ATTR uint8_t  errorFlags        = 0;
RTC_DATA_ATTR uint8_t  wifiFailCount     = 0;
RTC_DATA_ATTR uint8_t  httpFailCount     = 0;
RTC_DATA_ATTR uint8_t  lastReadingsSent  = 0;
RTC_DATA_ATTR float    lastBatteryV      = 0.0f;

// ---------- Fehler-Flags ----------
#define FLAG_WIFI_FAILED      0x01
#define FLAG_TIME_SYNC_FAILED 0x02
#define FLAG_AHT20_MISSING    0x04
#define FLAG_BH1750_MISSING   0x08
#define FLAG_READINGS_FAILED  0x10
#define FLAG_LOG_FAILED       0x20
#define FLAG_COLD_BOOT        0x40
#define FLAG_SLEEP_PROBLEM    0x80

Adafruit_AHTX0 aht;
BH1750 lightMeter;

// Zustand des aktuellen Zyklus
struct {
  bool     coldBoot;
  bool     wifiOk;
  uint32_t wifiConnectMs;
  bool     timeSyncOk;
  bool     aht20Ok;
  bool     bh1750Ok;
  bool     charging;
  String   cycleTimestamp;
} cyc;

// ---------- Hilfsfunktionen ----------
void setErrorFlag(uint8_t flag) { errorFlags |= flag; }

bool connectWiFi(unsigned long timeoutMs = 15000) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {
    delay(300);
  }
  return WiFi.status() == WL_CONNECTED;
}

// Zeit per NTP holen. Ersetzt den batteriegepufferten RTC der alten Hardware.
bool syncTimeNtp(unsigned long timeoutMs = 15000) {
  configTzTime(TZ_INFO, "pool.ntp.org", "time.nist.gov");
  unsigned long start = millis();
  time_t now = time(nullptr);
  while (now < 24 * 3600 && millis() - start < timeoutMs) {
    delay(250);
    now = time(nullptr);
  }
  return now >= 24 * 3600;
}

// Format wie in v4.3: nur bis zur Stunde. Das Backend gruppiert Sessions darauf.
String buildTimestamp() {
  time_t now = time(nullptr);
  struct tm t;
  localtime_r(&now, &t);
  char buf[14];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d",
           t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour);
  return String(buf);
}

void getLocalTimeParts(int &hour, int &minute, int &second) {
  time_t now = time(nullptr);
  struct tm t;
  localtime_r(&now, &t);
  hour = t.tm_hour; minute = t.tm_min; second = t.tm_sec;
}

// Batteriemessung mit werkskalibriertem ADC, 8-fach gemittelt.
// Wegen der hohen Teilerimpedanz (470k/470k) bewusst mit Pausen.
float readBatteryVoltage() {
  uint32_t sum = 0;
  for (int i = 0; i < 8; i++) {
    sum += analogReadMilliVolts(PIN_BAT_ADC);
    delay(10);
  }
  return ((sum / 8.0f) * BAT_DIVIDER_FACTOR) / 1000.0f;
}

int readMoistureSingle() {
  int roh = analogRead(PIN_MOISTURE);
  int prozent = map(roh, trocken, nass, 0, 100);
  return constrain(prozent, 0, 100);
}

// ---------- Sensorversorgung ----------
// ACHTUNG: invertierte Logik gegenueber v4.3
void moistureSensorOn()  { digitalWrite(PIN_SENSOR_GATE, LOW);  }
void moistureSensorOff() { digitalWrite(PIN_SENSOR_GATE, HIGH); }

// ---------- Reading senden ----------
int sendReading(int moisture, float temperature, float lightLevel,
                float batteryVoltage, const String& timestamp) {
  if (WiFi.status() != WL_CONNECTED) return -1;

  HTTPClient http;
  http.begin(endpointReadings);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

  String payload = "{";
  payload += "\"sensor_id\":\"" + String(sensorId) + "\",";
  payload += "\"moisture\":" + String(moisture) + ",";
  payload += "\"temperature\":" + String(temperature, 1) + ",";
  payload += "\"light_level\":" + String((int)lightLevel) + ",";
  payload += "\"timestamp\":\"" + timestamp + "\",";
  payload += "\"battery_voltage\":" + String(batteryVoltage, 2);
  payload += "}";

  int code = http.POST(payload);
  http.end();
  return code;
}

// ---------- Logs senden ----------
// Feldnamen bewusst wie in v4.3 beibehalten, damit das Backend-Schema passt.
// Semantik teilweise umgedeutet, siehe Kommentare.
bool sendLogs(uint8_t readingsSent, uint8_t readingsFailed,
              uint32_t sleepSeconds, const String& nextWakeup,
              const String& errors, float battery, uint32_t wifiMs) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.begin(endpointLogs);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

  String payload = "{";
  payload += "\"sensor_id\":\"" + String(sensorId) + "\",";
  payload += "\"cycle_timestamp\":\"" + cyc.cycleTimestamp + "\",";
  payload += "\"boot_count\":" + String(bootCount) + ",";
  payload += "\"battery_voltage\":" + String(battery, 2) + ",";
  payload += "\"wifi_connect_ms\":" + String(wifiMs) + ",";
  // rtc_ok: es gibt keinen RTC-Chip mehr. Wir melden hier, ob die Zeit steht.
  payload += "\"rtc_ok\":" + String(cyc.timeSyncOk ? "true" : "false") + ",";
  // rtc_lost_power: entspricht jetzt "Kaltstart, persistenter Zustand weg".
  payload += "\"rtc_lost_power\":" + String(cyc.coldBoot ? "true" : "false") + ",";
  payload += "\"time_sync_ok\":" + String(cyc.timeSyncOk ? "true" : "false") + ",";
  // sht40_ok: Feldname beibehalten, meint jetzt den AHT20.
  payload += "\"sht40_ok\":" + String(cyc.aht20Ok ? "true" : "false") + ",";
  payload += "\"bh1750_ok\":" + String(cyc.bh1750Ok ? "true" : "false") + ",";
  payload += "\"readings_sent\":" + String(readingsSent) + ",";
  payload += "\"readings_failed\":" + String(readingsFailed) + ",";
  payload += "\"sleep_seconds\":" + String(sleepSeconds) + ",";
  payload += "\"next_wakeup\":\"" + nextWakeup + "\",";
  payload += "\"errors\":\"" + errors + "\",";
  payload += "\"prev_error_flags\":" + String(errorFlags) + ",";
  payload += "\"prev_wifi_fail_count\":" + String(wifiFailCount) + ",";
  payload += "\"prev_http_fail_count\":" + String(httpFailCount) + ",";
  payload += "\"prev_last_good_hour\":" + String(lastGoodHour) + ",";
  payload += "\"prev_readings_sent\":" + String(lastReadingsSent) + ",";
  payload += "\"prev_battery_voltage\":" + String(lastBatteryV, 2);
  payload += "}";

  int code = http.POST(payload);
  http.end();
  return (code == 200 || code == 201);
}

// ---------- Schlaf-Slot berechnen (identisch zu v4.3) ----------
uint64_t calcSecondsUntilNextSlot(int hour, int minute, int second) {
  int totalSeconds = hour * 3600 + minute * 60 + second;
  if (hour >= 0 && hour < 5)  return (uint64_t)((5 * 3600) - totalSeconds);
  if (hour >= 5 && hour < 13) return (uint64_t)(3600 - (minute * 60 + second));
  if (hour >= 13 && hour < 20) {
    int into = minute * 60 + second;
    return (minute < 30) ? (uint64_t)((30 * 60) - into)
                         : (uint64_t)((60 * 60) - into);
  }
  return (uint64_t)((24 * 3600) - totalSeconds);
}

String calcNextWakeupStr(int hour, int minute, int second, uint64_t sleepSecs) {
  int totalNow  = hour * 3600 + minute * 60 + second;
  int totalNext = (totalNow + (int)sleepSecs) % (24 * 3600);
  char buf[6];
  snprintf(buf, sizeof(buf), "%02d:%02d", totalNext / 3600, (totalNext % 3600) / 60);
  return String(buf);
}

// ---------- Deep Sleep ----------
void goToSleep(uint64_t seconds) {
  Serial.printf("Schlafe %llu Min %llu Sek\n", seconds / 60, seconds % 60);
  Serial.flush();

  // Sensor sicher aus. Der externe Pull-up haelt das Gate auch im
  // Deep Sleep oben, wenn der GPIO hochohmig wird.
  moistureSensorOff();

  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);

  esp_sleep_enable_timer_wakeup(seconds * 1000000ULL);
  esp_deep_sleep_start();
}

// ============================================================
void setup() {
  Serial.begin(115200);
  // Nach Deep Sleep braucht der native USB-CDC laenger zum Enumerieren.
  delay(2000);
  Serial.println("\n--- Planty v5.0: Aufwachen ---");

  // Sensor-FET zuerst definiert ausschalten, bevor irgendwas anderes passiert
  pinMode(PIN_SENSOR_GATE, OUTPUT);
  moistureSensorOff();
  pinMode(PIN_CHRG_STATUS, INPUT);

  Wire.begin();

  // Persistenten Zustand pruefen
  cyc.coldBoot = (rtcMagic != RTC_MAGIC);
  if (cyc.coldBoot) {
    Serial.println("Kaltstart: persistenter Zustand zurueckgesetzt");
    rtcMagic = RTC_MAGIC;
    bootCount = 0; lastGoodHour = 255; errorFlags = 0;
    wifiFailCount = 0; httpFailCount = 0;
    lastReadingsSent = 0; lastBatteryV = 0.0f;
    setErrorFlag(FLAG_COLD_BOOT);
  }
  bootCount++;
  Serial.printf("Boot #%d, Fehler-Flags vorher: 0x%02X\n", bootCount, errorFlags);

  cyc.charging = (digitalRead(PIN_CHRG_STATUS) == LOW);
  Serial.printf("Ladestatus: %s\n", cyc.charging ? "laedt" : "laedt nicht");

  // WLAN
  Serial.println("Verbinde WLAN...");
  unsigned long wifiStart = millis();
  cyc.wifiOk = connectWiFi();
  cyc.wifiConnectMs = millis() - wifiStart;

  if (!cyc.wifiOk) {
    Serial.println("WLAN fehlgeschlagen!");
    setErrorFlag(FLAG_WIFI_FAILED);
    wifiFailCount++;
    goToSleep(30 * 60);
    return;
  }
  Serial.printf("WLAN verbunden in %lums, IP %s\n",
                cyc.wifiConnectMs, WiFi.localIP().toString().c_str());

  // Zeit
  cyc.timeSyncOk = syncTimeNtp();
  if (!cyc.timeSyncOk) {
    Serial.println("Zeit-Sync fehlgeschlagen!");
    setErrorFlag(FLAG_TIME_SYNC_FAILED);
  }

  // Sensoren
  cyc.aht20Ok = aht.begin();
  Serial.println(cyc.aht20Ok ? "AHT20 OK" : "AHT20 FEHLER");
  if (!cyc.aht20Ok) setErrorFlag(FLAG_AHT20_MISSING);

  cyc.bh1750Ok = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
  Serial.println(cyc.bh1750Ok ? "BH1750 OK" : "BH1750 FEHLER");
  if (!cyc.bh1750Ok) setErrorFlag(FLAG_BH1750_MISSING);

  cyc.cycleTimestamp = buildTimestamp();
  int h, m, s;
  getLocalTimeParts(h, m, s);
  Serial.printf("Zeit: %02d:%02d:%02d\n", h, m, s);

  // Bodenfeuchtesensor einschalten und einschwingen lassen
  Serial.println("Sensor an, 60s Einschwingzeit...");
  moistureSensorOn();
  delay(MOISTURE_SETTLE_MS);

  // 18 Readings im Burst. Das Backend erwartet genau diese Anzahl,
  // um die Session sauber abzuschliessen.
  uint8_t readingsSent = 0;
  uint8_t readingsFailed = 0;
  float lastBattery = 0;
  String errors = "";

  Serial.println("Starte 18 Messungen...");
  for (int i = 0; i < READINGS_COUNT; i++) {
    int moisture = readMoistureSingle();

    float temperature = -99;
    float rh = -1;
    if (cyc.aht20Ok) {
      sensors_event_t hum, temp;
      aht.getEvent(&hum, &temp);
      temperature = temp.temperature;
      rh = hum.relative_humidity;
    }

    float lux = cyc.bh1750Ok ? lightMeter.readLightLevel() : -1;
    lastBattery = readBatteryVoltage();
    String timestamp = cyc.timeSyncOk ? buildTimestamp() : "1970-01-01T00";

    Serial.printf("Reading %2d/18: moisture=%d%% temp=%.1fC rh=%.1f%% lux=%.0f bat=%.2fV\n",
                  i + 1, moisture, temperature, rh, lux, lastBattery);

    int code = sendReading(moisture, temperature, lux, lastBattery, timestamp);

    if (code == 200 || code == 201) {
      readingsSent++;
    } else {
      readingsFailed++;
      Serial.printf("  HTTP Fehler: %d\n", code);
      if (errors.length() > 0) errors += ";";
      errors += "R" + String(i + 1) + ":" + String(code);
      setErrorFlag(FLAG_READINGS_FAILED);
      httpFailCount++;
    }

    if (i < READINGS_COUNT - 1) delay(READING_INTERVAL_MS);
  }

  moistureSensorOff();
  Serial.printf("Readings: %d/18 OK, %d fehlgeschlagen\n", readingsSent, readingsFailed);

  // Schlafzeit bestimmen
  getLocalTimeParts(h, m, s);
  uint64_t sleepSecs = calcSecondsUntilNextSlot(h, m, s);
  String nextWakeup  = calcNextWakeupStr(h, m, s, sleepSecs);

  if (sleepSecs == 0 || sleepSecs > 24 * 3600) {
    Serial.println("Schlaf-Berechnung Problem! Fallback 30 Min");
    setErrorFlag(FLAG_SLEEP_PROBLEM);
    sleepSecs = 30 * 60;
    nextWakeup = "n/a";
  }

  // Logs senden, bevor der Zustand fuer den naechsten Zyklus gesetzt wird
  Serial.println("Sende Logs...");
  bool logOk = sendLogs(readingsSent, readingsFailed, sleepSecs,
                        nextWakeup, errors, lastBattery, cyc.wifiConnectMs);
  if (!logOk) {
    Serial.println("Log-Senden fehlgeschlagen");
    setErrorFlag(FLAG_LOG_FAILED);
  }

  // Persistenten Zustand fuer den naechsten Zyklus aktualisieren
  lastReadingsSent = readingsSent;
  lastBatteryV     = lastBattery;
  if (readingsSent > 0) lastGoodHour = h;
  if (readingsSent == READINGS_COUNT) errorFlags = 0;  // sauberer Zyklus

  Serial.printf("Naechste Messung: %s (in %llu Min)\n", nextWakeup.c_str(), sleepSecs / 60);
  goToSleep(sleepSecs);
}

void loop() {}
