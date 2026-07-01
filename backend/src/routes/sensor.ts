import { Hono } from 'hono'
import { handleSensorProblem } from '../lib/sensorProblem.js'

const sensorRouter = new Hono()

type SensorProblemReason = 'connection_failed' | 'max_retries_exceeded'

const isValidReason = (reason: unknown): reason is SensorProblemReason => {
  return reason === 'connection_failed' || reason === 'max_retries_exceeded'
}

sensorRouter.post('/problem', async (c) => {
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

export default sensorRouter
