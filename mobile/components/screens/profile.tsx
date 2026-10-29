import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/fade-in'
import { ListRow } from '@/components/ui/list-row'
import { SectionLabel } from '@/components/ui/section-label'
import { TextField } from '@/components/ui/text-field'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, useTheme, YStack } from 'tamagui'
import { DetailHeader } from './detail-header'

type ProfileProps = {
  name: string
  email: string
  phone: string
  onBack: () => void
  onSave: () => void
  onDeleteAccount: () => void
  ignoreReducedMotion?: boolean
}

// Profil (Konto): Name, E-Mail, Telefonnummer, Passwort ändern, Konto löschen.
export function ProfileScreen({ name: initialName, email: initialEmail, phone: initialPhone, onBack, onSave, onDeleteAccount, ignoreReducedMotion }: ProfileProps) {
  const theme = useTheme()
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)
  const [phone, setPhone] = useState(initialPhone)
  const [sheet, setSheet] = useState<'password' | 'delete' | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [notice, setNotice] = useState('')
  const isDirty = name !== initialName || email !== initialEmail || phone !== initialPhone

  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <DetailHeader title="Profil" onBack={onBack} />

          <FadeIn duration={400} offset={10} ignoreReducedMotion={ignoreReducedMotion}>
            <YStack alignItems="center" gap="$8" paddingVertical="$8">
              <YStack width={88} height={88} borderRadius="$999" backgroundColor="$accent" alignItems="center" justifyContent="center">
                <Text fontFamily="$heading" fontSize={38} color="$textOnAccent">
                  {(name.trim()[0] ?? '?').toUpperCase()}
                </Text>
              </YStack>
              {notice ? (
                <Text fontFamily="$body" fontSize={13} color="$success">
                  {notice}
                </Text>
              ) : null}
            </YStack>
          </FadeIn>

          <FadeIn delay={80} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            <Card>
              <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
              <TextField label="E-Mail-Adresse" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
              {email !== initialEmail ? (
                <Text fontFamily="$body" fontSize={12} color="$textSecondary">
                  Die neue Adresse bestätigst du mit einem Code, den wir dir schicken.
                </Text>
              ) : null}
              <TextField label="Handynummer (für Anrufe)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </Card>
          </FadeIn>

          <FadeIn delay={140} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            <YStack gap="$8">
              <SectionLabel>Sicherheit</SectionLabel>
              <Card dense>
                <ListRow
                  leading={<Ionicons name="key-outline" size={18} color={theme.accentText?.val} />}
                  title="Passwort ändern"
                  onPress={() => {
                    setCurrentPassword('')
                    setNewPassword('')
                    setSheet('password')
                  }}
                />
              </Card>
            </YStack>
          </FadeIn>

          <FadeIn delay={200} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            <Button variant="danger" onPress={() => setSheet('delete')}>
              Konto löschen
            </Button>
          </FadeIn>
        </ScrollView>

        <YStack position="absolute" left={16} right={16} bottom={24}>
          <Button
            onPress={() => {
              setNotice('Gespeichert')
              onSave()
            }}
            disabled={!isDirty || !name.trim()}
          >
            Speichern
          </Button>
        </YStack>
      </SafeAreaView>

      <BottomSheet visible={sheet !== null} onClose={() => setSheet(null)}>
        {sheet === 'password' ? (
          <>
            <Text fontFamily="$heading" fontSize={24} color="$textPrimary">
              Passwort ändern
            </Text>
            <TextField label="Aktuelles Passwort" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
            <TextField label="Neues Passwort" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
            <Button
              onPress={() => {
                setSheet(null)
                setNotice('Passwort geändert')
              }}
              disabled={!currentPassword || newPassword.length < 8}
            >
              Passwort speichern
            </Button>
          </>
        ) : (
          <>
            <Text fontFamily="$heading" fontSize={24} color="$textPrimary">
              Konto löschen?
            </Text>
            <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
              Alle Pflanzen, Verläufe und Nachrichten werden gelöscht. Deine Sensoren werden frei und können neu gekoppelt werden. Das lässt sich nicht rückgängig machen.
            </Text>
            <Button
              variant="danger"
              onPress={() => {
                setSheet(null)
                onDeleteAccount()
              }}
            >
              Konto endgültig löschen
            </Button>
            <Button variant="ghost" onPress={() => setSheet(null)}>
              Abbrechen
            </Button>
          </>
        )}
      </BottomSheet>
    </YStack>
  )
}
