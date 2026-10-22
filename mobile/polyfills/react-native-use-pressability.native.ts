// Tamagui 3 holt auf dem Gerät `usePressability` aus dem Hauptexport von `react-native`
// (@tamagui/web, helpers/mainThreadPressEvents.native). React Native 0.81 (Expo SDK 54) exportiert die
// Funktion dort noch nicht, nur intern unter Libraries/Pressability. Ohne diesen Shim stürzt die App beim
// ersten Rendern mit "usePressability is not a function" ab.
// Muss vor dem ersten Rendern geladen werden (erster Import in app/_layout.tsx).
// Entfernen, sobald React Native `usePressability` selbst exportiert (neueres Expo SDK).
/* eslint-disable @typescript-eslint/no-require-imports */
const reactNative = require('react-native') as Record<string, unknown>

if (typeof reactNative.usePressability !== 'function') {
  const internal = require('react-native/Libraries/Pressability/usePressability') as { default?: unknown }
  reactNative.usePressability = internal.default ?? internal
}

export {}
