import { ListRow } from '@/components/ui/list-row'
import { Card } from '@/components/ui/card'
import { Screen } from '@/components/ui/screen'
import { ScreenHeader } from '@/components/ui/screen-header'
import { type Href, useRouter } from 'expo-router'
import { Text } from 'tamagui'

// Übersicht aller Screens aus docs/SCREENS.md, einzeln aufrufbar unter /preview/<nr>-<name>.
// href fehlt = noch nicht eingebunden.
const SCREENS: { nr: number | string; title: string; href?: Href }[] = [
  { nr: '★', title: 'Gesamtbild: App mit Navigation', href: '/preview/7-app' },
  { nr: 0, title: 'Willkommen (App-Start)', href: '/preview/0-welcome' },
  { nr: 1, title: 'Login', href: '/preview/1-login' },
  { nr: 2, title: 'Registrieren', href: '/preview/2-register' },
  { nr: '2b', title: 'Code eingeben (Demo, Code 123456)', href: '/preview/2b-code' },
  { nr: 3, title: 'Passwort vergessen', href: '/preview/3-forgot-password' },
  { nr: 4, title: 'Onboarding (neu)', href: '/preview/4-onboarding' },
  { nr: 5, title: 'Sensor koppeln (BLE)' },
  { nr: 6, title: 'Dashboard', href: '/preview/6-dashboard' },
  { nr: '6b', title: 'Dashboard leer', href: '/preview/6b-dashboard-empty' },
  { nr: '6v1', title: 'Dashboard-Variante: Garten', href: '/preview/6v1-garten' },
  { nr: '6v2', title: 'Dashboard-Variante: Stimmen', href: '/preview/6v2-stimmen' },
  { nr: '6v3', title: 'Dashboard-Variante: Daten', href: '/preview/6v3-daten' },
  { nr: '6v4', title: 'Dashboard-Variante: Adaptiv (1/3/12/100)', href: '/preview/6v4-adaptiv' },
  { nr: 7, title: 'Pflanzen-Detail' },
  { nr: 8, title: 'Pflanzen-Einstellungen' },
  { nr: 9, title: 'Pflanze hinzufügen' },
  { nr: 10, title: 'Sensor-Detail' },
  { nr: 11, title: 'Sensoren' },
  { nr: 12, title: 'Nachrichten' },
  { nr: 13, title: 'Einstellungen' },
]

export default function PreviewIndex() {
  const router = useRouter()

  return (
    <Screen scroll>
      <ScreenHeader eyebrow="Vorschau" title="Screens" subtitle="Jeder Screen einzeln, Reihenfolge nach docs/SCREENS.md." withMenu={false} />
      <Card dense>
        {SCREENS.map((screen, index) => (
          <ListRow
            key={screen.nr}
            divider={index > 0}
            title={`${screen.nr}. ${screen.title}`}
            subtitle={screen.href ? undefined : 'noch nicht eingebunden'}
            onPress={screen.href ? () => router.push(screen.href as Href) : undefined}
          />
        ))}
      </Card>
      <Text fontFamily="$body" fontSize={12} color="$textSecondary">
        Ohne Login aufrufbar. Aktionen wie „Anmelden“ laufen echt gegen dev.
      </Text>
    </Screen>
  )
}
