import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const nodeProcess = (globalThis as typeof globalThis & {
    process?: {
        env: Record<string, string | undefined>
        cwd(): string
    }
}).process

const loadEnvFile = (filePath: string): void => {
    if (!nodeProcess) {
        return
    }

    try {
        const fileContents = readFileSync(filePath, 'utf8')

        for (const line of fileContents.split(/\r?\n/)) {
            const trimmedLine = line.trim()

            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue
            }

            const equalsIndex = trimmedLine.indexOf('=')

            if (equalsIndex === -1) {
                continue
            }

            const key = trimmedLine.slice(0, equalsIndex).trim()
            const value = trimmedLine.slice(equalsIndex + 1).trim()

            if (!(key in nodeProcess.env) || nodeProcess.env[key] === undefined) {
                nodeProcess.env[key] = value
            }
        }
    } catch {
        // Ignore missing .env files; fall back to existing process.env values.
    }
}

loadEnvFile(resolve(nodeProcess?.cwd() ?? '.', '.env'))

const parseNumberEnv = (value: string | undefined, defaultValue: number): number => {
    if (value === undefined || value.trim() === '') {
        return defaultValue
    }

    const parsed = Number(value)

    if (Number.isNaN(parsed)) {
        throw new Error(`Invalid number environment value: ${value}`)
    }

    return parsed
}

const parseBooleanEnv = (value: string | undefined, defaultValue: boolean): boolean => {
    if (value === undefined || value.trim() === '') {
        return defaultValue
    }

    const normalized = value.trim().toLowerCase()

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false
    }

    throw new Error(`Invalid boolean environment value: ${value}`)
}

export const CRON_INTERVAL_MINUTES = parseNumberEnv(nodeProcess?.env.CRON_INTERVAL_MINUTES, 60)
export const MIN_READINGS_REQUIRED = parseNumberEnv(nodeProcess?.env.MIN_READINGS_REQUIRED, 12)
export const CRON_SCHEDULE_ENABLED = parseBooleanEnv(nodeProcess?.env.CRON_SCHEDULE_ENABLED, true)
export const TELEGRAM_BOT_TOKEN = nodeProcess?.env.TELEGRAM_BOT_TOKEN

const convexUrl = nodeProcess?.env.CONVEX_URL
const clerkSecretKey = nodeProcess?.env.CLERK_SECRET_KEY

if (!convexUrl) {
    throw new Error('CONVEX_URL is missing')
}

if (!clerkSecretKey) {
    throw new Error('CLERK_SECRET_KEY is missing')
}

export const CONVEX_URL: string = convexUrl
export const CLERK_SECRET_KEY: string = clerkSecretKey