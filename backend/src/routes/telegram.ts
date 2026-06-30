import { Hono } from 'hono'
import { convex } from '../lib/convex.js'
import { TELEGRAM_BOT_TOKEN } from '../config.js'

const convexApiPromise = import('../../../convex/_generated/api.js')

const telegramRouter = new Hono()

const sendTelegramMessage = async (chatId: string, text: string) => {
    if (!TELEGRAM_BOT_TOKEN) {
        console.error('[telegram/webhook] TELEGRAM_BOT_TOKEN is missing')
        return
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text,
            }),
        })

        if (!response.ok) {
            const responseText = await response.text().catch(() => '')
            console.error('[telegram/webhook] Telegram API request failed', response.status, responseText)
        }
    } catch (error) {
        console.error('[telegram/webhook] Failed to send Telegram message', error)
    }
}

telegramRouter.post('/webhook', async (c) => {
    const body = await c.req.json().catch(() => null)

    if (!body || typeof body !== 'object') {
        return c.json({ ok: true })
    }

    const update = body as {
        message?: {
            chat?: {
                id?: number | string
            }
            text?: string
        }
    }

    const messageText = update.message?.text?.trim()
    const chatId = update.message?.chat?.id

    if (!messageText || chatId === undefined || chatId === null) {
        return c.json({ ok: true })
    }

    const startMatch = messageText.match(/^\/start(?:@\w+)?\s+(\S+)/)

    if (!startMatch) {
        return c.json({ ok: true })
    }

    const code = startMatch[1].trim()
    const chatIdString = String(chatId)

    try {
        const { api } = await convexApiPromise

        await convex.mutation(api.users.connectTelegramByCode, {
            code,
            chat_id: chatIdString,
        })

        await sendTelegramMessage(chatIdString, 'Du bist jetzt mit Planty verbunden! 🌱')
    } catch (error) {
        if (error instanceof Error && error.message === 'Invalid code') {
            await sendTelegramMessage(chatIdString, 'Dieser Code ist ungültig. Bitte versuche es erneut.')
        } else {
            console.error('[telegram/webhook]', error)
        }
    }

    return c.json({ ok: true })
})

export default telegramRouter