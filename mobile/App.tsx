import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";

import { api } from "../convex/_generated/api";
import { colors } from "./constants/colors";
import OnboardingScreen from "./screens/OnboardingScreen";
import StatusScreen from "./screens/StatusScreen";

const sensorId = "fake-sensor-001";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("EXPO_PUBLIC_CONVEX_URL is not set.");
}

const convexClient = new ConvexReactClient(convexUrl);

function PlantyApp() {
  const plant = useQuery(api.plants.getPlantBySensorId, {
    sensor_id: sensorId,
  });
  const latestSummary = useQuery(api.plants.getLatestSummary, {
    sensor_id: sensorId,
  });

  if (plant === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.state_ok} />
        <Text style={styles.loadingText}>Verbinde mit Convex ...</Text>
      </View>
    );
  }

  if (plant === null) {
    return <OnboardingScreen sensorId={sensorId} />;
  }

  return <StatusScreen plant={plant} latestSummary={latestSummary} />;
}

export default function App() {
  return (
    <ConvexProvider client={convexClient}>
      <StatusBar style="light" />
      <PlantyApp />
    </ConvexProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 16,
  },
  loadingText: {
    color: colors.text_secondary,
    fontSize: 16,
  },
});
