import type { DashboardPlant } from '@/components/plants/plant-dashboard'
import { demoTone, type DemoTone, TONE_COLOR } from '@/components/plants/dashboard-demo'
import { Button } from '@/components/ui/button'
import { FadeIn } from '@/components/ui/fade-in'
import { TextField } from '@/components/ui/text-field'
import { Ionicons } from '@expo/vector-icons'
import { type ReactNode, useState } from 'react'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { EmptyPotIllustration, PlantAvatar } from './plant-avatar'

// Adaptives Dashboard (Screen 6): wächst mit der Zahl der Pflanzen.
// 1 Pflanze: Bühne (die Pflanze füllt den Screen) plus optional Erfolge. Wenige (bis 6): Bühne für die
// wichtigste + ruhige Liste. Viele: Suche, „Braucht dich“, „Alles gut“, „Ohne Sensor“ als kompakte Listen.
// Reine Darstellung; Kopf (Titel, Plus) liefert dashboardHeader, die Seite drumherum der Aufrufer.

const MANY_FROM = 7

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

      {plant.quote ? (
        <YStack padding="$12" paddingHorizontal="$16" borderRadius="$16" borderTopLeftRadius="$4" backgroundColor={tone === 'critical' ? '$criticalSoft' : '$surfaceElevated'}>
          <Text fontFamily="$body" fontSize={large ? 18 : 16} lineHeight="$5" color="$textPrimary">
            „{plant.quote}“
          </Text>
        </YStack>
      ) : (
        // Noch keine Nachricht: kurzer Hinweis statt leerer Sprechblase.
        <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
          {plant.hasSensor === false
            ? `${plant.name} hat noch keinen Sensor. Koppel einen, dann meldet sie sich bei dir.`
            : `Sobald ${plant.name} etwas zu sagen hat, steht es hier.`}
        </Text>
      )}

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
          {plant.detail ?? ''}
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


export function dashboardHeader(plants: DashboardPlant[]) {
  const needsYou = plants.filter((plant) => demoTone(plant) === 'critical' || demoTone(plant) === 'warning').length
  return {
    title: plants.length === 1 ? 'Deine Pflanze' : 'Meine Pflanzen',
    subtitle:
      plants.length > 1 ? (needsYou > 0 ? `${needsYou} ${needsYou === 1 ? 'braucht' : 'brauchen'} dich · ${plants.length} insgesamt` : `Alle ${plants.length} sind glücklich`) : undefined,
  }
}

type AdaptiveDashboardContentProps = {
  plants: DashboardPlant[]
  onOpenPlant: (plant: DashboardPlant) => void
  // Bei genau einer Pflanze unter der Bühne (z. B. Erfolge).
  achievements?: ReactNode
  // Ohne Pflanzen: Einstieg zum Anlegen bzw. Koppeln.
  onAddPlant?: () => void
  onPairSensor?: () => void
}

export function AdaptiveDashboardContent({ plants, onOpenPlant, achievements, onAddPlant, onPairSensor }: AdaptiveDashboardContentProps) {
  const [search, setSearch] = useState('')
  const sorted = [...plants].sort((first, second) => URGENCY[demoTone(first)] - URGENCY[demoTone(second)] || first.name.localeCompare(second.name))
  const query = search.trim().toLowerCase()
  const filtered = query ? sorted.filter((plant) => plant.name.toLowerCase().includes(query) || (plant.speciesName ?? '').toLowerCase().includes(query)) : sorted
  const needsYou = filtered.filter((plant) => demoTone(plant) === 'critical' || demoTone(plant) === 'warning')
  const withoutSensor = filtered.filter((plant) => demoTone(plant) === 'neutral')
  const fine = filtered.filter((plant) => !needsYou.includes(plant) && !withoutSensor.includes(plant))

  if (plants.length === 0) {
    return (
      <FadeIn key="none" ignoreReducedMotion>
        <YStack padding="$20" gap="$12" alignItems="center" borderRadius="$16" backgroundColor="$surface" borderWidth={1} borderColor="$border">
          <YStack width={88} height={88} borderRadius="$999" backgroundColor="$surfaceElevated" borderWidth={1} borderColor="$border" alignItems="center" justifyContent="center">
            <EmptyPotIllustration />
          </YStack>
          <Text fontFamily="$heading" fontSize={24} color="$textPrimary" textAlign="center">
            Noch keine Pflanze
          </Text>
          <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary" textAlign="center">
            Leg deine erste Pflanze an. Mit Sensor erzählt sie dir, wie es ihr geht.
          </Text>
          <YStack alignSelf="stretch" gap="$8" marginTop="$4">
            {onAddPlant ? <Button onPress={onAddPlant}>Pflanze anlegen</Button> : null}
            {onPairSensor ? (
              <Button variant="secondary" onPress={onPairSensor}>
                Sensor koppeln
              </Button>
            ) : null}
          </YStack>
        </YStack>
      </FadeIn>
    )
  }

  if (plants.length === 1) {
    return (
      <YStack gap="$16">
        <FadeIn key="one" ignoreReducedMotion>
          <Spotlight plant={plants[0]} large onPress={() => onOpenPlant(plants[0])} />
        </FadeIn>
        {achievements ? (
          <FadeIn key="one-achievements" delay={120} ignoreReducedMotion>
            {achievements}
          </FadeIn>
        ) : null}
      </YStack>
    )
  }

  if (plants.length < MANY_FROM) {
    return (
      <FadeIn key="few" ignoreReducedMotion>
        <YStack gap="$16">
          <Spotlight plant={sorted[0]} large={false} onPress={() => onOpenPlant(sorted[0])} />
          <Section title="Weitere" count={sorted.length - 1}>
            {sorted.slice(1).map((plant, index) => (
              <Row key={plant.id} plant={plant} divider={index > 0} onPress={() => onOpenPlant(plant)} />
            ))}
          </Section>
        </YStack>
      </FadeIn>
    )
  }

  return (
    <FadeIn key="many" ignoreReducedMotion>
      <YStack gap="$16">
        <TextField label="Suchen" value={search} onChangeText={setSearch} autoCapitalize="none" />
        {needsYou.length > 0 ? (
          <Section title="Braucht dich" count={needsYou.length}>
            {needsYou.map((plant, index) => (
              <Row key={plant.id} plant={plant} divider={index > 0} onPress={() => onOpenPlant(plant)} />
            ))}
          </Section>
        ) : null}
        {fine.length > 0 ? (
          <Section title="Alles gut" count={fine.length}>
            {fine.map((plant, index) => (
              <Row key={plant.id} plant={plant} divider={index > 0} onPress={() => onOpenPlant(plant)} />
            ))}
          </Section>
        ) : null}
        {withoutSensor.length > 0 ? (
          <Section title="Ohne Sensor" count={withoutSensor.length}>
            {withoutSensor.map((plant, index) => (
              <Row key={plant.id} plant={plant} divider={index > 0} onPress={() => onOpenPlant(plant)} />
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
  )
}

// Plus-Knopf im Kopf des Dashboards.
export function AddPlantButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme()
  return (
    <YStack role="button" aria-label="Pflanze hinzufügen" onPress={onPress} width={40} height={40} borderRadius="$999" backgroundColor="$accent press:$accentPress" alignItems="center" justifyContent="center">
      <Ionicons name="add" size={22} color={theme.textOnAccent?.val} />
    </YStack>
  )
}
