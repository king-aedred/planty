# Mobile Code Report V1

Inventar ohne `node_modules` und `.expo`-Cache.

## 1. Aktueller Stand Mobile App

- Expo Router ist auf eine Planty-App umgestellt.
- Clerk ist im Root-Layout verdrahtet, aber aktuell nur für Runtime mit vorhandenem `ClerkExpo`-Modul.
- Auth-Flows für Sign-in und Sign-up sind vorhanden.
- Home-Route und Redirects sind vorhanden.
- Dark-Mode-Farben liegen in `constants/colors.ts`.
- Dev-Client, EAS-Setup und `expo-updates` sind vorbereitet.
- Der erste echte Login ist noch nicht auf einem installierten Dev Build verifiziert.
- Die alte Expo-Starter-Navigation wurde entfernt.
- Die folgenden Expo-Starter-Dateien sind jetzt gelöscht: `components/hello-wave.tsx`, `components/parallax-scroll-view.tsx`, `components/external-link.tsx`, `components/haptic-tab.tsx`, `assets/images/react-logo.png`, `assets/images/react-logo@2x.png`, `assets/images/react-logo@3x.png`, `assets/images/partial-react-logo.png`.
- `EXPO_PUBLIC_CONVEX_URL` steht in der aktuellen `.env` noch als Platzhalter.

## 2. Datei-Inventar

| Pfad | Aufgabe | Status |
|---|---|---|
| `.env` | Env-Keys für Clerk/Convex | ⚠️ halbfertig |
| `.gitignore` | Git-Ignore-Regeln | ✅ fertig |
| `AGENTS.md` | Arbeitsanweisungen | ✅ fertig |
| `CLAUDE.md` | Projektanweisungen | ✅ fertig |
| `README.md` | Projekt-README | ⚠️ halbfertig |
| `app.json` | Expo-Konfiguration | ✅ fertig |
| `eas.json` | EAS Build-Profile | ✅ fertig |
| `eslint.config.js` | ESLint-Regeln | ✅ fertig |
| `expo-env.d.ts` | Expo TypeScript-Deklaration | ✅ fertig |
| `package.json` | Abhängigkeiten und Skripte | ✅ fertig |
| `package-lock.json` | Lockfile | ✅ fertig |
| `tsconfig.json` | TypeScript-Konfiguration | ✅ fertig |
| `app/_layout.tsx` | Root-Layout mit Clerk/Convex | ⚠️ halbfertig |
| `app/index.tsx` | Root-Redirect | ⚠️ halbfertig |
| `app/(auth)/_layout.tsx` | Auth-Route-Guard | ⚠️ halbfertig |
| `app/(auth)/sign-in.tsx` | E-Mail/Passwort Sign-in | ⚠️ halbfertig |
| `app/(auth)/sign-up.tsx` | E-Mail/Passwort Sign-up mit Code | ⚠️ halbfertig |
| `app/(home)/_layout.tsx` | Guard für eingeloggte Nutzer | ⚠️ halbfertig |
| `app/(home)/index.tsx` | Home-Screen mit Sign-out | ⚠️ halbfertig |
| `components/clerk-runtime-warning.tsx` | Fallback für fehlendes Native-Modul | ⚠️ halbfertig |
| `components/themed-text.tsx` | Themed Text | ✅ fertig |
| `components/themed-view.tsx` | Themed View | ✅ fertig |
| `components/ui/collapsible.tsx` | Collapsible UI | ✅ fertig |
| `components/ui/icon-symbol.tsx` | Icon-Fallback für Android/Web | ✅ fertig |
| `components/ui/icon-symbol.ios.tsx` | iOS SF Symbols | ✅ fertig |
| `constants/colors.ts` | Planty Dark-Mode-Farben | ✅ fertig |
| `constants/theme.ts` | Re-Export der Farben | ✅ fertig |
| `hooks/use-color-scheme.ts` | Farbmodus-Hook | ✅ fertig |
| `hooks/use-color-scheme.web.ts` | Web-Farbmodus-Hook | ✅ fertig |
| `hooks/use-theme-color.ts` | Theme-Farbzuordnung | ✅ fertig |
| `scripts/reset-project.js` | Expo-Reset-Skript | ✅ fertig |
| `assets/images/android-icon-background.png` | Android-Icon-Asset | ✅ fertig |
| `assets/images/android-icon-foreground.png` | Android-Icon-Asset | ✅ fertig |
| `assets/images/android-icon-monochrome.png` | Android-Icon-Asset | ✅ fertig |
| `assets/images/favicon.png` | Web-Favicon | ✅ fertig |
| `assets/images/icon.png` | App-Icon | ✅ fertig |
| `assets/images/splash-icon.png` | Splash-Icon | ✅ fertig |

## 3. Clerk Integration Stand

- `@clerk/expo` und `expo-secure-store` sind installiert.
- `ClerkProvider` ist im Root-Layout vorbereitet.
- Sign-in, Sign-up, Home und Redirects sind angelegt.
- `expo-dev-client`, `expo-updates` und `eas-cli` sind ergänzt.
- EAS-Projekt ist erstellt und mit dem lokalen Projekt verknüpft.
- Android-Development-Build läuft über EAS.
- Bis zum ersten erfolgreichen Login fehlt noch der installierte Dev Build auf dem Handy und ein erfolgreicher Runtime-Test mit echtem `ClerkExpo`.

## 4. Bekannte Probleme

- Expo Go kann `ClerkExpo` nicht laden.
- Die aktuelle App läuft deshalb nur mit Dev Build sauber.
- Der Fallback in `components/clerk-runtime-warning.tsx` ist nur eine Übergangslösung.
- `EXPO_PUBLIC_CONVEX_URL` ist in der aktuellen `.env` noch ein Platzhalter.
- EAS musste Projekt, Update-Channel und Android-Keystore erst anlegen.

## 5. Nächste Schritte Mobile

1. Android-Dev-Build aus EAS fertig herunterladen und auf dem Handy installieren.
2. `npx expo start --dev-client` lokal starten und die Dev-Build-App damit verbinden.
3. Echten Clerk-Login auf dem Gerät testen.
4. `EXPO_PUBLIC_CONVEX_URL` mit der echten Convex-URL ersetzen.
5. Danach den Fallback für Expo Go nur noch als explizite Notfall-Ansicht behandeln oder entfernen.