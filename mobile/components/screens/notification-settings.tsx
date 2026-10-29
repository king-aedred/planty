import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/fade-in'
import { SectionLabel } from '@/components/ui/section-label'
import { Stepper } from '@/components/ui/stepper'
import { Switch } from '@/components/ui/switch'
import { Ionicons } from '@expo/vector-icons'
import { type ComponentProps, type ReactNode, useState } from 'react'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { DetailHeader } from './detail-header'

type NotificationSettingsProps = {
  telegramConnected: boolean
  onBack: () => void
  onConnectTelegram: () => void
  ignoreReducedMotion?: boolean
}

function SettingRow({ icon, title, subtitle, control, divider }: { icon: ComponentProps<typeof Ionicons>['name']; title: string; subtitle?: string; control: ReactNode; divider?: boolean }) {
  const theme = useTheme()
  return (
    <XStack alignItems="center" gap="$12" paddingVertical="$12" paddingHorizontal="$12" borderTopWidth={divider ? 1 : 0} borderColor="$border">
      <YStack width={32} height={32} borderRadius="$8" backgroundColor="$surfaceElevated" alignItems="center" justifyContent="center">
        <Ionicons name={icon} size={17} color={theme.accentText?.val} />
      </YStack>
      <YStack flex={1} gap="$2">
        <Text fontFamily="$body" fontWeight="600" fontSize={15} color="$textPrimary">
          {title}
        </Text>
        {subtitle ? (
          <Text fontFamily="$body" fontSize={12} color="$textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </YStack>
      {control}
    </XStack>
  )
}

const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`

// Benachrichtigungen (Einstellungen): Kanäle, worüber, wie oft, Ruhezeiten.
export function NotificationSettingsScreen({ telegramConnected, onBack, onConnectTelegram, ignoreReducedMotion }: NotificationSettingsProps) {
  const [push, setPush] = useState(true)
  const [call, setCall] = useState(false)
  const [topics, setTopics] = useState({ water: true, temperature: true, light: false, sensor: true })
  const [maxPerDay, setMaxPerDay] = useState(3)
  const [quietFrom, setQuietFrom] = useState(21)
  const [quietTo, setQuietTo] = useState(8)
  const toggleTopic = (key: keyof typeof topics) => (value: boolean) => setTopics((current) => ({ ...current, [key]: value }))

  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 40 }}>
          <DetailHeader title="Benachrichtigungen" onBack={onBack} />

          <FadeIn duration={400} offset={10} ignoreReducedMotion={ignoreReducedMotion}>
            <YStack gap="$8">
              <SectionLabel>Wie</SectionLabel>
              <Card dense>
                <SettingRow icon="notifications-outline" title="Push" subtitle="Mitteilung aufs Handy" control={<Switch value={push} onChange={setPush} label="Push" />} />
                <SettingRow
                  divider
                  icon="paper-plane-outline"
                  title="Telegram"
                  subtitle={telegramConnected ? 'Nachricht im Telegram-Chat' : 'Nicht verbunden'}
                  control={
                    telegramConnected ? (
                      <XStack>
                        <Badge tone="success" label="Verbunden" />
                      </XStack>
                    ) : (
                      <Text fontFamily="$body" fontWeight="700" fontSize={13} color="$accentText" onPress={onConnectTelegram} role="button">
                        Verbinden
                      </Text>
                    )
                  }
                />
                <SettingRow divider icon="call-outline" title="Anruf" subtitle="Nur wenn es wirklich dringend ist" control={<Switch value={call} onChange={setCall} label="Anruf" />} />
              </Card>
            </YStack>
          </FadeIn>

          <FadeIn delay={70} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            <YStack gap="$8">
              <SectionLabel>Worüber</SectionLabel>
              <Card dense>
                <SettingRow icon="water-outline" title="Durst" subtitle="Boden zu trocken" control={<Switch value={topics.water} onChange={toggleTopic('water')} label="Durst" />} />
                <SettingRow divider icon="thermometer-outline" title="Temperatur" subtitle="Zu kalt oder zu warm" control={<Switch value={topics.temperature} onChange={toggleTopic('temperature')} label="Temperatur" />} />
                <SettingRow divider icon="sunny-outline" title="Licht" subtitle="Zu dunkel oder zu hell" control={<Switch value={topics.light} onChange={toggleTopic('light')} label="Licht" />} />
                <SettingRow divider icon="radio-outline" title="Sensor" subtitle="Akku schwach, keine Verbindung" control={<Switch value={topics.sensor} onChange={toggleTopic('sensor')} label="Sensor" />} />
              </Card>
            </YStack>
          </FadeIn>

          <FadeIn delay={140} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            <YStack gap="$8">
              <SectionLabel>Wie oft</SectionLabel>
              <Card>
                <XStack justifyContent="space-between" alignItems="baseline">
                  <Text fontFamily="$body" fontWeight="600" fontSize={14} color="$textPrimary">
                    Höchstens pro Pflanze und Tag
                  </Text>
                  <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                    {maxPerDay}
                  </Text>
                </XStack>
                <Stepper value={maxPerDay} min={1} max={10} onChange={setMaxPerDay} />
              </Card>
            </YStack>
          </FadeIn>

          <FadeIn delay={210} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            <YStack gap="$8">
              <SectionLabel>Ruhezeiten</SectionLabel>
              <Card>
                <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                  Von {pad(quietFrom)} bis {pad(quietTo)} Uhr bleibt es still. Dringendes kommt danach.
                </Text>
                <XStack gap="$12">
                  <YStack flex={1} gap="$6">
                    <Text fontFamily="$body" fontWeight="600" fontSize={13} color="$textPrimary">
                      Von
                    </Text>
                    <Stepper value={quietFrom} min={0} max={23} onChange={setQuietFrom} />
                  </YStack>
                  <YStack flex={1} gap="$6">
                    <Text fontFamily="$body" fontWeight="600" fontSize={13} color="$textPrimary">
                      Bis
                    </Text>
                    <Stepper value={quietTo} min={0} max={23} onChange={setQuietTo} />
                  </YStack>
                </XStack>
              </Card>
            </YStack>
          </FadeIn>
        </ScrollView>
      </SafeAreaView>
    </YStack>
  )
}
