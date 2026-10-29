import { AddPlantButton, AdaptiveDashboardContent, dashboardHeader } from '@/components/plants/adaptive-dashboard'
import type { DashboardPlant } from '@/components/plants/plant-dashboard'
import { Achievements, type Badge } from '@/components/plants/achievements'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { type ReactNode, useMemo, useState } from 'react'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'

// Variante 4 „Adaptiv“: Das Dashboard wächst mit der Zahl der Pflanzen.
// 1 Pflanze: Bühne (die Pflanze füllt den Screen). Wenige: Bühne für die wichtigste + ruhige Liste.
// Viele: Suche, „Braucht dich“ oben, alles andere als kompakte Liste (trägt auch 100 Pflanzen).

const NAMES = ['Monty', 'Cleo', 'Ben', 'Pepe', 'Ruby', 'Fritz', 'Lotte', 'Kalle', 'Mia', 'Otto', 'Greta', 'Paul', 'Ida', 'Theo', 'Frieda', 'Emil']
const SPECIES = ['Monstera', 'Calathea', 'Birkenfeige', 'Ufopflanze', 'Gummibaum', 'Efeutute', 'Bogenhanf', 'Zamioculcas', 'Einblatt', 'Drachenbaum']
const QUOTES = {
  success: ['Mir geht’s blendend, danke!', 'Perfektes Licht heute!', 'Alles im grünen Bereich.'],
  warning: ['Bald ein Schluck Wasser bitte.', 'Ein bisschen trocken hier …'],
  critical: ['Ich verdurste! 350 ml nötig.', 'Wasser. Jetzt. Bitte.'],
}
const CHARACTERS = ['happy', 'grumpy', 'neutral'] as const

// Deterministische Beispielpflanzen (gleiche Anzahl = gleiche Liste).
export function makePlants(count: number): DashboardPlant[] {
  return Array.from({ length: count }, (_, index) => {
    const roll = (index * 37 + 11) % 20
    const state = index === 1 ? 'critical' : roll < 2 ? 'critical' : roll < 5 ? 'warning' : 'ok'
    const moisture = state === 'critical' ? 8 + (index % 6) : state === 'warning' ? 20 + (index % 8) : 45 + (index % 20)
    const name = NAMES[index % NAMES.length] + (index >= NAMES.length ? ` ${Math.floor(index / NAMES.length) + 1}` : '')
    const tone = state === 'ok' ? 'success' : state
    const quotes = QUOTES[tone]
    // Jede siebte Pflanze (ab der fünften) hat noch keinen Sensor.
    if (index % 7 === 4) {
      return { id: `p${index}`, name, character: CHARACTERS[index % 3], speciesName: SPECIES[index % SPECIES.length], hasSensor: false, summary: null }
    }
    return {
      id: `p${index}`,
      detail: 'Nächste Messung 14:00 · Akku 82 %',
      name,
      character: CHARACTERS[index % 3],
      speciesName: SPECIES[index % SPECIES.length],
      quote: quotes[index % quotes.length],
      summary: {
        moisture_median: moisture,
        temperature_median: 19 + (index % 6),
        light_level_median: 600 + ((index * 173) % 2000),
        moisture_state: state,
        temperature_state: 'ok',
        light_state: 'ok',
      },
    }
  })
}

// Beispiel-Abzeichen für die Vorschau.
const DEMO_BADGES: Badge[] = [
  { id: 'first-week', icon: 'calendar', label: 'Erste Woche', earned: true },
  { id: 'never-thirsty', icon: 'water', label: 'Nie verdurstet', earned: true },
  { id: 'sun', icon: 'sunny', label: 'Sonnenkind', earned: true },
  { id: 'month', icon: 'trophy', label: '30 Tage glücklich', earned: false },
  { id: 'friends', icon: 'people', label: 'Pflanzen-Clique', earned: false },
]

const COUNTS = ['1', '3', '12', '100'] as const

type AdaptiveDashboardProps = {
  onOpenPlant?: (plant: DashboardPlant) => void
  onAdd?: () => void
  // Eigene Seite drumherum (Gesamtbild mit App-Kopf): bekommt Titel, Untertitel und Plus-Knopf plus den Inhalt.
  renderPage?: (header: { title: string; subtitle?: string; action: ReactNode }, content: ReactNode) => ReactNode
  // Umschalter für die Anzahl (nur zum Ausprobieren); ohne ihn gilt initialCount.
  showCountSwitcher?: boolean
  initialCount?: (typeof COUNTS)[number]
}

export default function AdaptiveVariant() {
  return <AdaptiveDashboard />
}

// Vorschau des adaptiven Dashboards mit Beispielpflanzen (Baustein: components/plants/adaptive-dashboard.tsx).
export function AdaptiveDashboard({ onOpenPlant, onAdd, renderPage, showCountSwitcher = true, initialCount = '1' }: AdaptiveDashboardProps) {
  const [count, setCount] = useState<(typeof COUNTS)[number]>(initialCount)
  const plants = useMemo(() => makePlants(Number(count)), [count])
  const header = dashboardHeader(plants)
  const addButton = <AddPlantButton onPress={() => onAdd?.()} />
  const content = (
    <>
      {showCountSwitcher ? (
        <YStack gap="$6">
          <Text fontFamily="$body" fontSize={11} color="$textSecondary">
            Vorschau: Anzahl Pflanzen
          </Text>
          <SegmentedControl options={COUNTS.map((value) => ({ value, label: value }))} value={count} onChange={(value) => setCount(value as (typeof COUNTS)[number])} />
        </YStack>
      ) : null}
      <AdaptiveDashboardContent
        key={count}
        plants={plants}
        onOpenPlant={(plant) => onOpenPlant?.(plant)}
        achievements={
          <Achievements
            stats={[
              { icon: 'leaf', color: '$success', value: '12', label: `Tage ist ${plants[0]?.name} schon glücklich` },
              { icon: 'water', color: '$accentText', value: '5×', label: 'in Folge rechtzeitig gegossen' },
            ]}
            badges={DEMO_BADGES}
          />
        }
      />
    </>
  )

  if (renderPage) {
    return renderPage({ ...header, action: addButton }, content)
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }} keyboardShouldPersistTaps="handled">
          <XStack justifyContent="space-between" alignItems="center">
            <YStack>
              <Text fontFamily="$heading" fontSize={30} color="$textPrimary">
                {header.title}
              </Text>
              {header.subtitle ? (
                <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                  {header.subtitle}
                </Text>
              ) : null}
            </YStack>
            {addButton}
          </XStack>
          {content}
        </ScrollView>
      </SafeAreaView>
    </YStack>
  )
}
