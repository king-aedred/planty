import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import readingsRouter from './routes/readings.ts'

const app = new Hono() //initialisiere ein App Objekt (in dem Fall Hono)

app.get('/', (c) => { // get() definiert eine HTTP GET-Route am angegebenen Pfad, '/' heißt also direkt unterm Root
    return c.text('Planty Backend Running') // (c) ist kontext und enthält daten der http request und liefert respone möglichkeiten wie text()
})

app.route('/api', readingsRouter) //alle Routen aus readingsRouter werden unter /api verfügbar

const port = 3000

console.log(`Server running on http://localhost:${port}`)

serve({
    fetch: app.fetch, //starte http server auf port 3000, wenn anfrage kommt gib sie app.fetch, das ist die hono app
    port, //fetch holt die Anfrage wie get oder post und verarbeitet sie
})