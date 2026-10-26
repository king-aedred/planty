// Nutzungsbedingungen. Platzhalter: Abschnitte stehen, Texte folgen (vor der Beta juristisch prüfen lassen).
export type LegalSection = { heading: string; body: string }

export const TERMS_OF_USE: { title: string; status: string; sections: LegalSection[] } = {
  title: 'Nutzungsbedingungen',
  status: 'Entwurf · Inhalt folgt',
  sections: [
    { heading: '1. Geltungsbereich', body: 'Text folgt.' },
    { heading: '2. Leistungen von Callgreen', body: 'Text folgt.' },
    { heading: '3. Dein Konto', body: 'Text folgt.' },
    { heading: '4. Sensor und Benachrichtigungen', body: 'Text folgt.' },
    { heading: '5. Daten und Datenschutz', body: 'Text folgt.' },
    { heading: '6. Haftung', body: 'Text folgt.' },
    { heading: '7. Schlussbestimmungen', body: 'Text folgt.' },
  ],
}
