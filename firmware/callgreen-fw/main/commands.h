#pragma once

#include <stdbool.h>

// Befehle laut Vertrag v7 §6 und v8 Abschnitt 4.3: GET /device/commands abfragen,
// der Reihe nach ausfuehren, POST /device/commands/ack. Idempotent ueber die id
// (die letzten 8 ausgefuehrten ids mit Ergebnis liegen im NVS).
// Braucht verbundenes WLAN. usb steuert den Messzyklus bei measure_now.
// Rueckgabe: false, wenn die Abfrage scheiterte.
bool commands_poll(bool usb);
