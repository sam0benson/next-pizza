import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'node:crypto'
import { db } from './db'
export const hash = (s: string) => createHash('sha256').update(s).digest('hex')
export const SESSION_COOKIE = 'inventory_session'
export const DEVICE_COOKIE = 'inventory_device'
export const TICKET_COOKIE = 'inventory_pending'
const secure = () => process.env.APP_ORIGIN?.startsWith('https://')
const cookieBase = () => ({
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: secure(),
	path: '/',
})

/** Постоянный идентификатор браузера/PWA. Сам по себе доступа не даёт. */
export async function deviceToken(create = false) {
	const c = await cookies()
	let t = c.get(DEVICE_COOKIE)?.value
	if ((!t || !/^[a-f0-9]{64}$/.test(t)) && create) {
		t = randomBytes(32).toString('hex')
		c.set(DEVICE_COOKIE, t, { ...cookieBase(), maxAge: 400 * 24 * 3600 })
	}
	return t && /^[a-f0-9]{64}$/.test(t) ? t : null
}

/** Текущая сессия вместе с доверенным устройством, к которому она привязана. */
export async function currentSession() {
	const c = await cookies()
	const token = c.get(SESSION_COOKIE)?.value
	if (!token) return null
	const session = await db.session.findUnique({ where: { id: hash(token) } })
	if (!session || session.expires < new Date() || !session.deviceId) return null
	// Сессия действительна только вместе с cookie того устройства, на котором выполнен вход.
	const dt = await deviceToken()
	if (!dt) return null
	const device = await db.device.findUnique({ where: { id: session.deviceId } })
	if (
		!device ||
		device.status !== 'APPROVED' ||
		device.userId !== session.userId ||
		device.tokenHash !== hash(dt)
	)
		return null
	const user = await db.user.findFirst({
		where: { id: session.userId, active: true },
	})
	if (!user) return null
	if (Date.now() - device.lastSeen.getTime() > 5 * 60_000)
		await db.device
			.update({ where: { id: device.id }, data: { lastSeen: new Date() } })
			.catch(() => {})
	return { user, device }
}
export async function currentUser() {
	return (await currentSession())?.user ?? null
}
export async function requireUser() {
	const u = await currentUser()
	if (!u) throw new Error('UNAUTHORIZED')
	return u
}
export async function signIn(userId: string, deviceId: string) {
	const token = randomBytes(32).toString('hex')
	await db.session.deleteMany({ where: { expires: { lt: new Date() } } })
	await db.session.create({
		data: {
			id: hash(token),
			userId,
			deviceId,
			expires: new Date(Date.now() + 8 * 3600_000),
		},
	})
	;(await cookies()).set(SESSION_COOKIE, token, {
		...cookieBase(),
		maxAge: 8 * 3600,
	})
}
export async function setTicket(ticket: string | null) {
	const c = await cookies()
	if (ticket) c.set(TICKET_COOKIE, ticket, { ...cookieBase(), maxAge: 1800 })
	else c.delete(TICKET_COOKIE)
}
export function checkOrigin(req: Request) {
	if (
		!process.env.APP_ORIGIN ||
		req.headers.get('origin') !== process.env.APP_ORIGIN
	)
		throw new Error('Недопустимый источник запроса')
}
export function scopeWhere(u: { role: string; scope: string }) {
	return u.role === 'ADMIN' || u.scope === 'ALL' ? {} : { scope: u.scope }
}
export function canWrite(u: { role: string }) {
	if (!['ADMIN', 'OPERATOR'].includes(u.role))
		throw new Error('Недостаточно прав')
}
