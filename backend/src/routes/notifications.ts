import { Hono } from 'hono'
import { convex } from '../lib/convex.js'
import { INTERNAL_WEBHOOK_SECRET } from '../config.js'

const convexApiPromise = import('../../../convex/_generated/api.js')

const notificationsRouter = new Hono()

const isAuthorized = (authorizationHeader: string | undefined): boolean => {
  if (!authorizationHeader || !INTERNAL_WEBHOOK_SECRET) {
    return false
  }

  return authorizationHeader === `Bearer ${INTERNAL_WEBHOOK_SECRET}`
}

notificationsRouter.post('/update-inbox', async (c) => {
  if (!isAuthorized(c.req.header('Authorization'))) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const body: unknown = await c.req.json().catch(() => null)

  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const payload = body as Record<string, unknown>
  const messageId = typeof payload.message_id === 'string' ? payload.message_id.trim() : ''
  const text = typeof payload.text === 'string' ? payload.text.trim() : ''

  if (!messageId || !text) {
    return c.json({ error: 'message_id and text are required' }, 400)
  }

  const { api } = await convexApiPromise

  await convex.mutation(api.messages.updateMessageText, {
    message_id: messageId,
    text,
  })

  return c.json({ status: 'ok' })
})

export default notificationsRouter