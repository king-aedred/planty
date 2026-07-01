import { convex } from './convex.js'
import { MIN_READINGS_REQUIRED, N8N_WEBHOOK_URL } from '../config.js'
import {
    calculateMedian,
    getEscalationMessage,
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
    _id: string
    name: string
    clerk_id: string | null
    device_id?: string | null
}

type UserLookup = {
    telegram_chat_id?: string | null
    expo_push_token?: string | null
    contact_window_start?: number | null
    contact_window_end?: number | null
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

const getStandardMessageText = (state: MessageState): string => {
    if (state === 'warning') {
        return 'Ich werde langsam durstig... 🥺'
    }

    return "Mir geht's super! 🌱 Alles im grünen Bereich."
}

const updateCriticalState = async (summary: ProcessSessionSummary, plant: PlantLookup): Promise<number | null> => {
    const { api } = await convexApiPromise
    const deviceId = plant.device_id ?? summary.sensor_id

    if (summary.moisture_state === 'critical') {
        return (await convex.mutation(api.plants.incrementCriticalDays, {
            device_id: deviceId,
            date: summary.date,
        })) as number
    }

    await convex.mutation(api.plants.resetCriticalDays, {
        device_id: deviceId,
    })

    return null
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

type NotificationOptions = {
    override_contact_window?: boolean
}

const createInboxMessage = async (summary: ProcessSessionSummary): Promise<N8nNotificationPayload | null> => {
    const { api } = await convexApiPromise
    const plant = await getPlantForSensor(summary)

    if (!plant) {
        return null
    }

    const criticalDays = await updateCriticalState(summary, plant)

    if (!plant.clerk_id) {
        console.warn('[processor] Plant has no clerk_id, skipping inbox message', summary.sensor_id)
        return null
    }

    const messageState = getMessageState(summary)

    if (messageState === 'critical' && criticalDays === null) {
        throw new Error('[processor] Missing critical day count for escalation message')
    }

    const messageText =
        messageState === 'critical'
            ? getEscalationMessage(criticalDays)
            : getStandardMessageText(messageState)

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

const isOutsideContactWindow = (
    currentHour: number,
    contactWindowStart: number,
    contactWindowEnd: number,
): boolean => {
    if (contactWindowStart < contactWindowEnd) {
        return currentHour < contactWindowStart || currentHour >= contactWindowEnd
    }

    return currentHour < contactWindowStart && currentHour >= contactWindowEnd
}

export const sendSummaryNotifications = async (
    summary: ProcessSessionSummary,
    options: NotificationOptions = {},
): Promise<void> => {
    const notificationPayload = await createInboxMessage(summary)

    if (notificationPayload) {
        await notifyN8nIfNeeded(notificationPayload, options)
    }
}

const notifyN8nIfNeeded = async (payload: N8nNotificationPayload, options: NotificationOptions = {}): Promise<void> => {
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

        const contactWindowStart = user.contact_window_start
        const contactWindowEnd = user.contact_window_end

        if (!options.override_contact_window && contactWindowStart !== undefined && contactWindowEnd !== undefined) {
            const currentHour = new Date().getUTCHours()

            if (isOutsideContactWindow(currentHour, contactWindowStart, contactWindowEnd)) {
                console.log('[processor] Außerhalb Kontaktzeitfenster, externe Benachrichtigung übersprungen', {
                    currentHour,
                    contact_window_start: contactWindowStart,
                    contact_window_end: contactWindowEnd,
                })

                return
            }
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
    options: NotificationOptions = {},
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
    await sendSummaryNotifications(summary, options)

    await convex.mutation(api.readings.deleteReadingsBySensorAndDate, {
        sensor_id,
        date,
    })

    return { status: 'success', summary }
}