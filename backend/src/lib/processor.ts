import { convex } from './convex.js'
import { MIN_READINGS_REQUIRED, N8N_WEBHOOK_URL } from '../config.js'
import {
    calculateMedian,
    getLightState,
    getMoistureState,
    getTemperatureState,
} from './analysis.js'

const convexApiPromise = import('../../../convex/_generated/api.js')

export type ProcessSessionSummary = {
    sensor_id: string
    date: string
    moisture_median: number
    temperature_median: number
    light_level_median: number
    moisture_state: 'critical' | 'low' | 'ok'
    temperature_state: 'cold' | 'ok' | 'hot'
    light_state: 'dark' | 'ok' | 'bright'
    created_at: number
}

export type ProcessSessionResult =
    | { status: 'insufficient_data' }
    | { status: 'already_processed' }
    | { status: 'success'; summary: ProcessSessionSummary }

type Reading = {
    moisture: number
    temperature: number
    light_level: number
}

type PlantLookup = {
    name: string
    clerk_id: string | null
    device_id?: string | null
}

type UserLookup = {
    telegram_chat_id?: string | null
    expo_push_token?: string | null
    notification_rules?: {
        ok: string[]
        warning: string[]
        critical: string[]
    } | null
}

type MessageState = 'ok' | 'warning' | 'critical'

const getMessageState = (summary: ProcessSessionSummary): MessageState => {
    if (summary.moisture_state === 'critical') {
        return 'critical'
    }

    if (
        summary.moisture_state !== 'ok' ||
        summary.temperature_state !== 'ok' ||
        summary.light_state !== 'ok'
    ) {
        return 'warning'
    }

    return 'ok'
}

const getMessageText = (state: MessageState): string => {
    if (state === 'critical') {
        return 'HILFE! Ich brauche dringend Wasser! 😭'
    }

    if (state === 'warning') {
        return 'Ich werde langsam durstig... 🥺'
    }

    return "Mir geht's super! 🌱 Alles im grünen Bereich."
}

const getPlantForSensor = async (summary: ProcessSessionSummary): Promise<PlantLookup | null> => {
    const { api } = await convexApiPromise
    const matchingPlants = (await convex.query(api.plants.getPlantsBySensorId, {
        sensor_id: summary.sensor_id,
    })) as PlantLookup[]

    if (matchingPlants.length === 0) {
        console.warn('[processor] No plant found for sensor', summary.sensor_id)
        return null
    }

    if (matchingPlants.length > 1) {
        console.warn('[processor] Multiple plants found for sensor', summary.sensor_id, 'using first match')
    }

    return matchingPlants[0]
}

type N8nNotificationPayload = {
    clerk_id: string
    device_id: string
    plant_name: string
    state: MessageState
    message: string
    notification_rules: {
        ok: string[]
        warning: string[]
        critical: string[]
    }
    telegram_chat_id: string | null
    expo_push_token: string | null
}

const createInboxMessage = async (
    summary: ProcessSessionSummary,
): Promise<N8nNotificationPayload | null> => {
    const { api } = await convexApiPromise
    const plant = await getPlantForSensor(summary)

    if (!plant) {
        return null
    }

    if (!plant.clerk_id) {
        console.warn('[processor] Plant has no clerk_id, skipping inbox message', summary.sensor_id)
        return null
    }

    const messageState = getMessageState(summary)
    const messageText = getMessageText(messageState)

    await convex.mutation(api.messages.createMessage, {
        clerk_id: plant.clerk_id,
        device_id: summary.sensor_id,
        plant_name: plant.name,
        state: messageState,
        text: messageText,
    })

    return {
        clerk_id: plant.clerk_id,
        device_id: summary.sensor_id,
        plant_name: plant.name,
        state: messageState,
        message: messageText,
        notification_rules: {
            ok: [],
            warning: [],
            critical: [],
        },
        telegram_chat_id: null,
        expo_push_token: null,
    }
}

const notifyN8nIfNeeded = async (payload: N8nNotificationPayload): Promise<void> => {
    const { api } = await convexApiPromise

    const user = (await convex.query(api.users.getUserByClerkIdForProcessor, {
        clerk_id: payload.clerk_id,
    })) as UserLookup | null

    if (!user) {
        console.warn('[processor] User not found for notification payload', payload.clerk_id)
        return
    }

    try {
        const n8nPayload: N8nNotificationPayload = {
            ...payload,
            notification_rules: {
                ok: user.notification_rules?.ok ?? [],
                warning: user.notification_rules?.warning ?? [],
                critical: user.notification_rules?.critical ?? [],
            },
            telegram_chat_id: user.telegram_chat_id ?? null,
            expo_push_token: user.expo_push_token ?? null,
        }

        console.log('[processor] n8n request start', {
            url: N8N_WEBHOOK_URL,
            payload: n8nPayload,
        })

        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(n8nPayload),
        })

        const responseText = await response.text().catch(() => '')

        console.log('[processor] n8n request end', {
            url: N8N_WEBHOOK_URL,
            status: response.status,
            ok: response.ok,
            response: responseText,
        })

        if (!response.ok) {
            console.error('[processor] n8n webhook request failed', response.status, responseText)
        }
    } catch (error) {
        console.error('[processor] Failed to reach n8n webhook', error)
    }
}

export const processSessionIfReady = async (
    sensor_id: string,
    date: string,
): Promise<ProcessSessionResult> => {
    const { api } = await convexApiPromise

    const readings = (await convex.query(api.readings.getReadingsBySensorAndDate, {
        sensor_id,
        date,
    })) as Reading[]

    if (readings.length < MIN_READINGS_REQUIRED) {
        return { status: 'insufficient_data' }
    }

    const existingSummary = await convex.query(api.readings.getSummaryBySensorAndDate, {
        sensor_id,
        date,
    })

    if (existingSummary) {
        return { status: 'already_processed' }
    }

    const moistureValues = readings.map((reading) => reading.moisture)
    const temperatureValues = readings.map((reading) => reading.temperature)
    const lightValues = readings.map((reading) => reading.light_level)

    const moistureMedian = calculateMedian(moistureValues)
    const temperatureMedian = calculateMedian(temperatureValues)
    const lightMedian = calculateMedian(lightValues)

    const summary: ProcessSessionSummary = {
        sensor_id,
        date,
        moisture_median: moistureMedian,
        temperature_median: temperatureMedian,
        light_level_median: lightMedian,
        moisture_state: getMoistureState(moistureMedian),
        temperature_state: getTemperatureState(temperatureMedian),
        light_state: getLightState(lightMedian),
        created_at: Date.now(),
    }

    const { created_at, ...summaryPayload } = summary

    await convex.mutation(api.readings.createDailySummary, summaryPayload)
    const notificationPayload = await createInboxMessage(summary)

    if (notificationPayload) {
        await notifyN8nIfNeeded(notificationPayload)
    }

    await convex.mutation(api.readings.deleteReadingsBySensorAndDate, {
        sensor_id,
        date,
    })

    return { status: 'success', summary }
}