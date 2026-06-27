import { ConvexHttpClient } from 'convex/browser'
import { CONVEX_URL } from '../config.ts'

export const convex = new ConvexHttpClient(CONVEX_URL)