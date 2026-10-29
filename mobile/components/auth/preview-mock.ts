// Testdaten für die Vorschau (/preview): Login und Registrieren laufen dort ohne Clerk, nichts wird
// angelegt und keine Mail verschickt. Nur diese Eingaben führen weiter.
export const MOCK_EMAIL = 'test@test.test'
export const MOCK_PASSWORD = '12345678'
export const MOCK_CODE = '111111'
// Registrieren mit dieser Adresse simuliert „E-Mail schon vergeben“.
export const MOCK_TAKEN_EMAIL = 'vergeben@test.test'
// Nach erfolgreichem Code geht es hierhin (Dashboard mit Demodaten).
export const MOCK_HOME = '/preview/7-app'

// Simulierte Antwortzeit des Servers.
export function mockDelay(ms = 700) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
