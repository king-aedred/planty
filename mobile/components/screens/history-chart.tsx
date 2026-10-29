import { useState } from 'react'
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { Text, useTheme, XStack, YStack } from 'tamagui'

type HistoryChartProps = {
  values: number[]
  color: string
  unit: string
  // Optionaler Zielbereich als helles Band (z. B. Feuchte ab Schwellenwert).
  band?: { min: number; max: number }
  // Beschriftung links/rechts unter der Kurve (z. B. „vor 24 Std.“ / „jetzt“).
  startLabel: string
  endLabel: string
}

const HEIGHT = 150

// Verlaufslinie mit Farbverlauf darunter; Breite passt sich dem Platz an.
export function HistoryChart({ values, color, unit, band, startLabel, endLabel }: HistoryChartProps) {
  const theme = useTheme()
  const [width, setWidth] = useState(0)

  if (values.length < 2) {
    return (
      <YStack height={HEIGHT} alignItems="center" justifyContent="center">
        <Text fontFamily="$body" fontSize={13} color="$textSecondary">
          Noch kein Verlauf
        </Text>
      </YStack>
    )
  }

  const min = Math.min(...values, band?.min ?? Infinity)
  const max = Math.max(...values, band?.max ?? -Infinity)
  const pad = (max - min) * 0.12 || 1
  const low = min - pad
  const high = max + pad
  const y = (value: number) => HEIGHT - ((value - low) / (high - low)) * HEIGHT
  const x = (index: number) => (index / (values.length - 1)) * width
  const line = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ')
  const area = `${line} L${width},${HEIGHT} L0,${HEIGHT} Z`
  const last = values[values.length - 1]

  return (
    <YStack gap="$6">
      <XStack justifyContent="space-between">
        <Text fontFamily="$body" fontSize={11} color="$textSecondary">
          max {Math.max(...values)} {unit}
        </Text>
        <Text fontFamily="$body" fontSize={11} color="$textSecondary">
          min {Math.min(...values)} {unit}
        </Text>
      </XStack>
      <YStack height={HEIGHT} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id="history-fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.3} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {band ? <Rect x={0} y={y(band.max)} width={width} height={Math.max(0, y(band.min) - y(band.max))} fill={theme.successSoft?.val} /> : null}
            {[0.25, 0.5, 0.75].map((fraction) => (
              <Line key={fraction} x1={0} x2={width} y1={HEIGHT * fraction} y2={HEIGHT * fraction} stroke={theme.border?.val} strokeWidth={1} />
            ))}
            <Path d={area} fill="url(#history-fill)" />
            <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Rect x={width - 5} y={y(last) - 5} width={10} height={10} rx={5} fill={color} />
          </Svg>
        ) : null}
      </YStack>
      <XStack justifyContent="space-between">
        <Text fontFamily="$body" fontSize={11} color="$textSecondary">
          {startLabel}
        </Text>
        <Text fontFamily="$body" fontSize={11} color="$textSecondary">
          {endLabel}
        </Text>
      </XStack>
    </YStack>
  )
}
