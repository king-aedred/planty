import cron from 'node-cron'
import { CRON_INTERVAL_MINUTES } from '../config.js'
import { convex } from '../lib/convex.js'
import { processSessionIfReady } from '../lib/processor.js'

const convexApiPromise = import('../../../convex/_generated/api.js')

const getTodayDate = (): string => {
    return new Date().toISOString().slice(0, 10)
}

const getSensorIdsNeedingProcessing = async (date: string): Promise<string[]> => {
    const { api } = await convexApiPromise

    const readings = await convex.query(api.http.getReadings, {})
    const sensorIds = new Set<string>()

    for (const reading of readings) {
        if (typeof reading.timestamp === 'string' && reading.timestamp.startsWith(date)) {
            sensorIds.add(reading.sensor_id)
        }
    }

    const sensorIdsWithoutSummary: string[] = []

    for (const sensorId of sensorIds) {
        const summary = await convex.query(api.readings.getSummaryBySensorAndDate, {
            sensor_id: sensorId,
            date,
        })

        if (!summary) {
            sensorIdsWithoutSummary.push(sensorId)
        }
    }

    return sensorIdsWithoutSummary
}

export const runCronJobOnce = async (): Promise<void> => {
    const date = getTodayDate()
    const sensorIds = await getSensorIdsNeedingProcessing(date)

    for (const sensorId of sensorIds) {
        const result = await processSessionIfReady(sensorId, date)
        console.log(`[cronJob] sensor_id=${sensorId} date=${date}`, result)
    }
}

export const startCronJob = (): cron.ScheduledTask => {
    const expression = `*/${CRON_INTERVAL_MINUTES} * * * *`

    return cron.schedule(expression, async () => {
        try {
            await runCronJobOnce()
        } catch (error) {
            console.error('[cronJob] failed', error)
        }
    })
}