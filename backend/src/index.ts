import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import readingsRouter from './routes/readings.js'
import { convex } from './lib/convex.js'
import { startCronJob } from './jobs/cronJob.js'

const convexApiPromise = import('../../convex/_generated/api.js')

const app = new Hono() //initialisiere ein App Objekt (in dem Fall Hono)

startCronJob()

app.get('/', (c) => { // get() definiert eine HTTP GET-Route am angegebenen Pfad, '/' heißt also direkt unterm Root
    return c.text('Planty Backend Running') // (c) ist kontext und enthält daten der http request und liefert respone möglichkeiten wie text()
})

app.get('/api/status/:sensor_id/:date', async (c) => {
    const { api } = await convexApiPromise

    const sensorId = c.req.param('sensor_id')
    const date = c.req.param('date')

    const summary = await convex.query(api.readings.getSummaryBySensorAndDate, {
        sensor_id: sensorId,
        date,
    })

    if (!summary) {
        return c.json({ error: 'daily_summary not found' }, 404)
    }

    return c.json(summary)
})

app.route('/api', readingsRouter) //alle Routen aus readingsRouter werden unter /api verfügbar

const port = 3001

console.log(`Server running on http://localhost:${port}`)

serve({
    fetch: app.fetch, //starte http server auf port 3000, wenn anfrage kommt gib sie app.fetch, das ist die hono app
    port, //fetch holt die Anfrage wie get oder post und verarbeitet sie
})