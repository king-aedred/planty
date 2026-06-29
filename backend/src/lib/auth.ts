import { verifyToken } from '@clerk/backend'
import { createMiddleware } from 'hono/factory'
import { CLERK_SECRET_KEY } from '../config.js'

declare module 'hono' {
    interface ContextVariableMap {
        clerkId: string
        clerkToken: string
    }
}

const getBearerToken = (request: { headers: { get(name: string): string | null } }): string | null => {
    const authorizationHeader = request.headers.get('authorization')?.trim()

    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
        return null
    }

    const token = authorizationHeader.slice('Bearer '.length).trim()

    return token.length > 0 ? token : null
}

export const clerkAuthMiddleware = createMiddleware(async (c, next) => {
    const token = getBearerToken(c.req.raw)

    if (!token) {
        return c.json({ error: 'Unauthorized' }, 401)
    }

    try {
        const verifiedToken = await verifyToken(token, {
            secretKey: CLERK_SECRET_KEY,
        })

        if (!verifiedToken.sub) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        c.set('clerkId', verifiedToken.sub)
        c.set('clerkToken', token)

        await next()
    } catch {
        return c.json({ error: 'Unauthorized' }, 401)
    }
})