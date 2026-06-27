import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";
import { colors } from "../constants/colors";

type OnboardingScreenProps = {
  sensorId: string;
};

export default function OnboardingScreen({ sensorId }: OnboardingScreenProps) {
  const createPlant = useMutation(api.plants.createPlant);
  const [plantName, setPlantName] = useState("");
  const [currentSensorId, setCurrentSensorId] = useState(sensorId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmedName = plantName.trim();
    const trimmedSensorId = currentSensorId.trim();

    if (!trimmedName || !trimmedSensorId) {
      setErrorMessage("Bitte Pflanzenname und Sensor ID ausfüllen.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await createPlant({
        sensor_id: trimmedSensorId,
        name: trimmedName,
      });
    } catch {
      setErrorMessage("Pflanze konnte nicht angelegt werden.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: "padding", android: undefined })}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroCard}>
            <Text style={styles.title}>Willkommen bei Planty 🌱</Text>
            <Text style={styles.subtitle}>
              Verbinde deinen Sensor, vergib einen Namen für deine Pflanze und
              beobachte Feuchtigkeit, Temperatur und Licht in Dark Mode.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Pflanzenname</Text>
            <TextInput
              value={plantName}
              onChangeText={setPlantName}
              placeholder="Meine Monstera"
              placeholderTextColor={colors.text_secondary}
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
              selectionColor={colors.state_ok}
            />

            <Text style={[styles.label, styles.secondaryLabel]}>Sensor ID</Text>
            <TextInput
              value={currentSensorId}
              onChangeText={setCurrentSensorId}
              placeholder="fake-sensor-001"
              placeholderTextColor={colors.text_secondary}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor={colors.state_ok}
            />

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.button,
                pressed && !isSubmitting ? styles.buttonPressed : null,
                isSubmitting ? styles.buttonDisabled : null,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.text_primary} />
              ) : (
                <Text style={styles.buttonText}>Pflanze anlegen</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: 20,
    gap: 16,
    backgroundColor: colors.background,
  },
  heroCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  title: {
    color: colors.text_primary,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.text_secondary,
    fontSize: 16,
    lineHeight: 24,
  },
  formCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  label: {
    color: colors.text_primary,
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryLabel: {
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text_primary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  errorText: {
    color: colors.state_critical,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  button: {
    marginTop: 8,
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.state_ok,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.text_primary,
    fontSize: 16,
    fontWeight: "700",
  },
});