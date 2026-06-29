import { Stack } from 'expo-router'

export default function Layout() {
  return (
    <Stack screenOptions={{ animation: 'slide_from_right', headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="plant-list" />
      <Stack.Screen name="add-plant" />
      <Stack.Screen name="global-settings" />
      <Stack.Screen name="plant-settings" />
      <Stack.Screen name="status" options={{ gestureEnabled: false }} />
      <Stack.Screen name="devmode" />
    </Stack>
  )
}