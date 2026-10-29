import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ListRow } from '@/components/ui/list-row'
import { SectionLabel } from '@/components/ui/section-label'
import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { Text, useTheme, XStack, YStack } from 'tamagui'

type SettingsOverviewProps = {
  userName: string
  email: string
  push: boolean
  telegramConnected: boolean
  call: boolean
  // z. B. „8 bis 21 Uhr“ und „3 Nachrichten je Pflanze“.
  windowText: string
  maxPerDayText: string
  version: string
  onOpenProfile: () => void
  onOpenNotifications: () => void
  onShowTerms: () => void
  onSignOut: () => void
  // Nur für Entwickler.
  onOpenDevTools?: () => void
}

// Einstellungen (Tab): Kontokarte, Benachrichtigungen, Konto, Über Callgreen.
export function SettingsOverview(props: SettingsOverviewProps) {
  const theme = useTheme()
  const icon = (name: ComponentProps<typeof Ionicons>['name']) => (
    <YStack width={32} height={32} borderRadius="$8" backgroundColor="$surfaceElevated" alignItems="center" justifyContent="center">
      <Ionicons name={name} size={17} color={theme.accentText?.val} />
    </YStack>
  )
  const onOff = (on: boolean, onLabel = 'An') => <Badge tone={on ? 'success' : 'neutral'} label={on ? onLabel : 'Aus'} />

  return (
    <YStack gap="$16">
      <XStack
        role="button"
        onPress={props.onOpenProfile}
        padding="$16"
        gap="$12"
        alignItems="center"
        borderRadius="$16"
        backgroundColor="$surface press:$surfaceElevated"
        borderWidth={1}
        borderColor="$border"
      >
        <YStack width={56} height={56} borderRadius="$999" backgroundColor="$accent" alignItems="center" justifyContent="center">
          <Text fontFamily="$heading" fontSize={24} color="$textOnAccent">
            {(props.userName.trim()[0] ?? '?').toUpperCase()}
          </Text>
        </YStack>
        <YStack flex={1}>
          <Text fontFamily="$body" fontWeight="700" fontSize={17} color="$textPrimary" numberOfLines={1}>
            {props.userName}
          </Text>
          <Text fontFamily="$body" fontSize={13} color="$textSecondary" numberOfLines={1}>
            {props.email}
          </Text>
        </YStack>
        <Ionicons name="chevron-forward" size={18} color={theme.outlineVariant?.val} />
      </XStack>

      <YStack gap="$8">
        <SectionLabel>Benachrichtigungen</SectionLabel>
        <Card dense>
          <ListRow leading={icon('notifications-outline')} title="Push" trailing={onOff(props.push)} onPress={props.onOpenNotifications} />
          <ListRow divider leading={icon('paper-plane-outline')} title="Telegram" trailing={onOff(props.telegramConnected, 'Verbunden')} onPress={props.onOpenNotifications} />
          <ListRow divider leading={icon('call-outline')} title="Anruf" trailing={onOff(props.call)} onPress={props.onOpenNotifications} />
          <ListRow divider leading={icon('time-outline')} title="Erreichbar" subtitle={props.windowText} onPress={props.onOpenNotifications} />
          <ListRow divider leading={icon('chatbubbles-outline')} title="Höchstens pro Tag" subtitle={props.maxPerDayText} onPress={props.onOpenNotifications} />
        </Card>
      </YStack>

      <YStack gap="$8">
        <SectionLabel>Konto</SectionLabel>
        <Card dense>
          <ListRow leading={icon('person-outline')} title="Profil" subtitle="Name, E-Mail, Telefonnummer" onPress={props.onOpenProfile} />
          <ListRow divider leading={icon('key-outline')} title="Passwort ändern" onPress={props.onOpenProfile} />
          {props.onOpenDevTools ? <ListRow divider leading={icon('construct-outline')} title="Dev Tools" onPress={props.onOpenDevTools} /> : null}
          <ListRow divider leading={icon('log-out-outline')} title="Abmelden" onPress={props.onSignOut} />
        </Card>
      </YStack>

      <YStack gap="$8">
        <SectionLabel>Über Callgreen</SectionLabel>
        <Card dense>
          <ListRow leading={icon('document-text-outline')} title="Nutzungsbedingungen" onPress={props.onShowTerms} />
          <ListRow divider leading={icon('shield-checkmark-outline')} title="Datenschutz" onPress={props.onShowTerms} />
        </Card>
      </YStack>

      <Text fontFamily="$body" fontSize={12} color="$textSecondary" textAlign="center">
        Callgreen {props.version}
      </Text>
    </YStack>
  )
}
