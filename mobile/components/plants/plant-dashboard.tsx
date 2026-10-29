import Ionicons from '@expo/vector-icons/Ionicons'
import { type ComponentProps, useState } from 'react'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { Badge, type BadgeTone } from '../ui/badge'
import { FadeIn } from '../ui/fade-in'
import { TAB_BAR_SPACE } from '../ui/tab-bar'
import { EmptyPotIllustration, type PlantMood, PlantAvatar, type PlantStatusTone } from './plant-avatar'

// Dashboard "Meine Pflanzen" nach dem Stitch-Template. Reine Darstellung: Daten kommen als Props,
// damit die Ansicht auch mit Beispieldaten (app/ui-preview.tsx) gerendert werden kann.

type SummaryState = 'ok' | 'warning' | 'critical' | 'cold' | 'hot' | 'dark' | 'bright'
type IconName = ComponentProps<typeof Ionicons>['name']

export type DashboardPlant = {
  id: string
  name: string
  character?: 'happy' | 'grumpy' | 'neutral' | null
  speciesName?: string | null
  // Letzte Nachricht der Pflanze, als Zitat in der Detailansicht.
  quote?: string | null
  // Pflanze ohne gekoppelten Sensor: keine Messwerte, eigener Zustand mit „Sensor koppeln“.
  hasSensor?: boolean
  summary: {
    moisture_median: number
    temperature_median?: number
    light_level_median?: number
    moisture_state: SummaryState
    temperature_state?: SummaryState
    light_state?: SummaryState
  } | null
}

type PlantDashboardProps = {
  plants: DashboardPlant[] | undefined
  activeSensors: number
  totalSensors: number
  unreadCount: number
  onOpenPlant: (plantId: string) => void
  onAddPlant: () => void
  onPairSensor: () => void
  onOpenInbox: () => void
  onOpenProfile: () => void
  // Versteckte Geste (5x auf die Wortmarke): Demo-Anruf.
  onWordmarkPress?: () => void
  // Vorschau: Einblenden auch bei „Bewegung reduzieren“.
  ignoreReducedMotion?: boolean
}

// Einstieg: Kopf, Titel, Umschalter, Pflanzen und Knöpfe blenden nacheinander von unten ein.
const ENTRANCE_STEP_MS = 70
const ENTRANCE_MAX_ROWS = 6

type View = 'compact' | 'detailed'

export function PlantDashboard(props: PlantDashboardProps) {
  const { plants, activeSensors, totalSensors } = props
  const [view, setView] = useState<View>('compact')
  const isEmpty = plants !== undefined && plants.length === 0
  const ignore = props.ignoreReducedMotion
  const rowCount = Math.min(plants?.length ?? 0, ENTRANCE_MAX_ROWS)
  const buttonsDelay = 260 + rowCount * ENTRANCE_STEP_MS

  return (
    <YStack gap="$16">
      <FadeIn duration={500} offset={10} ignoreReducedMotion={ignore}>
        <DashboardHeader unreadCount={props.unreadCount} onOpenInbox={props.onOpenInbox} onOpenProfile={props.onOpenProfile} onWordmarkPress={props.onWordmarkPress} />
      </FadeIn>

      <FadeIn delay={90} duration={500} ignoreReducedMotion={ignore}>
        <YStack gap="$12">
          <XStack alignItems="flex-end" justifyContent="space-between" gap="$12">
            <YStack flex={1} gap="$2">
              <XStack alignItems="center" gap="$4">
                <ThemedIcon name="leaf" size={14} color="secondary" />
                <Text fontFamily="$body" fontWeight="700" fontSize={11} letterSpacing={0.8} textTransform="uppercase" color="$secondary">
                  Dashboard
                </Text>
              </XStack>
              <Text fontFamily="$heading" fontSize={28} lineHeight="$5" letterSpacing={0.6} textTransform="uppercase" color="$textPrimary">
                Meine Pflanzen
              </Text>
              {totalSensors > 0 ? (
                <XStack alignItems="center" gap="$6" marginTop="$2">
                  <YStack width={8} height={8} borderRadius="$999" backgroundColor={activeSensors > 0 ? '$success' : '$outline'} />
                  <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                    {activeSensors} von {totalSensors} {totalSensors === 1 ? 'Sensor' : 'Sensoren'} aktiv
                  </Text>
                </XStack>
              ) : null}
            </YStack>
          </XStack>

          {!isEmpty ? <ViewSwitcher value={view} onChange={setView} /> : null}
        </YStack>
      </FadeIn>

      {plants && plants.length > 0 ? (
        <YStack gap="$8">
          {plants.map((plant, index) => (
            <FadeIn key={plant.id} delay={200 + Math.min(index, ENTRANCE_MAX_ROWS) * ENTRANCE_STEP_MS} duration={500} ignoreReducedMotion={ignore}>
              {view === 'compact' ? (
                <CompactRow plant={plant} onPress={() => props.onOpenPlant(plant.id)} />
              ) : (
                <DetailedCard plant={plant} onPress={() => props.onOpenPlant(plant.id)} onPairSensor={props.onPairSensor} />
              )}
            </FadeIn>
          ))}
        </YStack>
      ) : null}

      <FadeIn delay={buttonsDelay} duration={500} ignoreReducedMotion={ignore}>
        <YStack gap="$6">
          <PillButton icon="add" label="Pflanze hinzufügen" variant="primary" onPress={props.onAddPlant} />
          <PillButton icon="radio-outline" label="Sensor koppeln" variant="secondary" onPress={props.onPairSensor} />
        </YStack>
      </FadeIn>

      {isEmpty ? <EmptyTeaser /> : null}

      <YStack height={TAB_BAR_SPACE} />
    </YStack>
  )
}

// --- Bausteine des Dashboards --------------------------------------------------

function ThemedIcon({ name, size, color }: { name: IconName; size: number; color: string }) {
  const theme = useTheme() as unknown as Record<string, { val: string } | undefined>
  return <Ionicons name={name} size={size} color={theme[color]?.val} />
}

function DashboardHeader({
  unreadCount,
  onOpenInbox,
  onOpenProfile,
  onWordmarkPress,
}: {
  unreadCount: number
  onOpenInbox: () => void
  onOpenProfile: () => void
  onWordmarkPress?: () => void
}) {
  const theme = useTheme()

  return (
    <XStack position="relative" height={56} alignItems="center" justifyContent="center">
      <Text
        onPress={onWordmarkPress}
        fontFamily="$heading"
        fontSize={32}
        letterSpacing={2}
        textTransform="uppercase"
        color="$accentText"
        // Leuchten der Wortmarke wie im Template
        textShadowColor="rgba(88, 68, 193, 0.45)"
        textShadowRadius={12}
        textShadowOffset={{ width: 0, height: 0 }}
      >
        Callgreen
      </Text>
      <XStack position="absolute" right={0} alignItems="center" gap="$8">
        <YStack
          role="button"
          aria-label="Benachrichtigungen"
          onPress={onOpenInbox}
          position="relative"
          width={44}
          height={44}
          borderRadius="$999"
          alignItems="center"
          justifyContent="center"
          backgroundColor="transparent press:$surfaceElevated"
        >
          <Ionicons name="notifications-outline" size={22} color={theme.textSecondary?.val} />
          {unreadCount > 0 ? (
            <YStack position="absolute" top={10} right={10} width={8} height={8} borderRadius="$999" backgroundColor="$success" borderWidth={2} borderColor="$background" />
          ) : null}
        </YStack>
        {/* Profil-Avatar: öffnet vorerst die Einstellungen. */}
        <YStack
          role="button"
          aria-label="Profil"
          onPress={onOpenProfile}
          width={32}
          height={32}
          borderRadius="$999"
          backgroundColor="$accentText press:$secondary"
          alignItems="center"
          justifyContent="center"
        >
          <Ionicons name="person" size={18} color={theme.accentPress?.val} />
        </YStack>
      </XStack>
    </XStack>
  )
}

function ViewSwitcher({ value, onChange }: { value: View; onChange: (view: View) => void }) {
  const theme = useTheme()
  const options: { value: View; label: string; icon: IconName }[] = [
    { value: 'compact', label: 'Kompakt', icon: 'reorder-four-outline' },
    { value: 'detailed', label: 'Detailliert', icon: 'grid-outline' },
  ]

  return (
    <XStack role="tablist" aria-label="Ansicht auswählen" backgroundColor="$surface" borderWidth={1} borderColor="$border" borderRadius="$999" padding="$4">
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <XStack
            key={option.value}
            role="tab"
            aria-selected={isActive}
            flex={1}
            onPress={() => onChange(option.value)}
            alignItems="center"
            justifyContent="center"
            gap="$6"
            paddingVertical="$6"
            borderRadius="$999"
            backgroundColor={isActive ? '$accent' : 'transparent'}
            opacity="1 press:0.85"
          >
            <Ionicons name={option.icon} size={16} color={isActive ? theme.textOnAccent?.val : theme.textSecondary?.val} />
            <Text fontFamily="$body" fontWeight="700" fontSize={11} letterSpacing={0.8} textTransform="uppercase" color={isActive ? '$textOnAccent' : '$textSecondary'}>
              {option.label}
            </Text>
          </XStack>
        )
      })}
    </XStack>
  )
}

function CompactRow({ plant, onPress }: { plant: DashboardPlant; onPress: () => void }) {
  const theme = useTheme()
  const status = plantStatus(plant)

  return (
    <XStack
      role="button"
      onPress={onPress}
      alignItems="center"
      justifyContent="space-between"
      gap="$8"
      paddingHorizontal="$16"
      paddingVertical="$12"
      borderRadius="$16"
      backgroundColor="$surface press:$surfaceElevated"
      borderWidth={1}
      borderColor="$border"
    >
      <XStack alignItems="center" gap="$12" flex={1} minWidth={0}>
        <PlantAvatar mood={moodOf(plant, status.tone)} status={status.tone} />
        <Text flex={1} fontFamily="$heading" fontSize={20} letterSpacing={0.4} textTransform="uppercase" color="$textPrimary" numberOfLines={1}>
          {plant.name}
        </Text>
      </XStack>
      <XStack alignItems="center" gap="$6">
        <Badge tone={status.tone as BadgeTone} label={status.label} />
        <Ionicons name="chevron-forward" size={18} color={theme.outlineVariant?.val} />
      </XStack>
    </XStack>
  )
}

function DetailedCard({ plant, onPress, onPairSensor }: { plant: DashboardPlant; onPress: () => void; onPairSensor: () => void }) {
  const status = plantStatus(plant)
  const withoutSensor = plant.hasSensor === false
  const summary = plant.summary
  const moistureColor = summary?.moisture_state === 'critical' ? 'criticalText' : summary?.moisture_state === 'warning' ? 'warning' : 'success'

  return (
    <YStack
      role="button"
      onPress={onPress}
      padding="$16"
      gap="$12"
      borderRadius="$16"
      backgroundColor="$surface press:$surfaceElevated"
      borderWidth={1}
      borderColor="$border"
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$12">
        <XStack alignItems="center" gap="$12" flex={1} minWidth={0}>
          <PlantAvatar mood={moodOf(plant, status.tone)} status={status.tone} />
          <YStack flex={1} minWidth={0} gap="$2">
            <Text fontFamily="$heading" fontSize={20} letterSpacing={0.4} textTransform="uppercase" color="$textPrimary" numberOfLines={1}>
              {plant.name}
            </Text>
            {plant.speciesName ? (
              <Text fontFamily="$body" fontSize={12} color="$textSecondary" numberOfLines={1}>
                {plant.speciesName}
              </Text>
            ) : null}
          </YStack>
        </XStack>
        <Badge tone={status.tone as BadgeTone} label={status.label} />
      </XStack>

      {withoutSensor ? (
        <XStack alignItems="center" justifyContent="space-between" gap="$8" paddingTop="$8" borderTopWidth={1} borderColor="$border">
          <Text flex={1} fontFamily="$body" fontSize={13} color="$textSecondary">
            Ohne Sensor gibt es keine Messwerte.
          </Text>
          <XStack role="button" onPress={onPairSensor} alignItems="center" gap="$4" opacity="1 press:0.7">
            <ThemedIcon name="radio-outline" size={14} color="accentText" />
            <Text fontFamily="$body" fontWeight="700" fontSize={12} letterSpacing={0.6} textTransform="uppercase" color="$accentText">
              Sensor koppeln
            </Text>
          </XStack>
        </XStack>
      ) : summary ? (
        <XStack alignItems="center" justifyContent="space-between" paddingTop="$8" borderTopWidth={1} borderColor="$border">
          <Metric icon="water" iconColor={moistureColor} value={`${formatNumber(summary.moisture_median)}%`} label="Boden" emphasis={summary.moisture_state !== 'ok'} valueColor={summary.moisture_state === 'ok' ? 'textPrimary' : moistureColor} />
          <Text color="$outlineVariant">·</Text>
          <Metric icon="thermometer" iconColor="secondary" value={summary.temperature_median !== undefined ? `${formatNumber(summary.temperature_median)}°` : '–'} label="Temp" />
          <Text color="$outlineVariant">·</Text>
          <Metric icon="sunny" iconColor="characterHappy" value={summary.light_level_median !== undefined ? formatInteger(summary.light_level_median) : '–'} label="lx" />
        </XStack>
      ) : (
        <Text fontFamily="$body" fontSize={13} color="$textSecondary" paddingTop="$8" borderTopWidth={1} borderColor="$border">
          Noch keine Messwerte.
        </Text>
      )}

      {withoutSensor ? null : (
        <XStack alignItems="center" justifyContent="space-between" gap="$8">
          <Text flex={1} fontFamily="$body" fontSize={12} color={status.tone === 'critical' ? '$criticalText' : status.tone === 'warning' ? '$warning' : '$textSecondary'} numberOfLines={1}>
            „{plant.quote ?? defaultQuote(status.tone)}“
          </Text>
          <CardAction hint={criticalHint(plant.summary)} onDetails={onPress} />
        </XStack>
      )}
    </YStack>
  )
}

function Metric({
  icon,
  iconColor,
  value,
  label,
  emphasis = false,
  valueColor = 'textPrimary',
}: {
  icon: IconName
  iconColor: string
  value: string
  label: string
  emphasis?: boolean
  valueColor?: string
}) {
  return (
    <XStack alignItems="center" gap="$6">
      <ThemedIcon name={icon} size={16} color={iconColor} />
      <Text fontFamily="$body" fontWeight={emphasis ? '700' : '600'} fontSize={14} color={`$${valueColor}`}>
        {value}
      </Text>
      <Text fontFamily="$body" fontWeight="500" fontSize={11} color="$textSecondary">
        {label}
      </Text>
    </XStack>
  )
}

// Rechts unten auf der Karte: bei kritischem Zustand ein Hinweis, was fehlt (kein Knopf, die App kann
// ja nicht selbst gießen), sonst „Details“.
function CardAction({ hint, onDetails }: { hint: string | null; onDetails: () => void }) {
  if (hint) {
    return (
      <XStack alignItems="center" gap="$4" paddingHorizontal={10} paddingVertical="$4" borderRadius="$999" backgroundColor="$criticalSoft">
        <ThemedIcon name="water" size={13} color="criticalText" />
        <Text fontFamily="$body" fontWeight="700" fontSize={11} letterSpacing={0.6} textTransform="uppercase" color="$criticalText">
          {hint}
        </Text>
      </XStack>
    )
  }
  return (
    <XStack role="button" onPress={onDetails} alignItems="center" gap="$2" opacity="1 press:0.7">
      <Text fontFamily="$body" fontWeight="700" fontSize={12} letterSpacing={0.6} textTransform="uppercase" color="$accentText">
        Details
      </Text>
      <ThemedIcon name="chevron-forward" size={14} color="accentText" />
    </XStack>
  )
}

function PillButton({ icon, label, variant, onPress }: { icon: IconName; label: string; variant: 'primary' | 'secondary'; onPress: () => void }) {
  const isPrimary = variant === 'primary'
  return (
    <XStack
      role="button"
      onPress={onPress}
      height={48}
      borderRadius="$999"
      alignItems="center"
      justifyContent="center"
      gap="$8"
      backgroundColor={isPrimary ? '$accent press:$accentPress' : '$surfaceElevated press:$surfaceHigh'}
    >
      <ThemedIcon name={icon} size={20} color={isPrimary ? 'textOnAccent' : 'secondary'} />
      <Text fontFamily="$body" fontWeight={isPrimary ? '700' : '600'} fontSize={14} letterSpacing={0.3} color={isPrimary ? '$textOnAccent' : '$secondary'}>
        {label}
      </Text>
    </XStack>
  )
}

function EmptyTeaser() {
  return (
    <YStack alignItems="center" padding="$16" gap="$8" borderRadius="$16" backgroundColor="$surface" borderWidth={1} borderColor="$border">
      <YStack width={80} height={80} borderRadius="$999" backgroundColor="$surfaceElevated" borderWidth={1} borderColor="$border" alignItems="center" justifyContent="center">
        <EmptyPotIllustration />
      </YStack>
      <Text fontFamily="$heading" fontSize={20} letterSpacing={0.4} textTransform="uppercase" color="$textPrimary">
        Deine Pflanzen warten
      </Text>
      <Text fontFamily="$body" fontSize={13} lineHeight="$3" color="$textSecondary" textAlign="center" maxWidth={280}>
        Verbinde deinen ersten Sensor und erfahre, wie es deinen Pflanzen geht.
      </Text>
    </YStack>
  )
}

// --- Zustand ableiten ------------------------------------------------------------

// Pflanze ohne Sensor: eigener, neutraler Zustand.
function plantStatus(plant: DashboardPlant): { tone: PlantStatusTone; label: string } {
  if (plant.hasSensor === false) return { tone: 'neutral', label: 'Kein Sensor' }
  return overallStatus(plant.summary)
}

// Was bei kritischem Zustand fehlt, in zwei Worten; null = nicht kritisch.
function criticalHint(summary: DashboardPlant['summary']): string | null {
  if (!summary) return null
  if (summary.moisture_state === 'critical') return 'Braucht Wasser'
  if (summary.temperature_state === 'hot') return 'Zu heiß'
  return null
}

// Fehlende Temperatur/Licht (Sensor ausgefallen) gilt wie im Backend als unauffällig.
function overallStatus(summary: DashboardPlant['summary']): { tone: PlantStatusTone; label: string } {
  if (!summary) return { tone: 'neutral', label: 'Keine Daten' }
  if (summary.moisture_state === 'critical' || summary.temperature_state === 'hot') return { tone: 'critical', label: 'Kritisch' }
  if (summary.moisture_state !== 'ok' || (summary.temperature_state ?? 'ok') !== 'ok' || (summary.light_state ?? 'ok') !== 'ok') {
    return { tone: 'warning', label: 'Achtung' }
  }
  return { tone: 'success', label: 'Alles gut' }
}

// Kritisch: trauriges Gesicht. Sonst der Charakter der Pflanze (Standard: neutral).
function moodOf(plant: DashboardPlant, tone: PlantStatusTone): PlantMood {
  if (tone === 'critical') return 'sad'
  return plant.character ?? 'neutral'
}

function defaultQuote(tone: PlantStatusTone) {
  if (tone === 'critical') return 'Ich brauche dich jetzt!'
  if (tone === 'warning') return 'Ich könnte etwas Aufmerksamkeit gebrauchen.'
  if (tone === 'success') return 'Alles bestens hier.'
  return 'Ich warte auf meine erste Messung.'
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(value)
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value)
}
