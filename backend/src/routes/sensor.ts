import { Hono } from 'hono'
import { SENSOR_WEBHOOK_SECRET } from '../config.js'
import { handleSensorAlert, handleSensorProblem } from '../lib/sensorProblem.js'

const sensorRouter = new Hono()

type SensorProblemReason = 'connection_failed' | 'max_retries_exceeded'

const isValidReason = (reason: unknown): reason is SensorProblemReason => {
  return reason === 'connection_failed' || reason === 'max_retries_exceeded'
}

sensorRouter.post('/problem', async (c) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || authHeader !== `Bearer ${SENSOR_WEBHOOK_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body: unknown = await c.req.json().catch(() => null)

  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const payload = body as Record<string, unknown>
  const deviceId = typeof payload.device_id === 'string' ? payload.device_id.trim() : ''
  const reason = payload.reason

  if (!deviceId || !isValidReason(reason)) {
    return c.json({ error: 'device_id and reason are required' }, 400)
  }

  const result = await handleSensorProblem({
    device_id: deviceId,
    reason,
  })

  return c.json(result.body, result.statusCode)
})

// Offline- und Akku-Hinweise aus Convex (convex/sensor_alerts.ts), gleiche Authentifizierung wie /problem.
sensorRouter.post('/alert', async (c) => {
  const authHeader = c.req.header('Authorization')

  if (!SENSOR_WEBHOOK_SECRET || !authHeader || authHeader !== `Bearer ${SENSOR_WEBHOOK_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body: unknown = await c.req.json().catch(() => null)
  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const payload = body as Record<string, unknown>
  const field = (key: string) => (typeof payload[key] === 'string' ? (payload[key] as string).trim() : '')
  const input = {
    clerk_id: field('clerk_id'),
    device_id: field('device_id'),
    plant_name: field('plant_name'),
    state: field('state'),
    message: field('message'),
  }

  if (!input.clerk_id || !input.device_id || !input.state || !input.message) {
    return c.json({ error: 'clerk_id, device_id, state and message are required' }, 400)
  }

  const result = await handleSensorAlert(input)
  return c.json(result.body, result.statusCode)
})

export default sensorRouter
