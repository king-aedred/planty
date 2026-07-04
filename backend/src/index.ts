import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { anyApi } from 'convex/server'
import { createReadStream, existsSync } from 'fs'
import path from 'path'
import twilio from 'twilio'
import { fileURLToPath } from 'url'
import { convex } from './lib/convex.js'
import {
    CONVEX_BACKEND_SECRET,
    DEMO_PHONE_NUMBER,
    DEMO_SECRET,
    INTERNAL_WEBHOOK_SECRET,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER,
} from './config.js'
import devModeRouter from './routes/devmode.js'
import notificationsRouter from './routes/notifications.js'
import sensorRouter from './routes/sensor.js'
import telegramRouter from './routes/telegram.js'
import { processSessionIfReady } from './lib/processor.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = new Hono() //initialisiere ein App Objekt (in dem Fall Hono)

app.get('/audio/:filename', async (c) => {
    const filename = c.req.param('filename')
    const filePath = path.join(__dirname, '../public', filename)

    console.log('[audio] serving file:', filePath)

    if (!existsSync(filePath)) {
        console.log('[audio] file not found:', filePath)
        return c.text('Not found', 404)
    }

    const stream = createReadStream(filePath)
    c.header('Content-Type', 'audio/mpeg')
    return c.body(stream as any)
})

app.get('/', (c) => { // get() definiert eine HTTP GET-Route am angegebenen Pfad, '/' heißt also direkt unterm Root
    return c.text('Planty Backend Running') // (c) ist kontext und enthält daten der http request und liefert respone möglichkeiten wie text()
})

app.get('/demo/call-veronica', async (c) => {
    const secret = c.req.query('secret') ?? ''

    if (secret !== DEMO_SECRET) {
        return c.json({ error: 'forbidden' }, 403)
    }

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !DEMO_PHONE_NUMBER) {
        return c.json({ error: 'twilio_not_configured' }, 500)
    }

    try {
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="de-DE">Hallo hier ist Veronica, deine Chinesische Feige!</Say></Response>`

        const call = await client.calls.create({
            from: TWILIO_FROM_NUMBER,
            to: DEMO_PHONE_NUMBER,
            twiml: twiml,
        })

        return c.json({ ok: true, callSid: call.sid })
    } catch (error) {
        console.error('[demo/call-veronica] failed to place call', error)
        return c.json({ error: 'internal server error' }, 500)
    }
})

app.get('/demo/veronica-twiml', (c) => {
    const voiceResponse = new twilio.twiml.VoiceResponse()
    voiceResponse.play('https://api.getplanty.de/audio/veronica.mp3')
    c.header('Content-Type', 'text/xml')
    return c.text(voiceResponse.toString())
})

app.get('/api/status/:sensor_id/:date', async (c) => {
    const sensorId = c.req.param('sensor_id')
    c.req.param('date')

    const summary = await convex.query(anyApi.readings.getLatestSessionSummary, {
        sensor_id: sensorId,
        backend_secret: CONVEX_BACKEND_SECRET,
    })

    if (!summary) {
        return c.json({ error: 'session_summary not found' }, 404)
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

    console.log('[process-session] session_id:', sessionId)
    console.log('[process-session] session status:', existingSession?.status)

    if (!existingSession) {
        return c.json({ error: 'session not found' }, 404)
    }

    if (existingSession?.status === 'processed') {
        return c.json({ status: 'already_processed' })
    }

    try {
        const result = await processSessionIfReady(sessionId, true)

        if (result.status === 'already_processed') {
            return c.json({ status: 'already_processed' })
        }

        return c.json({ status: 'ok' })
    } catch (error) {
        console.error('[process-session] error:', error)
        return c.json({ error: 'internal server error' }, 500)
    }
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