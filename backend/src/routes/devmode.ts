import { Hono } from 'hono'
import { convex } from '../lib/convex.js'
import { processSessionIfReady } from '../lib/processor.js'
import { CRON_INTERVAL_MINUTES, MIN_READINGS_REQUIRED } from '../config.js'

const convexApiPromise = import('../../../convex/_generated/api.js')

const devModeRouter = new Hono()

type Scenario =
  | 'normal'
  | 'minimal'
  | 'insufficient'
  | 'all_critical'
  | 'all_ok'
  | 'all_warning'
  | 'duplicate'
  | 'offline'

type SensorReading = {
  sensor_id: string
  moisture: number
  temperature: number
  light_level: number
  timestamp: string
}

const getTodayDate = (): string => new Date().toISOString().slice(0, 10)

const randomInRange = (minimum: number, maximum: number): number =>
  minimum + Math.random() * (maximum - minimum)

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

const formatTimestamp = (date: string, index: number): string => {
  const hour = String(index % 24).padStart(2, '0')

  return `${date}T${hour}`
}

const buildReading = (
  sensorId: string,
  date: string,
  index: number,
  moistureRange: [number, number],
  temperatureRange: [number, number],
  lightRange: [number, number],
): SensorReading => {
  const moistureBase = (moistureRange[0] + moistureRange[1]) / 2
  const temperatureBase = (temperatureRange[0] + temperatureRange[1]) / 2
  const lightBase = (lightRange[0] + lightRange[1]) / 2

  return {
    sensor_id: sensorId,
    moisture: Number(clamp(randomInRange(moistureBase - 4, moistureBase + 4), moistureRange[0], moistureRange[1]).toFixed(1)),
    temperature: Number(clamp(randomInRange(temperatureBase - 2, temperatureBase + 2), temperatureRange[0], temperatureRange[1]).toFixed(1)),
    light_level: Math.round(clamp(randomInRange(lightBase - 80, lightBase + 80), lightRange[0], lightRange[1])),
    timestamp: formatTimestamp(date, index),
  }
}

const buildScenarioReadings = (sensorId: string, scenario: Scenario, date: string): SensorReading[] => {
  const counts: Record<Scenario, number> = {
    normal: 18,
    minimal: 12,
    insufficient: 8,
    all_critical: 18,
    all_ok: 18,
    all_warning: 18,
    duplicate: 18,
    offline: 0,
  }

  const ranges: Record<Exclude<Scenario, 'duplicate' | 'offline'>, {
    moisture: [number, number]
    temperature: [number, number]
    light: [number, number]
  }> = {
    normal: { moisture: [40, 60], temperature: [18, 24], light: [400, 600] },
    minimal: { moisture: [40, 60], temperature: [18, 24], light: [400, 600] },
    insufficient: { moisture: [40, 60], temperature: [18, 24], light: [400, 600] },
    all_critical: { moisture: [10, 15], temperature: [5, 8], light: [30, 50] },
    all_ok: { moisture: [55, 65], temperature: [20, 23], light: [450, 550] },
    all_warning: { moisture: [25, 35], temperature: [14, 16], light: [180, 210] },
  }

  if (scenario === 'offline') {
    return []
  }

  const readingCount = counts[scenario]
  const scenarioRanges = scenario === 'duplicate' ? ranges.normal : ranges[scenario]

  return Array.from({ length: readingCount }, (_, index) =>
    buildReading(
      sensorId,
      date,
      index,
      scenarioRanges.moisture,
      scenarioRanges.temperature,
      scenarioRanges.light,
    ),
  )
}

const requireDevUser = async (clerkId: string | null): Promise<boolean> => {
  if (!clerkId) {
    return false
  }

  const { api } = await convexApiPromise

  return await convex.query(api.users.isDevUser, { clerk_id: clerkId })
}

const parseAuthorizationHeader = (request: Request): string | null => {
  const clerkId = request.headers.get('x-clerk-id')?.trim() ?? ''

  return clerkId.length > 0 ? clerkId : null
}

devModeRouter.get('/info', async (c) => {
  const clerkId = parseAuthorizationHeader(c.req.raw)
  const isDevUser = await requireDevUser(clerkId)

  console.log('[dev/info]', { clerkId, isDevUser })

  if (!isDevUser) {
    return c.json({ error: 'forbidden' }, 403)
  }

  return c.json({
    cron_interval_minutes: CRON_INTERVAL_MINUTES,
    min_readings_required: MIN_READINGS_REQUIRED,
  })
})

devModeRouter.post('/simulate', async (c) => {
  const clerkId = c.req.header('x-clerk-id')?.trim() ?? null
  const isDevUser = await requireDevUser(clerkId)

  console.log('[dev/simulate]', { clerkId, isDevUser })

  if (!isDevUser) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const body: unknown = await c.req.json()

  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const payload = body as Record<string, unknown>
  const deviceId = typeof payload.device_id === 'string' ? payload.device_id.trim() : ''
  const scenario = payload.scenario as Scenario | undefined

  if (!deviceId || !scenario) {
    return c.json({ error: 'device_id and scenario are required' }, 400)
  }

  const allowedScenarios: Scenario[] = [
    'normal',
    'minimal',
    'insufficient',
    'all_critical',
    'all_ok',
    'all_warning',
    'duplicate',
    'offline',
  ]

  if (!allowedScenarios.includes(scenario)) {
    return c.json({ error: 'Unknown scenario' }, 400)
  }

  const { api } = await convexApiPromise
  const date = getTodayDate()

  const resetResult = await convex.mutation(api.readings.deleteDailySummaryBySensorAndDate, {
    sensor_id: deviceId,
    date,
  }) as { ok: true; deleted: boolean }

  const readings = buildScenarioReadings(deviceId, scenario, date)
  const insertedIds: string[] = []

  for (const reading of readings) {
    const result = (await convex.mutation(api.http.createReading, reading)) as { ok: true; id: string }
    insertedIds.push(result.id)
  }

  if (scenario === 'offline') {
    return c.json({ status: 'no_data', inserted: 0 })
  }

  const processResult = await processSessionIfReady(deviceId, date)

  if (scenario === 'duplicate') {
    const duplicateResult = await processSessionIfReady(deviceId, date)

    return c.json({
      status: 'duplicate_attempted',
      inserted: insertedIds.length,
      first_result: processResult,
      second_result: duplicateResult,
    })
  }

  return c.json({
    status: 'ok',
    inserted: insertedIds.length,
    reset_summary: resetResult.deleted,
    result: processResult,
  })
})

devModeRouter.post('/trigger-cron', async (c) => {
  const clerkId = parseAuthorizationHeader(c.req.raw)
  const isDevUser = await requireDevUser(clerkId)

  console.log('[dev/trigger-cron]', { clerkId, isDevUser })

  if (!isDevUser) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const { api } = await convexApiPromise
  const date = getTodayDate()
  const sensorIds = await convex.query(api.readings.getSensorIdsWithReadingsToday, {
    date,
  })

  let resetSummaries = 0

  for (const sensorId of sensorIds) {
    const resetResult = (await convex.mutation(api.readings.deleteDailySummaryBySensorAndDate, {
      sensor_id: sensorId,
      date,
    })) as { ok: true; deleted: boolean }

    if (resetResult.deleted) {
      resetSummaries += 1
    }
  }

  const { runCronJobOnce } = await import('../jobs/cronJob.js')
  const result = await runCronJobOnce()

  return c.json({
    status: 'ok',
    reset_summaries: resetSummaries,
    result,
  })
})

export default devModeRouter