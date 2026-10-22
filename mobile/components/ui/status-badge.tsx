import { Badge, type BadgeTone } from './badge'

// Gerätezustände aus dem Backend (sensors.status) plus Akku-Stufen aus den Hinweisen (sensor_alerts).
export type DeviceState =
  | 'active'
  | 'offline'
  | 'charging'
  | 'measuring'
  | 'needs_remeasurement'
  | 'battery_low'
  | 'battery_critical'
  | 'unknown'

const STATES: Record<DeviceState, { label: string; tone: BadgeTone }> = {
  active: { label: 'Aktiv', tone: 'success' },
  offline: { label: 'Offline', tone: 'warning' },
  charging: { label: 'Lädt', tone: 'accent' },
  measuring: { label: 'Misst', tone: 'accent' },
  needs_remeasurement: { label: 'Neu messen', tone: 'warning' },
  battery_low: { label: 'Akku schwach', tone: 'warning' },
  battery_critical: { label: 'Akku leer', tone: 'critical' },
  unknown: { label: 'Unbekannt', tone: 'neutral' },
}

type StatusBadgeProps = {
  state: DeviceState
  // Eigener Text, z. B. "Aktiv · vor 5 Min."
  label?: string
}

export function StatusBadge({ state, label }: StatusBadgeProps) {
  const config = STATES[state] ?? STATES.unknown
  return <Badge tone={config.tone} label={label ?? config.label} />
}
