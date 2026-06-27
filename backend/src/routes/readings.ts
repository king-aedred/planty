import { Hono } from 'hono'

const readingsRouter = new Hono() //erstelle eigenen router

readingsRouter.post('/readings', async (c) => { // wenn jemand einen POST auf readings ausführt, dann führe json antwort aus context aus
    return c.json({ message: 'Readings endpoint '})
}) // async sorgt für potentielle nutzung von await

export default readingsRouter //andere Dateien können readingsRouter importieren

