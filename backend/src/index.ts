import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { anyApi } from 'convex/server'
import { convex } from './lib/convex.js'
import { CONVEX_BACKEND_SECRET, INTERNAL_WEBHOOK_SECRET } from './config.js'
import devModeRouter from './routes/devmode.js'
import notificationsRouter from './routes/notifications.js'
import sensorRouter from './routes/sensor.js'
import telegramRouter from './routes/telegram.js'
import { processSessionIfReady } from './lib/processor.js'

const app = new Hono() //initialisiere ein App Objekt (in dem Fall Hono)

app.get('/', (c) => { // get() definiert eine HTTP GET-Route am angegebenen Pfad, '/' heißt also direkt unterm Root
    return c.text('Planty Backend Running') // (c) ist kontext und enthält daten der http request und liefert respone möglichkeiten wie text()
})

app.get('/api/status/:sensor_id/:date', async (c) => {
    const sensorId = c.req.param('sensor_id')
    const date = c.req.param('date')

    const summary = await convex.query(anyApi.readings.getSummaryBySensorAndDate, {
        sensor_id: sensorId,
        date,
        backend_secret: CONVEX_BACKEND_SECRET,
    })

    if (!summary) {
        return c.json({ error: 'daily_summary not found' }, 404)
    }

    return c.json(summary)
})

app.post('/process-session', async (c) => {
    const authorizationHeader = c.req.header('Authorization')

    if (!authorizationHeader || authorizationHeader !== `Bearer ${INTERNAL_WEBHOOK_SECRET}`) {
        return c.json({ error: 'forbidden' }, 401)
    }

    const body: unknown = await c.req.json().catch(() => null)

    if (typeof body !== 'object' || body === null) {
        return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const payload = body as Record<string, unknown>
    const sessionId = typeof payload.session_id === 'string' ? payload.session_id.trim() : ''
    const sensorId = typeof payload.sensor_id === 'string' ? payload.sensor_id.trim() : ''
    const reason = payload.reason

    if (!sessionId || !sensorId || (reason !== 'complete' && reason !== 'partial_12')) {
        return c.json({ error: 'session_id, sensor_id and reason are required' }, 400)
    }

    const existingSession = await convex.query(anyApi.readings.getSessionById, {
        session_id: sessionId,
        backend_secret: CONVEX_BACKEND_SECRET,
    })

    if (!existingSession) {
        return c.json({ error: 'session not found' }, 404)
    }

    if (existingSession?.status === 'processed') {
        return c.json({ status: 'already_processed' })
    }

    const result = await processSessionIfReady(sessionId, true)

    if (result.status === 'already_processed') {
        return c.json({ status: 'already_processed' })
    }

    return c.json({ status: 'ok' })
})

app.route('/dev', devModeRouter)
app.route('/notifications', notificationsRouter)
app.route('/sensor', sensorRouter)
app.route('/telegram', telegramRouter)

const port = 3000

console.log(`Server running on http://localhost:${port}`)

serve({
    fetch: app.fetch, //starte http server auf port 3000, wenn anfrage kommt gib sie app.fetch, das ist die hono app
    port, //fetch holt die Anfrage wie get oder post und verarbeitet sie
    hostname: '0.0.0.0',
})