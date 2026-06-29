import { ConvexHttpClient } from 'convex/browser'
import { CONVEX_URL } from '../config.js'

export const convex = new ConvexHttpClient(CONVEX_URL)

export const createConvexClient = (authToken?: string): ConvexHttpClient => {
	return authToken ? new ConvexHttpClient(CONVEX_URL, { auth: authToken }) : new ConvexHttpClient(CONVEX_URL)
}