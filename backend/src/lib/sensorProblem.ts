import { convex } from './convex.js'
import { N8N_SYSTEM_WEBHOOK_URL } from '../config.js'

const convexApiPromise = import('../../../convex/_generated/api.js')

export type SensorProblemReason = 'connection_failed' | 'max_retries_exceeded'

type NotificationRules = {
  ok: string[]
  warning: string[]
  critical: string[]
}

type PlantLookup = {
  name: string
  clerk_id?: string | null
}

type UserLookup = {
  telegram_chat_id?: string | null
  expo_push_token?: string | null
  notification_rules?: NotificationRules | null
}

const SENSOR_PROBLEM_TEXT = '⚠️ Dein Sensor konnte sich nicht verbinden. Bitte prüfe deine WLAN Verbindung.'

const defaultNotificationRules = (): NotificationRules => ({
  ok: [],
  warning: [],
  critical: [],
})

const triggerN8nSensorProblem = async (payload: {
  clerk_id: string
  device_id: string
  plant_name: string
  message: string
  notification_rules: NotificationRules
  telegram_chat_id: string | null
  expo_push_token: string | null
}): Promise<void> => {
  try {
    const response = await fetch(N8N_SYSTEM_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clerk_id: payload.clerk_id,
        device_id: payload.device_id,
        plant_name: payload.plant_name,
        state: 'offline',
        message: payload.message,
        notification_rules: payload.notification_rules,
        telegram_chat_id: payload.telegram_chat_id,
        expo_push_token: payload.expo_push_token,
        override_contact_window: true,
      }),
    })

    if (!response.ok) {
      const responseText = await response.text().catch(() => '')
      console.error('[sensor/problem] n8n webhook failed', response.status, responseText)
    }
  } catch (error) {
    console.error('[sensor/problem] n8n webhook unreachable', error)
  }
}

export const handleSensorProblem = async (input: {
  device_id: string
  reason: SensorProblemReason
}): Promise<{ statusCode: 200 | 404; body: Record<string, unknown> }> => {
  const { api } = await convexApiPromise

  const setStatusResult = (await convex.mutation((api as any).sensors.setSensorStatus, {
    device_id: input.device_id,
    status: 'needs_remeasurement',
  })) as { found: boolean }

  if (!setStatusResult.found) {
    return {
      statusCode: 404,
      body: { error: 'Sensor not found' },
    }
  }

  const plants = (await convex.query(api.plants.getPlantsBySensorId, {
    sensor_id: input.device_id,
  })) as PlantLookup[]

  if (plants.length === 0) {
    return {
      statusCode: 404,
      body: { error: 'Plant not found for sensor' },
    }
  }

  const plant = plants[0]

  if (!plant.clerk_id) {
    return {
      statusCode: 404,
      body: { error: 'User not found for plant' },
    }
  }

  const user = (await convex.query(api.users.getUserByClerkIdForProcessor, {
    clerk_id: plant.clerk_id,
  })) as UserLookup | null

  if (!user) {
    return {
      statusCode: 404,
      body: { error: 'User not found for plant' },
    }
  }

  await convex.mutation(api.messages.createMessage, {
    clerk_id: plant.clerk_id,
    device_id: input.device_id,
    plant_name: plant.name,
    type: 'system_message',
    state: 'warning',
    text: SENSOR_PROBLEM_TEXT,
  })

  await triggerN8nSensorProblem({
    clerk_id: plant.clerk_id,
    device_id: input.device_id,
    plant_name: plant.name,
    message: SENSOR_PROBLEM_TEXT,
    notification_rules: user.notification_rules ?? defaultNotificationRules(),
    telegram_chat_id: user.telegram_chat_id ?? null,
    expo_push_token: user.expo_push_token ?? null,
  })

  console.log('[sensor/problem] recorded', {
    device_id: input.device_id,
    reason: input.reason,
  })

  return {
    statusCode: 200,
    body: {
      status: 'ok',
      message: 'Sensor problem recorded',
    },
  }
}
