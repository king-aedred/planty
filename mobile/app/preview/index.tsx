import { ListRow } from '@/components/ui/list-row'
import { Card } from '@/components/ui/card'
import { Screen } from '@/components/ui/screen'
import { ScreenHeader } from '@/components/ui/screen-header'
import { type Href, useRouter } from 'expo-router'
import { Text } from 'tamagui'

// Übersicht aller Screens aus docs/SCREENS.md, einzeln aufrufbar unter /preview/<nr>-<name>.
// href fehlt = noch nicht eingebunden.
const SCREENS: { nr: number | string; title: string; href?: Href }[] = [
  { nr: 0, title: 'Willkommen (App-Start)', href: '/preview/0-welcome' },
  { nr: 1, title: 'Login', href: '/preview/1-login' },
  { nr: 2, title: 'Registrieren', href: '/preview/2-register' },
  { nr: '2b', title: 'Code eingeben (Demo, Code 123456)', href: '/preview/2b-code' },
  { nr: 3, title: 'Passwort vergessen', href: '/preview/3-forgot-password' },
  { nr: 4, title: 'Einstieg / erste Pflanze' },
  { nr: 5, title: 'Sensor koppeln (BLE)' },
  { nr: 6, title: 'Dashboard (Demodaten, alter Stand)', href: '/dashboard-preview' },
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
