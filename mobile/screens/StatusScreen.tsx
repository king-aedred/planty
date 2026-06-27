import { StatusBar } from "expo-status-bar";
import { useWindowDimensions } from "react-native";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Doc } from "../../convex/_generated/dataModel";
import { colors } from "../constants/colors";

type StatusScreenProps = {
  plant: Doc<"plants">;
  latestSummary: Doc<"daily_summaries"> | null | undefined;
};

type MetricCardProps = {
  emoji: string;
  label: string;
  value: string;
  stateLabel: string;
  stateColor: string;
};

function MetricCard({
  emoji,
  label,
  value,
  stateLabel,
  stateColor,
}: MetricCardProps) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricEmoji}>{emoji}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <View style={[styles.stateBadge, { backgroundColor: stateColor }]}> 
        <Text style={styles.stateBadgeText}>{stateLabel}</Text>
      </View>
    </View>
  );
}

export default function StatusScreen({
  plant,
  latestSummary,
}: StatusScreenProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 720;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar style="light" />

      <View style={styles.headerCard}>
        <Text style={styles.plantName}>{plant.name}</Text>
        <Text style={styles.sensorId}>{plant.sensor_id}</Text>
      </View>

      <View
        style={[
          styles.metricsGrid,
          isWide ? styles.metricsGridWide : styles.metricsGridStack,
        ]}
      >
        {latestSummary === undefined ? (
          <View style={styles.loadingSummaryCard}>
            <ActivityIndicator color={colors.state_ok} />
            <Text style={styles.loadingSummaryText}>Lade letzten Status ...</Text>
          </View>
        ) : latestSummary === null ? (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderEmoji}>🌱</Text>
            <Text style={styles.placeholderText}>
              Noch keine Daten – Sensor sendet heute zum ersten Mal
            </Text>
          </View>
        ) : (
          <>
            <MetricCard
              emoji="💧"
              label="Feuchtigkeit"
              value={`${latestSummary.moisture_median}%`}
              stateLabel={latestSummary.moisture_state.toUpperCase()}
              stateColor={getMoistureStateColor(latestSummary.moisture_state)}
            />
            <MetricCard
              emoji="🌡️"
              label="Temperatur"
              value={`${latestSummary.temperature_median}°C`}
              stateLabel={latestSummary.temperature_state.toUpperCase()}
              stateColor={getTemperatureStateColor(latestSummary.temperature_state)}
            />
            <MetricCard
              emoji="☀️"
              label="Licht"
              value={`${latestSummary.light_level_median} Lux`}
              stateLabel={latestSummary.light_state.toUpperCase()}
              stateColor={getLightStateColor(latestSummary.light_state)}
            />
          </>
        )}
      </View>

      {latestSummary ? (
        <View style={styles.footerCard}>
          <Text style={styles.footerLabel}>Zuletzt aktualisiert</Text>
          <Text style={styles.footerValue}>
            {new Date(latestSummary.created_at).toLocaleString("de-DE", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function getMoistureStateColor(state: Doc<"daily_summaries">["moisture_state"]) {
  switch (state) {
    case "critical":
      return colors.state_critical;
    case "low":
      return colors.state_warning;
    default:
      return colors.state_ok;
  }
}

function getTemperatureStateColor(
  state: Doc<"daily_summaries">["temperature_state"],
) {
  switch (state) {
    case "cold":
      return colors.state_warning;
    case "hot":
      return colors.state_critical;
    default:
      return colors.state_ok;
  }
}

function getLightStateColor(state: Doc<"daily_summaries">["light_state"]) {
  switch (state) {
    case "ok":
      return colors.state_ok;
    case "dark":
    case "bright":
    default:
      return colors.state_warning;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    gap: 16,
    backgroundColor: colors.background,
  },
  headerCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  plantName: {
    color: colors.text_primary,
    fontSize: 28,
    fontWeight: "700",
  },
  sensorId: {
    color: colors.text_secondary,
    fontSize: 15,
  },
  metricsGrid: {
    gap: 12,
  },
  metricsGridStack: {
    flexDirection: "column",
  },
  metricsGridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 210,
    padding: 18,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  metricEmoji: {
    fontSize: 28,
  },
  metricLabel: {
    color: colors.text_secondary,
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metricValue: {
    color: colors.text_primary,
    fontSize: 30,
    fontWeight: "700",
  },
  stateBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  stateBadgeText: {
    color: colors.text_primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  placeholderCard: {
    flex: 1,
    padding: 24,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 240,
  },
  placeholderEmoji: {
    fontSize: 28,
  },
  placeholderText: {
    color: colors.text_secondary,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  loadingSummaryCard: {
    flex: 1,
    minHeight: 240,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingSummaryText: {
    color: colors.text_secondary,
    fontSize: 15,
  },
  footerCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  footerLabel: {
    color: colors.text_secondary,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  footerValue: {
    color: colors.text_primary,
    fontSize: 16,
    fontWeight: "600",
  },
});