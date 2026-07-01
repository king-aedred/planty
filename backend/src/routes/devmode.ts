import { Hono } from 'hono'
import { convex } from '../lib/convex.js'
import { createConvexClient } from '../lib/convex.js'
import { processSessionIfReady, sendSummaryNotifications } from '../lib/processor.js'
import { handleSensorProblem } from '../lib/sensorProblem.js'
import { CRON_INTERVAL_MINUTES, MIN_READINGS_REQUIRED } from '../config.js'
import { clerkAuthMiddleware } from '../lib/auth.js'
import { getLightState, getMoistureState, getTemperatureState } from '../lib/analysis.js'

const convexApiPromise = import('../../../convex/_generated/api.js')

const devModeRouter = new Hono()
devModeRouter.use('*', clerkAuthMiddleware)

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

const isValidDateString = (date: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(date)

const buildTimestampFromDateAndHour = (date: string, hour: number): number => {
  const [year, month, day] = date.split('-').map((value) => Number(value))

  return Date.UTC(year, month - 1, day, hour, 0, 0, 0)
}

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

const requireDevUser = async (clerkId: string | undefined, authToken: string): Promise<boolean> => {
  if (!clerkId) {
    return false
  }

  const { api } = await convexApiPromise
  const authenticatedConvex = createConvexClient(authToken)

  return await authenticatedConvex.query(api.users.isDevUser, { clerk_id: clerkId })
}

devModeRouter.get('/info', async (c) => {
  const clerkId = c.get('clerkId')
  const clerkToken = c.get('clerkToken')
  const isDevUser = await requireDevUser(clerkId, clerkToken)

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
  const clerkId = c.get('clerkId')
  const clerkToken = c.get('clerkToken')
  const isDevUser = await requireDevUser(clerkId, clerkToken)

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
  const overrideContactWindow = payload.override_contact_window === true

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

    await convex.mutation(api.sensors.updateLastSeen, {
      device_id: deviceId,
    })
  }

  if (scenario === 'offline') {
    return c.json({ status: 'no_data', inserted: 0 })
  }

  const processResult = await processSessionIfReady(deviceId, date, {
    override_contact_window: overrideContactWindow,
  })

  if (scenario === 'duplicate') {
    const duplicateResult = await processSessionIfReady(deviceId, date, {
      override_contact_window: overrideContactWindow,
    })

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

devModeRouter.post('/time-travel', async (c) => {
  const clerkId = c.get('clerkId')
  const clerkToken = c.get('clerkToken')
  const isDevUser = await requireDevUser(clerkId, clerkToken)

  console.log('[dev/time-travel]', { clerkId, isDevUser })

  if (!isDevUser) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const body: unknown = await c.req.json().catch(() => null)

  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const payload = body as Record<string, unknown>
  const deviceId = typeof payload.device_id === 'string' ? payload.device_id.trim() : ''
  const date = typeof payload.date === 'string' ? payload.date.trim() : ''
  const hour = typeof payload.hour === 'number' ? payload.hour : Number.NaN
  const moistureMedian = typeof payload.moisture_median === 'number' ? payload.moisture_median : Number.NaN
  const temperatureMedian = typeof payload.temperature_median === 'number' ? payload.temperature_median : Number.NaN
  const lightLevelMedian = typeof payload.light_level_median === 'number' ? payload.light_level_median : Number.NaN
  const overrideContactWindow = payload.override_contact_window === true

  if (
    !deviceId ||
    !isValidDateString(date) ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isFinite(moistureMedian) ||
    !Number.isFinite(temperatureMedian) ||
    !Number.isFinite(lightLevelMedian)
  ) {
    return c.json(
      {
        error:
          'device_id, date (YYYY-MM-DD), hour (0-23), moisture_median, temperature_median and light_level_median are required',
      },
      400,
    )
  }

  const { api } = await convexApiPromise
  const existingSummary = await convex.query(api.readings.getSummaryBySensorAndDate, {
    sensor_id: deviceId,
    date,
  })

  const summaryStates = {
    moisture_state: getMoistureState(moistureMedian),
    temperature_state: getTemperatureState(temperatureMedian),
    light_state: getLightState(lightLevelMedian),
  }

  const createdAt = buildTimestampFromDateAndHour(date, hour)

  await convex.mutation(api.readings.createDailySummaryDirect, {
    device_id: deviceId,
    date,
    moisture_median: moistureMedian,
    temperature_median: temperatureMedian,
    light_level_median: lightLevelMedian,
    ...summaryStates,
    created_at: createdAt,
  })

  await sendSummaryNotifications({
    sensor_id: deviceId,
    date,
    moisture_median: moistureMedian,
    temperature_median: temperatureMedian,
    light_level_median: lightLevelMedian,
    ...summaryStates,
    created_at: createdAt,
  }, 'plant_message', {
    override_contact_window: overrideContactWindow,
  })

  return c.json({
    status: existingSummary ? 'overwritten' : 'created',
    date,
    states: summaryStates,
    message: existingSummary
      ? 'Zeitreise-Eintrag überschrieben und Benachrichtigung ausgelöst'
      : 'Zeitreise-Eintrag erstellt und Benachrichtigung ausgelöst',
  })
})

devModeRouter.post('/trigger-cron', async (c) => {
  const clerkId = c.get('clerkId')
  const clerkToken = c.get('clerkToken')
  const isDevUser = await requireDevUser(clerkId, clerkToken)

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

devModeRouter.post('/trigger-sensor-problem', async (c) => {
  const clerkId = c.get('clerkId')
  const clerkToken = c.get('clerkToken')
  const isDevUser = await requireDevUser(clerkId, clerkToken)

  console.log('[dev/trigger-sensor-problem]', { clerkId, isDevUser })

  if (!isDevUser) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const body: unknown = await c.req.json().catch(() => null)

  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const payload = body as Record<string, unknown>
  const deviceId = typeof payload.device_id === 'string' ? payload.device_id.trim() : ''

  if (!deviceId) {
    return c.json({ error: 'device_id is required' }, 400)
  }

  const result = await handleSensorProblem({
    device_id: deviceId,
    reason: 'max_retries_exceeded',
  })

  return c.json(result.body, result.statusCode)
})

export default devModeRouter