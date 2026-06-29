# Planty Code Report Phase 3

Hinweis: Im Workspace war keine lesbare `.env`-Datei auffindbar. Die folgenden Aussagen stützen sich daher auf die im Code referenzierten Umgebungsvariablen und auf die vorhandenen Implementierungen.

## 1. Projektuebersicht
Planty ist ein Pflanzen- und Sensor-Tracking-System mit drei Hauptteilen: einer Expo-Mobile-App, einer Convex-Datenebene und einem lokalen Hono-Backend fuer Dev- und Cron-Orchestrierung. Sensorwerte werden als Messreihen erfasst, pro Tag zu einem Summary aggregiert und anschliessend im Status-Screen angezeigt. Die App nutzt Clerk fuer Authentifizierung und einen Convex-Client fuer Reads/Writes. Der Dev-Mode kann Sensor-Sessions simulieren oder den Cron-Job manuell ausloesen, was den kompletten Datenfluss lokal testbar macht. Der aktuelle Stand ist funktional fuer Demo- und Entwicklungsbetrieb, aber nicht production-ready wegen fehlender Haertung, dev-spezifischer Trust-Annahmen und teils unvollstaendiger Fehlerbehandlung.

## 2. Systemarchitektur
```text
                     +----------------------+
                     |     fake_sensor.py   |
                     |  CONVEX_HTTP_URL env |
                     +----------+-----------+
                                |
                                | POST /readings
                                v
                     +----------------------+
                     |  convex/http.ts      |
                     |  httpAction /readings|
                     |  createReading()     |
                     +----------+-----------+
                                |
                                v
                     +----------------------+
                     |     Convex DB        |
                     | readings / summaries |
                     +----------+-----------+
                                |
          +---------------------+----------------------+
          |                                            |
          | query/mutation                             | query
          v                                            v
+---------------------------+               +---------------------------+
| backend/src/lib/processor  |               | mobile/app/(home)/status  |
| processSessionIfReady()    |               | useQuery(getPlantsBy... ) |
+-------------+-------------+               | useQuery(getLatestSummary)|
              |                             +-------------+-------------+
              | if >= MIN_READINGS_REQUIRED                |
              v                                            |
   +---------------------------+                            |
   | convex/readings.ts        |                            |
   | getReadingsBySensorAndDate|                            |
   | getSummaryBySensorAndDate |                            |
   | createDailySummary()      |                            |
   | deleteReadingsBySensor...  |                            |
   +-------------+-------------+                            |
                 |                                          |
                 v                                          |
         +---------------+                                  |
         | daily_summaries|<---------------------------------+
         +---------------+

Mobile Dev Flow:
mobile/app/(home)/devmode.tsx
  -> GET /dev/info
  -> POST /dev/simulate (scenario + device_id)
  -> POST /dev/trigger-cron
backend/src/routes/devmode.ts
  -> convex.mutation(api.http.createReading)
  -> processSessionIfReady()
  -> runCronJobOnce()
backend/src/jobs/cronJob.ts
  -> getSensorIdsNeedingProcessing()
  -> processSessionIfReady()
```

## 3. Datei-Inventar
Status-Legende: `✅ fertig` = implementiert und im aktuellen Flow verwendbar. `⚠️ halbfertig` = technisch vorhanden, aber schwach, nur teilweise genutzt oder mit klaren Gaps. `❌ fehlt` = im Workspace nicht vorhanden oder im betrachteten Bereich nicht auffindbar.

### Convex
| Pfad | Aufgabe | Status |
|---|---|---|
| [convex/http.ts](../convex/http.ts) | HTTP-Ingestion fuer `POST /readings` und `GET /readings`; schreibt Rohmessungen in `readings`. | ✅ fertig |
| [convex/plants.ts](../convex/plants.ts) | Plant-Queries und -Mutation; verbindet Clerk-User mit Sensor/Device-ID und liefert das neueste Tages-Summary. | ✅ fertig |
| [convex/readings.ts](../convex/readings.ts) | Tagesabfragen, Summary-Lookups, Summary-Erzeugung und Loeschung alter Rohdaten. | ✅ fertig |
| [convex/schema.ts](../convex/schema.ts) | Datenmodell fuer users, sensors, readings, plants und daily_summaries. | ✅ fertig |
| [convex/sensors.ts](../convex/sensors.ts) | Sensor-Registrierung, Last-Seen-Updates und Device-ID-Lookups. | ✅ fertig |
| [convex/users.ts](../convex/users.ts) | User-Erzeugung und Dev-User-Pruefung via Clerk-ID. | ✅ fertig |
| [convex/_generated/api.d.ts](../convex/_generated/api.d.ts) | Generierte Type-Contracts fuer Client/Server-Aufrufe. | ✅ fertig |
| [convex/_generated/api.js](../convex/_generated/api.js) | Generierte Laufzeit-API-Referenz fuer Convex-Aufrufe. | ✅ fertig |
| [convex/_generated/dataModel.d.ts](../convex/_generated/dataModel.d.ts) | Generiertes Datamodel-Interface. | ✅ fertig |
| [convex/_generated/server.d.ts](../convex/_generated/server.d.ts) | Generierte Server-Typen fuer Functions. | ✅ fertig |
| [convex/_generated/server.js](../convex/_generated/server.js) | Generierte Server-Runtime. | ✅ fertig |
| [convex/_generated/ai/ai-files.state.json](../convex/_generated/ai/ai-files.state.json) | Generierter Zustand fuer AI-/Guideline-Assets. | ⚠️ halbfertig |
| [convex/_generated/ai/guidelines.md](../convex/_generated/ai/guidelines.md) | Generierte Richtlinien-/Hilfsdatei, nicht Teil des Produktpfads. | ⚠️ halbfertig |

### Backend/src
| Pfad | Aufgabe | Status |
|---|---|---|
| [backend/src/config.ts](../backend/src/config.ts) | Laedt `.env`, parst Runtime-Flags und erzwingt `CONVEX_URL`. | ✅ fertig |
| [backend/src/index.ts](../backend/src/index.ts) | Hono-App, `/` Health-Text, `/api/status/:sensor_id/:date`, Mount von Dev-Routen, Cron-Start. | ✅ fertig |
| [backend/src/jobs/cronJob.ts](../backend/src/jobs/cronJob.ts) | Periodischer Cron-Runner und einmaliger Cron-Trigger. | ✅ fertig |
| [backend/src/lib/analysis.ts](../backend/src/lib/analysis.ts) | Median- und Zustandslogik fuer Moisture/Temperature/Light. | ✅ fertig |
| [backend/src/lib/convex.ts](../backend/src/lib/convex.ts) | ConvexHttpClient fuer Backend-Abfragen und Mutationen. | ✅ fertig |
| [backend/src/lib/processor.ts](../backend/src/lib/processor.ts) | Aggregiert Tagesdaten, erstellt Summary und loescht Rohdaten. | ✅ fertig |
| [backend/src/routes/devmode.ts](../backend/src/routes/devmode.ts) | Dev-Endpunkte fuer Simulation, Cron-Trigger und Info-Query. | ✅ fertig |

### Mobile/app
| Pfad | Aufgabe | Status |
|---|---|---|
| [mobile/app/_layout.tsx](../mobile/app/_layout.tsx) | Root-Provider fuer Clerk und Convex; bricht bei fehlenden Env-Variablen ab. | ✅ fertig |
| [mobile/app/index.tsx](../mobile/app/index.tsx) | Einstieg/Redirect zwischen Auth und Home. | ✅ fertig |
| [mobile/app/(auth)/_layout.tsx](../mobile/app/(auth)/_layout.tsx) | Auth-Stack und Redirect fuer eingeloggte User. | ✅ fertig |
| [mobile/app/(auth)/sign-in.tsx](../mobile/app/(auth)/sign-in.tsx) | Eigener Sign-in-Flow mit Passwort und optionalem MFA-Code. | ✅ fertig |
| [mobile/app/(auth)/sign-up.tsx](../mobile/app/(auth)/sign-up.tsx) | Eigener Sign-up-Flow mit Email-Bestaetigung. | ✅ fertig |
| [mobile/app/(home)/_layout.tsx](../mobile/app/(home)/_layout.tsx) | Home-Stack fuer Index, Onboarding, Status und Devmode. | ✅ fertig |
| [mobile/app/(home)/index.tsx](../mobile/app/(home)/index.tsx) | Post-Login-Routing: User anlegen, Pflanzenstatus pruefen, Redirect. | ✅ fertig |
| [mobile/app/(home)/onboarding.tsx](../mobile/app/(home)/onboarding.tsx) | Erste Pflanze und Sensor registrieren. | ✅ fertig |
| [mobile/app/(home)/status.tsx](../mobile/app/(home)/status.tsx) | Status-Screen mit Summary-Karten und Logout. | ✅ fertig |
| [mobile/app/(home)/devmode.tsx](../mobile/app/(home)/devmode.tsx) | Dev-Tools zum Simulieren von Sensoren und Triggern des Cron-Laufs. | ✅ fertig |

### Mobile/components
| Pfad | Aufgabe | Status |
|---|---|---|
| [mobile/components/burger-menu.tsx](../mobile/components/burger-menu.tsx) | Seitenmenue mit Navigation zu Status/Dev-Tools und Logout. | ✅ fertig |
| [mobile/components/clerk-runtime-warning.tsx](../mobile/components/clerk-runtime-warning.tsx) | Hinweis auf noetigen Dev Build fuer Clerk; derzeit UI ohne wirksame Aktion. | ⚠️ halbfertig |
| [mobile/components/themed-text.tsx](../mobile/components/themed-text.tsx) | Generische Themed-Text-Komponente aus dem Starter-Template. | ⚠️ halbfertig |
| [mobile/components/themed-view.tsx](../mobile/components/themed-view.tsx) | Generische Themed-View-Komponente aus dem Starter-Template. | ⚠️ halbfertig |
| [mobile/components/ui/collapsible.tsx](../mobile/components/ui/collapsible.tsx) | Generische Collapsible-Komponente aus dem Starter-Template. | ⚠️ halbfertig |
| [mobile/components/ui/icon-symbol.tsx](../mobile/components/ui/icon-symbol.tsx) | iOS-/Web-Icon-Mapping fuer Starter-UI. | ⚠️ halbfertig |
| [mobile/components/ui/icon-symbol.ios.tsx](../mobile/components/ui/icon-symbol.ios.tsx) | iOS-Implementation fuer SF Symbols. | ⚠️ halbfertig |

### Mobile/constants
| Pfad | Aufgabe | Status |
|---|---|---|
| [mobile/constants/colors.ts](../mobile/constants/colors.ts) | Farbpalette fuer Light/Dark Theme. | ✅ fertig |
| [mobile/constants/theme.ts](../mobile/constants/theme.ts) | Re-Export der Theme-Konstanten. | ⚠️ halbfertig |

### Root-Sensor
| Pfad | Aufgabe | Status |
|---|---|---|
| [fake_sensor.py](../fake_sensor.py) | Python-Simulator, der 18 Messungen an den Convex-HTTP-Endpunkt schickt. | ✅ fertig |

## 4. Was funktioniert end-to-end
- Authentifizierung und App-Start funktionieren als geschlossener Loop ueber [mobile/app/_layout.tsx](../mobile/app/_layout.tsx) und [mobile/app/index.tsx](../mobile/app/index.tsx): Clerk liefert den Login-State, Convex wird als React-Client eingebunden, und eingelogte User werden direkt in den Home-Bereich geroutet.
- Onboarding funktioniert von der UI bis zur Persistenz ueber [mobile/app/(home)/onboarding.tsx](../mobile/app/(home)/onboarding.tsx), [convex/sensors.ts](../convex/sensors.ts), [convex/plants.ts](../convex/plants.ts) und den Redirect nach [mobile/app/(home)/status.tsx](../mobile/app/(home)/status.tsx): Sensor wird registriert, Plant wird angelegt, danach landet der User im Status-Screen.
- Die Status-Anzeige funktioniert ueber [mobile/app/(home)/status.tsx](../mobile/app/(home)/status.tsx), [convex/plants.ts](../convex/plants.ts) und [convex/readings.ts](../convex/readings.ts): Der Screen holt die Plant-Liste fuer die Clerk-ID, ermittelt die Device-ID und laedt das neueste Tages-Summary.
- Die Dev-Tool-Kette funktioniert ueber [mobile/app/(home)/devmode.tsx](../mobile/app/(home)/devmode.tsx), [backend/src/routes/devmode.ts](../backend/src/routes/devmode.ts), [backend/src/jobs/cronJob.ts](../backend/src/jobs/cronJob.ts) und [backend/src/lib/processor.ts](../backend/src/lib/processor.ts): Dev-User koennen Info, Simulation und Cron-Trigger ausloesen.
- Der Sensor-Ingest-Flow funktioniert ueber [fake_sensor.py](../fake_sensor.py), [convex/http.ts](../convex/http.ts) und [convex/readings.ts](../convex/readings.ts): Rohmessungen werden validiert, gespeichert und spaeter zu Tages-Summaries verarbeitet.
- Die taegliche Verdichtung funktioniert ueber [backend/src/lib/processor.ts](../backend/src/lib/processor.ts) und die Analysefunktionen in [backend/src/lib/analysis.ts](../backend/src/lib/analysis.ts): Sobald genug Messungen vorliegen, wird ein Median berechnet, ein State abgeleitet und der Rohdatensatz bereinigt.

## 5. Production Readiness
| Komponente | Production Ready? | Was fehlt konkret |
|---|---|---|
| Mobile App Bootstrap | Nein | Hartes Failen bei fehlenden Env-Variablen ist ok fuer Dev, aber es fehlen Deploy-/Config-Checks, eine klare Runtime-Feature-Gate-Strategie und ein sauberer Fallback fuer Clerk/Convex-Fehler. |
| Mobile Auth/Onboarding/Status | Nein | Der Flow ist funktional, aber es fehlen robuste Loading-/Error-States, Multi-Plant-Navigation, Retry-Strategien und klare Leerrandfaelle. |
| Mobile Dev-Tools | Nein | Der Dev-Mode nutzt Trust ueber Header, hardcodierte Server-Kandidaten und direkte LAN-Abfragen; fuer Production ungeeignet. |
| Backend HTTP Ingestion | Nein | Der Endpunkt ist praktisch offen, ohne starke Authentisierung, Rate-Limits oder Replay-Schutz. |
| Backend Dev Routes | Nein | `/dev/*` ist bewusst dev-only und nur ueber Header-Trust abgesichert; fuer Production nicht tragfaehig. |
| Backend Cron/Processing | Nein | Es fehlen Locking, Idempotenz-Hardening, Monitoring und ein definierter Umgang mit parallelen Cron-Läufen. |
| Convex Schema und Functions | Eher nein | Das Modell ist brauchbar, aber `device_id`/`sensor_id` sind teilweise doppelt belegt, und die Abfrage-/Loeschlogik ist nicht auf hohe Last oder konkurrierende Writes optimiert. |
| fake_sensor.py | Nein | Kein Auth- oder Security-Layer, nur Test-/Demo-Transport per HTTP. |
| Starter-UI-Komponenten | Nein | Sie sind nicht in den Produktpfad integriert und wirken wie Restbestand aus dem Template. |

## 6. Offene Vulnerabilities
| Name | Beschreibung | Prioritaet | Warum aktuell noch okay |
|---|---|---|---|
| Spoofbare Dev-Authentisierung | Die Dev-Routen pruefen nur `x-clerk-id` plus `isDevUser`-Lookup. Wer den Header setzen kann, faehrt denselben Pfad. | Hoch | Akzeptabel nur im lokalen, vertrauenswuerdigen Dev-Setup. |
| Offener Ingest-Endpoint | `convex/http.ts` nimmt Messwerte ohne Nutzerauth an. | Hoch | Noch okay, weil der Endpunkt fuer Simulator und interne Tests gedacht ist. |
| Plain-HTTP Dev-Transport | `mobile/app/(home)/devmode.tsx` und `fake_sensor.py` arbeiten mit HTTP und LAN-/Emulator-URLs. | Mittel | Noch okay fuer lokale Entwicklung und Emulatoren, aber nicht fuer reale Deployments. |
| Header-basierter Cron-Trigger | `/dev/trigger-cron` kann durch jeden mit Headerzugang ausgeloest werden. | Mittel | Noch okay, weil der ganze Pfad als Dev-Tool gedacht ist. |
| Kein Rate-Limit / Abuse-Schutz | Weder Ingest noch Dev-Routen haben Drosselung oder Missbrauchsschutz. | Mittel | Noch okay in einem kleinen, kontrollierten Testsystem mit wenigen, bekannten Clients. |
| Lokale `.env`-Abhaengigkeit | Sensible Runtime-Konfiguration wird direkt aus einer lokalen Datei geladen. | Niedrig | Noch okay fuer Entwickler-Workstations; im Produktivbetrieb muss das ueber verwaltete Secret Stores laufen. |

## 7. Bekannte Bugs und Schwächen
- [mobile/app/(home)/devmode.tsx](../mobile/app/(home)/devmode.tsx) referenziert in einem Error-Fallback `BASE_URL`, obwohl diese Konstante nicht definiert ist. Das ist ein echter Laufzeitfehler in der Fehlerbehandlung.
- [fake_sensor.py](../fake_sensor.py) sendet Timestamp-Werte nur mit Stundenauflösung. Dadurch kollidieren viele Messungen auf demselben Zeitstempel und die Daten sind fuer feingranulare Auswertung schwach.
- [mobile/app/(home)/status.tsx](../mobile/app/(home)/status.tsx) nimmt bei fehlenden Route-Parametern einfach die erste Plant des Users. Bei mehreren Pflanzen kann dadurch leicht der falsche Status angezeigt werden.
- [backend/src/routes/devmode.ts](../backend/src/routes/devmode.ts) loescht Summaries vor dem Reprozessieren, setzt aber keine explizite Sperre gegen parallele Ausfuehrungen. Ein gleichzeitiger Trigger kann zu Race Conditions im Dev-Flow fuehren.
- [backend/src/lib/processor.ts](../backend/src/lib/processor.ts) verarbeitet Tagesdaten nur, wenn die Mindestanzahl erreicht ist. Das ist korrekt, aber der Zustand "noch nicht genug Daten" wird nicht persistent markiert.
- [convex/readings.ts](../convex/readings.ts) filtert nach dem Query teilweise nochmal in Memory. Das ist fuer kleine Mengen ok, skaliert aber nicht elegant.
- [mobile/components/clerk-runtime-warning.tsx](../mobile/components/clerk-runtime-warning.tsx) sieht wie ein Hinweisbildschirm aus, hat aber keinen wirksamen Button-Callback und ist im Produktfluss nicht verdrahtet.
- Die Dateien [mobile/components/themed-text.tsx](../mobile/components/themed-text.tsx), [mobile/components/themed-view.tsx](../mobile/components/themed-view.tsx), [mobile/components/ui/collapsible.tsx](../mobile/components/ui/collapsible.tsx), [mobile/components/ui/icon-symbol.tsx](../mobile/components/ui/icon-symbol.tsx) und [mobile/components/ui/icon-symbol.ios.tsx](../mobile/components/ui/icon-symbol.ios.tsx) sind faktisch Starter-Template-Reste und tragen nicht zum aktuellen Produkt-Flow bei.

## 8. Naechste Schritte
1. Den Dev-Flow absichern: Header-basierte Trust-Annahmen durch belastbare Rollen-/Tokenpruefung ersetzen und Dev-Routen strikt von produktiven Pfaden trennen.
2. Den Ingest- und Processing-Pfad idempotent machen: Locking, Duplikat-Schutz und klare Wiederanlaufregeln fuer Cron und `/dev/simulate` einfuehren.
3. Die Datenmodell-Entscheidung festziehen: `device_id` und `sensor_id` konsolidieren oder eine explizite Migrationsstrategie definieren.
4. Fehlertoleranz in der App erhoehen: Loading-/Retry-/Empty-States im Status-, Onboarding- und Dev-Mode-Screen ausbauen.
5. Observation einfuehren: strukturierte Logs fuer Ingest, Processing und Dev-Trigger sowie klare Fehlercodes fuer die UI.
6. Die Sensor-Simulation produktionsnaeher machen: realistischere Timestamp-Granularitaet, konfigurierbare Anzahl Messungen und deterministische Szenarien fuer Tests.
7. Unbenutzte Starter-Komponenten entfernen oder in ein echtes Design-System ueberfuehren.

## 9. Offene Architektur Entscheidungen
- Soll der Sensor direkt nach Convex schreiben, oder soll alles ueber das Hono-Backend als Ingest-Proxy laufen? Das beeinflusst Security, Latenz und Observability.
- Soll die Aggregation im Backend-Cron bleiben oder in eine Convex-nahe, serverseitige Scheduling-Logik verschoben werden? Das entscheidet ueber Betriebsmodell und Fehlerhandling.
- Ist `device_id` oder `sensor_id` die kanonische Identitaet eines Sensors? Der aktuelle Doppelgebrauch macht den Code an mehreren Stellen schwerer wartbar.
- Soll das Projekt auf eine einzelne Pflanze pro User optimiert bleiben oder explizit Multi-Plant-Unterstuetzung bekommen? Das betrifft Routing, Datenmodell und UI.
- Wie strikt soll der Dev-Mode von produktiven Funktionen getrennt werden? Davon haengt ab, ob die Dev-Routen in derselben App und demselben Backend bleiben koennen.
- Sollen Rohdaten nach der Tagesaggregation geloescht werden oder langfristig fuer Historie und Reprocessing erhalten bleiben? Das bestimmt Speicherbedarf, Compliance und Analysefaehigkeit.
