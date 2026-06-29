import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'
import { CRON_INTERVAL_MINUTES } from '../config.js'
import { convex } from '../lib/convex.js'
import { processSessionIfReady } from '../lib/processor.js'

const convexApiPromise = import('../../../convex/_generated/api.js')

const getTodayDate = (): string => {
    return new Date().toISOString().slice(0, 10)
}

const getSensorIdsNeedingProcessing = async (date: string): Promise<string[]> => {
    const { api } = await convexApiPromise

    return await convex.query(api.readings.getSensorsWithReadingsToday, {
        date,
    })
}

export const runCronJobOnce = async (): Promise<Array<{ sensor_id: string; result: unknown }>> => {
    const date = getTodayDate()
    const sensorIds = await getSensorIdsNeedingProcessing(date)

    const results: Array<{ sensor_id: string; result: unknown }> = []

    for (const sensorId of sensorIds) {
        const result = await processSessionIfReady(sensorId, date)
        console.log(`[cronJob] sensor_id=${sensorId} date=${date}`, result)

        results.push({ sensor_id: sensorId, result })
    }

    return results
}

export const startCronJob = (): ScheduledTask => {
    const expression = `*/${CRON_INTERVAL_MINUTES} * * * *`

    return cron.schedule(expression, async () => {
        try {
            await runCronJobOnce()
        } catch (error) {
            console.error('[cronJob] failed', error)
        }
    })
}