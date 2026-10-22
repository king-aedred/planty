import { Stack } from 'expo-router'

export default function Layout() {
  return (
    <Stack screenOptions={{ animation: 'slide_from_right', headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add-plant" />
      <Stack.Screen name="add-sensor" />
      <Stack.Screen name="plant-settings" />
      <Stack.Screen name="status" options={{ gestureEnabled: false }} />
      <Stack.Screen name="devmode" />
    </Stack>
  )
}