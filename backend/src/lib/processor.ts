import { convex } from './convex.js'
import { MIN_READINGS_REQUIRED } from '../config.js'
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
    await convex.mutation(api.readings.deleteReadingsBySensorAndDate, {
        sensor_id,
        date,
    })

    return { status: 'success', summary }
}