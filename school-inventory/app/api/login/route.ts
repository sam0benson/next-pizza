import {
	checkOrigin,
	deviceToken,
	hash,
	setTicket,
	signIn,
} from '@/lib/auth'
import { db } from '@/lib/db'
import {
	clientIp,
	decrypt,
	deviceCode,
	deviceName,
	rateLimit,
	verifyTotp,
} from '@/lib/security'
import { compare, hash as bcryptHash } from 'bcryptjs'
import { randomBytes } from 'node:crypto'
// Хеш-заглушка выравнивает время ответа для несуществующих email.
let DUMMY: Promise<string> | undefined
export async function POST(req: Request) {
	try {
		checkOrigin(req)
		const ip = clientIp(req)
		if (!rateLimit('login-ip:' + ip, 30, 15 * 60_000))
			return Response.json(
				{ error: 'Слишком много попыток с этого адреса. Повторите позже.' },
				{ status: 429 },
			)
		const body = await req.json()
		const email = String(body.email || '')
				.toLowerCase()
				.trim()
				.slice(0, 200),
			password = String(body.password || '').slice(0, 256),
			code = String(body.code || '').slice(0, 12)
		const key = hash(email),
			now = new Date()
		const attempt = await db.loginAttempt.upsert({
			where: { key },
			create: { key, count: 1, until: new Date(Date.now() + 900000) },
			update: { count: { increment: 1 } },
		})
		if (attempt.until < now)
			await db.loginAttempt.update({
				where: { key },
				data: { count: 1, until: new Date(Date.now() + 900000) },
			})
		else if (attempt.count > 10)
			return Response.json(
				{ error: 'Слишком много попыток. Повторите через 15 минут.' },
				{ status: 429 },
			)
		const user = await db.user.findUnique({ where: { email } })
		const passwordOk = await compare(
			password,
			user?.password || (await (DUMMY ??= bcryptHash('dummy-password', 12))),
		)
		if (!user?.active || !passwordOk)
			return Response.json(
				{ error: 'Неверный логин или пароль' },
				{ status: 401 },
			)
		// Второй фактор
		if (user.totpEnabled && user.totpSecret) {
			if (!code)
				return Response.json(
					{ needCode: true, error: 'Введите код из приложения-аутентификатора' },
					{ status: 401 },
				)
			const step = verifyTotp(decrypt(user.totpSecret), code, user.totpLastStep)
			if (step === null)
				return Response.json(
					{ needCode: true, error: 'Неверный или устаревший код' },
					{ status: 401 },
				)
			await db.user.update({
				where: { id: user.id },
				data: { totpLastStep: step },
			})
		}
		await db.loginAttempt.deleteMany({ where: { key } })
		// Привязка к устройству
		const dt = (await deviceToken(true))!
		const ua = (req.headers.get('user-agent') || '').slice(0, 400)
		let device = await db.device.findUnique({
			where: { tokenHash_userId: { tokenHash: hash(dt), userId: user.id } },
		})
		if (device?.status === 'REVOKED')
			return Response.json(
				{ error: 'Это устройство заблокировано администратором.' },
				{ status: 403 },
			)
		if (device?.status === 'APPROVED') {
			await db.device.update({
				where: { id: device.id },
				data: { lastSeen: new Date(), ip, userAgent: ua },
			})
			await signIn(user.id, device.id)
			return Response.json({ ok: true })
		}
		const ticket = randomBytes(32).toString('hex')
		const ticketData = {
			ticketHash: hash(ticket),
			ticketExpires: new Date(Date.now() + 30 * 60_000),
		}
		if (!device) {
			// Не более 5 ожидающих заявок на пользователя
			const pending = await db.device.findMany({
				where: { userId: user.id, status: 'PENDING' },
				orderBy: { createdAt: 'desc' },
			})
			if (pending.length >= 5)
				await db.device.deleteMany({
					where: { id: { in: pending.slice(4).map((p) => p.id) } },
				})
			device = await db.device.create({
				data: {
					schoolId: user.schoolId,
					userId: user.id,
					tokenHash: hash(dt),
					name: deviceName(ua),
					userAgent: ua,
					ip,
					code: deviceCode(),
					...ticketData,
				},
			})
		} else
			device = await db.device.update({
				where: { id: device.id },
				data: { ...ticketData, ip, userAgent: ua, lastSeen: new Date() },
			})
		await setTicket(ticket)
		console.log(
			`[device] Новое устройство ждёт подтверждения: ${user.email}, ${device.name}, IP ${ip}, код ${device.code}. ` +
				`Подтвердить: в разделе «Устройства» или командой npm run device -- approve ${device.code}`,
		)
		return Response.json({ pending: true, code: device.code })
	} catch (e) {
		console.error('login', e)
		return Response.json({ error: 'Ошибка входа' }, { status: 400 })
	}
}
