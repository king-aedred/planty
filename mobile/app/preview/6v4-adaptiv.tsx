import { PlantAvatar } from '@/components/plants/plant-avatar'
import type { DashboardPlant } from '@/components/plants/plant-dashboard'
import { demoTone, type DemoTone, TONE_COLOR } from '@/components/plants/dashboard-demo'
import { Achievements, type Badge } from '@/components/plants/achievements'
import { FadeIn } from '@/components/ui/fade-in'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { TextField } from '@/components/ui/text-field'
import { Ionicons } from '@expo/vector-icons'
import { type ReactNode, useMemo, useState } from 'react'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, useTheme, XStack, YStack } from 'tamagui'

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

const URGENCY: Record<DemoTone, number> = { critical: 0, warning: 1, neutral: 2, success: 3 }

function moodOf(plant: DashboardPlant, tone: DemoTone) {
  return tone === 'critical' ? 'sad' : plant.character ?? 'neutral'
}

function statusOf(tone: DemoTone) {
  return tone === 'neutral' ? 'neutral' : tone
}

// Bühne: eine Pflanze groß, mit Sprechblase und Messwerten.
function Spotlight({ plant, large, onPress }: { plant: DashboardPlant; large: boolean; onPress?: () => void }) {
  const theme = useTheme()
  const tone = demoTone(plant)
  const summary = plant.summary
  const metrics = summary
    ? [
        { icon: 'water' as const, value: `${summary.moisture_median} %`, label: 'Boden', color: TONE_COLOR[tone] },
        { icon: 'thermometer' as const, value: `${summary.temperature_median}°`, label: 'Temperatur', color: '$textPrimary' },
        { icon: 'sunny' as const, value: `${summary.light_level_median}`, label: 'Lux', color: '$textPrimary' },
      ]
    : []

  return (
    <YStack
      role="button"
      onPress={onPress}
      padding="$20"
      gap="$16"
      borderRadius="$16"
      backgroundColor="$surface press:$surfaceElevated"
      borderWidth={1}
      borderColor={tone === 'critical' ? '$critical' : '$border'}
    >
      <XStack alignItems="center" gap="$16">
        <PlantAvatar mood={moodOf(plant, tone)} status={statusOf(tone)} size={large ? 96 : 64} />
        <YStack flex={1} gap="$2">
          <Text fontFamily="$heading" fontSize={large ? 34 : 26} color="$textPrimary" numberOfLines={1}>
            {plant.name}
          </Text>
          <Text fontFamily="$body" fontSize={13} color="$textSecondary">
            {plant.speciesName}
          </Text>
        </YStack>
      </XStack>

      <YStack padding="$12" paddingHorizontal="$16" borderRadius="$16" borderTopLeftRadius="$4" backgroundColor={tone === 'critical' ? '$criticalSoft' : '$surfaceElevated'}>
        <Text fontFamily="$body" fontSize={large ? 18 : 16} lineHeight="$5" color="$textPrimary">
          „{plant.quote}“
        </Text>
      </YStack>

      <XStack gap="$8">
        {metrics.map((metric) => (
          <YStack key={metric.label} flex={1} padding="$12" gap="$4" borderRadius="$12" backgroundColor="$background" borderWidth={1} borderColor="$border">
            <Ionicons name={metric.icon} size={16} color={theme.textSecondary?.val} />
            <Text fontFamily="$heading" fontSize={22} color={metric.color}>
              {metric.value}
            </Text>
            <Text fontFamily="$body" fontSize={11} color="$textSecondary">
              {metric.label}
            </Text>
          </YStack>
        ))}
      </XStack>

      <XStack justifyContent="space-between" alignItems="center">
        <Text fontFamily="$body" fontSize={12} color="$textSecondary">
          Nächste Messung 14:00 · Akku 82 %
        </Text>
        <XStack alignItems="center" gap="$2">
          <Text fontFamily="$body" fontWeight="700" fontSize={12} letterSpacing={0.6} textTransform="uppercase" color="$accentText">
            Details
          </Text>
          <Ionicons name="chevron-forward" size={14} color={theme.accentText?.val} />
        </XStack>
      </XStack>
    </YStack>
  )
}

// Listenzeile: kompakt genug für 100 Pflanzen.
function Row({ plant, divider, onPress }: { plant: DashboardPlant; divider: boolean; onPress?: () => void }) {
  const theme = useTheme()
  const tone = demoTone(plant)
  return (
    <XStack
      role="button"
      onPress={onPress}
      alignItems="center"
      gap="$12"
      paddingVertical="$12"
      paddingHorizontal="$12"
      borderTopWidth={divider ? 1 : 0}
      borderColor="$border"
      backgroundColor="transparent press:$surfaceElevated"
    >
      <PlantAvatar mood={moodOf(plant, tone)} status={statusOf(tone)} size={36} />
      <YStack flex={1} minWidth={0}>
        <Text fontFamily="$body" fontWeight="600" fontSize={15} color="$textPrimary" numberOfLines={1}>
          {plant.name}
        </Text>
        <Text fontFamily="$body" fontSize={12} color={tone === 'success' ? '$textSecondary' : TONE_COLOR[tone]} numberOfLines={1}>
          {tone === 'success' ? plant.speciesName : tone === 'neutral' ? 'Kein Sensor' : plant.quote}
        </Text>
      </YStack>
      {tone === 'neutral' ? null : (
        <XStack alignItems="center" gap="$6">
          <Ionicons name="water" size={13} color={theme.textSecondary?.val} />
          <Text fontFamily="$body" fontWeight="700" fontSize={14} color={TONE_COLOR[tone]}>
            {plant.summary?.moisture_median ?? '–'} %
          </Text>
        </XStack>
      )}
      <Ionicons name="chevron-forward" size={16} color={theme.outlineVariant?.val} />
    </XStack>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <YStack gap="$8">
      <XStack alignItems="baseline" gap="$8">
        <Text fontFamily="$body" fontWeight="700" fontSize={12} letterSpacing={1} textTransform="uppercase" color="$textSecondary">
          {title}
        </Text>
        <Text fontFamily="$body" fontSize={12} color="$textSecondary">
          {count}
        </Text>
      </XStack>
      <YStack borderRadius="$16" backgroundColor="$surface" borderWidth={1} borderColor="$border" overflow="hidden">
        {children}
      </YStack>
    </YStack>
  )
}

const COUNTS = ['1', '3', '12', '100'] as const

type AdaptiveDashboardProps = {
  // Gesamtvorschau: Glocke weg (Nachrichten sind ein Tab), unten Platz für die Tab-Leiste.
  showBell?: boolean
  bottomSpace?: number
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

export function AdaptiveDashboard({ showBell = true, bottomSpace = 0, onOpenPlant, onAdd, renderPage, showCountSwitcher = true, initialCount = '1' }: AdaptiveDashboardProps) {
  const theme = useTheme()
  const [count, setCount] = useState<(typeof COUNTS)[number]>(initialCount)
  const [search, setSearch] = useState('')
  const plants = useMemo(() => makePlants(Number(count)), [count])

  const sorted = [...plants].sort((first, second) => URGENCY[demoTone(first)] - URGENCY[demoTone(second)] || first.name.localeCompare(second.name))
  const isMany = plants.length > 6
  const query = search.trim().toLowerCase()
  const filtered = query ? sorted.filter((plant) => plant.name.toLowerCase().includes(query) || (plant.speciesName ?? '').toLowerCase().includes(query)) : sorted
  const needsYou = filtered.filter((plant) => demoTone(plant) === 'critical' || demoTone(plant) === 'warning')
  const withoutSensor = filtered.filter((plant) => demoTone(plant) === 'neutral')
  const fine = filtered.filter((plant) => !needsYou.includes(plant) && !withoutSensor.includes(plant))

  const title = plants.length === 1 ? 'Deine Pflanze' : 'Meine Pflanzen'
  const subtitle =
    plants.length > 1 ? (needsYou.length > 0 ? `${needsYou.length} brauchen dich · ${plants.length} insgesamt` : `Alle ${plants.length} sind glücklich`) : undefined
  const addButton = (
    <YStack role="button" aria-label="Pflanze hinzufügen" onPress={onAdd} width={40} height={40} borderRadius="$999" backgroundColor="$accent press:$accentPress" alignItems="center" justifyContent="center">
      <Ionicons name="add" size={22} color={theme.textOnAccent?.val} />
    </YStack>
  )
  const content = (
    <>
          {showCountSwitcher ? (
            <YStack gap="$6">
              <Text fontFamily="$body" fontSize={11} color="$textSecondary">
                Vorschau: Anzahl Pflanzen
              </Text>
              <SegmentedControl
                options={COUNTS.map((value) => ({ value, label: value }))}
                value={count}
                onChange={(value) => {
                  setCount(value as (typeof COUNTS)[number])
                  setSearch('')
                }}
              />
            </YStack>
          ) : null}

          {plants.length === 1 ? (
            <YStack gap="$16">
              <FadeIn key="one" ignoreReducedMotion>
                <Spotlight plant={plants[0]} large onPress={() => onOpenPlant?.(plants[0])} />
              </FadeIn>
              <FadeIn key="one-achievements" delay={120} ignoreReducedMotion>
                <Achievements plantName={plants[0].name} happyDays={12} wateringStreak={5} badges={DEMO_BADGES} />
              </FadeIn>
            </YStack>
          ) : !isMany ? (
            <FadeIn key="few" ignoreReducedMotion>
              <YStack gap="$16">
                <Spotlight plant={sorted[0]} large={false} onPress={() => onOpenPlant?.(sorted[0])} />
                <Section title="Weitere" count={sorted.length - 1}>
                  {sorted.slice(1).map((plant, index) => (
                    <Row key={plant.id} plant={plant} divider={index > 0} onPress={() => onOpenPlant?.(plant)} />
                  ))}
                </Section>
              </YStack>
            </FadeIn>
          ) : (
            <FadeIn key={`many-${count}`} ignoreReducedMotion>
              <YStack gap="$16">
                <TextField label="Suchen" value={search} onChangeText={setSearch} autoCapitalize="none" />
                {needsYou.length > 0 ? (
                  <Section title="Braucht dich" count={needsYou.length}>
                    {needsYou.map((plant, index) => (
                      <Row key={plant.id} plant={plant} divider={index > 0} onPress={() => onOpenPlant?.(plant)} />
                    ))}
                  </Section>
                ) : null}
                {fine.length > 0 ? (
                  <Section title="Alles gut" count={fine.length}>
                    {fine.map((plant, index) => (
                      <Row key={plant.id} plant={plant} divider={index > 0} onPress={() => onOpenPlant?.(plant)} />
                    ))}
                  </Section>
                ) : null}
                {withoutSensor.length > 0 ? (
                  <Section title="Ohne Sensor" count={withoutSensor.length}>
                    {withoutSensor.map((plant, index) => (
                      <Row key={plant.id} plant={plant} divider={index > 0} onPress={() => onOpenPlant?.(plant)} />
                    ))}
                  </Section>
                ) : null}
                {filtered.length === 0 ? (
                  <Text fontFamily="$body" fontSize={14} color="$textSecondary" textAlign="center">
                    Keine Pflanze gefunden.
                  </Text>
                ) : null}
              </YStack>
            </FadeIn>
          )}
    </>
  )

  if (renderPage) {
    return renderPage({ title, subtitle, action: addButton }, content)
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 16 + bottomSpace, gap: 18 }} keyboardShouldPersistTaps="handled">
          <XStack justifyContent="space-between" alignItems="center">
            <YStack>
              <Text fontFamily="$heading" fontSize={30} color="$textPrimary">
                {title}
              </Text>
              {subtitle ? (
                <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                  {subtitle}
                </Text>
              ) : null}
            </YStack>
            <XStack gap="$8">
              {showBell ? (
                <YStack width={40} height={40} borderRadius="$999" backgroundColor="$surfaceElevated" alignItems="center" justifyContent="center">
                  <Ionicons name="notifications-outline" size={20} color={theme.textSecondary?.val} />
                </YStack>
              ) : null}
              {addButton}
            </XStack>
          </XStack>
          {content}
        </ScrollView>
      </SafeAreaView>
    </YStack>
  )
}
