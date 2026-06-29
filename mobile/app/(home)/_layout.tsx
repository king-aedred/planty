import { Stack } from 'expo-router'

export default function Layout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="plant-list" />
      <Stack.Screen name="add-plant" />
      <Stack.Screen name="status" options={{ gestureEnabled: false }} />
      <Stack.Screen name="devmode" />
    </Stack>
  )
}