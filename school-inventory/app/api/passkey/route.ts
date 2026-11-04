import {
	checkOrigin,
	currentSession,
	deviceToken,
	hash,
	signIn,
} from '@/lib/auth'
import { db } from '@/lib/db'
import {
	ensurePasskeySchema,
	HttpError,
	rp,
	saveChallenge,
	takeChallenge,
} from '@/lib/passkey'
import { clientIp, rateLimit } from '@/lib/security'
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { createHash } from 'node:crypto'

const transports = (s: string) =>
	(s ? s.split(',') : []) as AuthenticatorTransportFuture[]

/** Ключи, которыми можно войти с этого браузера: только на доверенных устройствах. */
async function keysForThisDevice() {
	const dt = await deviceToken()
	if (!dt) return { dt: null, keys: [] as any[] }
	const devices = await db.device.findMany({
		where: { tokenHash: hash(dt), status: 'APPROVED' },
		select: { id: true, userId: true },
	})
	if (!devices.length) return { dt, keys: [] }
	const keys = await db.passkey.findMany({
		where: { deviceId: { in: devices.map((d) => d.id) } },
	})
	const users = await db.user.findMany({
		where: { id: { in: keys.map((k) => k.userId) }, active: true },
		select: { id: true },
	})
	const ok = new Set(users.map((u) => u.id))
	return {
		dt,
		keys: keys.filter(
			(k) =>
				ok.has(k.userId) &&
				devices.some((d) => d.id === k.deviceId && d.userId === k.userId),
		),
	}
}

export async function POST(req: Request) {
	try {
		checkOrigin(req)
		await ensurePasskeySchema()
		const body = await req.json().catch(() => ({}))
		const step = String(body.step || '')
		const { origin, rpID } = rp()
		const ip = clientIp(req)

		/* ---------- без входа: экран логина ---------- */
		if (step === 'status') {
			const { keys } = await keysForThisDevice()
			return Response.json({ available: keys.length > 0 })
		}
		if (step === 'login-options' || step === 'login') {
			if (!rateLimit('passkey-ip:' + ip, 30, 15 * 60_000))
				throw new HttpError('Слишком много попыток. Повторите позже.', 429)
			const { dt, keys } = await keysForThisDevice()
			if (!dt || !keys.length)
				throw new HttpError(
					'На этом устройстве вход по Face ID не настроен. Войдите по паролю.',
					404,
				)
			if (step === 'login-options') {
				const options = await generateAuthenticationOptions({
					rpID,
					userVerification: 'required',
					timeout: 60_000,
					allowCredentials: keys.map((k) => ({
						id: k.id,
						transports: transports(k.transports),
					})),
				})
				await saveChallenge(options.challenge, 'login', {
					tokenHash: hash(dt),
				})
				return Response.json(options)
			}
			const response = body.response
			const { challenge, rec } = await takeChallenge(response, 'login')
			if (rec.tokenHash !== hash(dt))
				throw new HttpError('Запрос устарел, попробуйте ещё раз', 401)
			const key = keys.find((k) => k.id === String(response?.id || ''))
			if (!key)
				throw new HttpError(
					'Этот ключ не привязан к устройству. Войдите по паролю.',
					401,
				)
			const v = await verifyAuthenticationResponse({
				response,
				expectedChallenge: challenge,
				expectedOrigin: origin,
				expectedRPID: rpID,
				requireUserVerification: true,
				credential: {
					id: key.id,
					publicKey: new Uint8Array(key.publicKey),
					counter: Number(key.counter),
					transports: transports(key.transports),
				},
			}).catch(() => ({ verified: false }) as const)
			if (!v.verified)
				throw new HttpError('Не удалось подтвердить вход', 401)
			await db.passkey.update({
				where: { id: key.id },
				data: {
					counter: BigInt(v.authenticationInfo.newCounter),
					lastUsed: new Date(),
				},
			})
			await db.device.update({
				where: { id: key.deviceId },
				data: {
					lastSeen: new Date(),
					ip,
					userAgent: (req.headers.get('user-agent') || '').slice(0, 400),
				},
			})
			await signIn(key.userId, key.deviceId)
			return Response.json({ ok: true })
		}

		/* ---------- после входа: настройка ---------- */
		const s = await currentSession()
		if (!s) throw new HttpError('Требуется вход', 401)
		const { user, device } = s
		const audit = (action: string, details: any) =>
			db.audit.create({
				data: {
					schoolId: user.schoolId,
					scope: 'ALL',
					userId: user.id,
					action,
					entityId: device.id,
					details,
				},
			})

		if (step === 'list') {
			const keys = await db.passkey.findMany({
				where: { userId: user.id },
				orderBy: { createdAt: 'desc' },
			})
			return Response.json({
				thisDevice: keys.some((k) => k.deviceId === device.id),
				keys: keys.map((k) => ({
					id: k.id,
					name: k.name,
					createdAt: k.createdAt,
					lastUsed: k.lastUsed,
					thisDevice: k.deviceId === device.id,
				})),
			})
		}
		if (step === 'register-options') {
			const all = await db.passkey.findMany({ where: { userId: user.id } })
			if (all.length >= 10)
				throw new HttpError('Не более 10 устройств с входом по Face ID')
			const school = await db.school.findUnique({
				where: { id: user.schoolId },
			})
			// Отдельный «пользователь» WebAuthn на каждое устройство: iCloud не
			// перезапишет ключ iPhone ключом с Mac, а повторное включение на том же
			// устройстве заменит старый ключ, а не создаст дубликат.
			const userID = new Uint8Array(
				createHash('sha256')
					.update(user.id + ':' + device.id)
					.digest()
					.subarray(0, 16),
			)
			const options = await generateRegistrationOptions({
				rpName: school?.name || 'Школьный инвентарь',
				rpID,
				userID,
				userName: user.email,
				userDisplayName: user.name || user.email,
				attestationType: 'none',
				timeout: 60_000,
				excludeCredentials: all
					.filter((k) => k.deviceId === device.id)
					.map((k) => ({ id: k.id, transports: transports(k.transports) })),
				authenticatorSelection: {
					authenticatorAttachment: 'platform',
					residentKey: 'preferred',
					userVerification: 'required',
				},
			})
			await saveChallenge(options.challenge, 'register', {
				userId: user.id,
				tokenHash: device.tokenHash,
			})
			return Response.json(options)
		}
		if (step === 'register') {
			const response = body.response
			const { challenge, rec } = await takeChallenge(response, 'register')
			if (rec.userId !== user.id || rec.tokenHash !== device.tokenHash)
				throw new HttpError('Запрос устарел, попробуйте ещё раз')
			const v = await verifyRegistrationResponse({
				response,
				expectedChallenge: challenge,
				expectedOrigin: origin,
				expectedRPID: rpID,
				requireUserVerification: true,
			}).catch(() => ({ verified: false }) as const)
			if (!v.verified || !v.registrationInfo)
				throw new HttpError('Устройство не подтвердило ключ')
			const c = v.registrationInfo.credential
			if (await db.passkey.findUnique({ where: { id: c.id } }))
				throw new HttpError('Этот ключ уже добавлен')
			await db.passkey.create({
				data: {
					id: c.id,
					schoolId: user.schoolId,
					userId: user.id,
					deviceId: device.id,
					publicKey: Buffer.from(c.publicKey),
					counter: BigInt(c.counter),
					transports: (c.transports || []).join(','),
					name: device.name,
				},
			})
			await audit('passkeyAdd', { name: device.name })
			return Response.json({ ok: true })
		}
		if (step === 'delete') {
			const key = await db.passkey.findUnique({
				where: { id: String(body.id || '') },
			})
			if (
				!key ||
				!(
					key.userId === user.id ||
					(user.role === 'ADMIN' && key.schoolId === user.schoolId)
				)
			)
				throw new HttpError('Ключ не найден', 404)
			await db.passkey.delete({ where: { id: key.id } })
			await audit('passkeyRemove', { name: key.name, userId: key.userId })
			return Response.json({ ok: true })
		}
		throw new HttpError('Неизвестный шаг')
	} catch (e: any) {
		if (e?.message === 'Недопустимый источник запроса')
			e = new HttpError(e.message, 403)
		if (!(e instanceof HttpError)) console.error('passkey', e)
		return Response.json(
			{ error: e instanceof HttpError ? e.message : 'Ошибка входа по Face ID' },
			{ status: e instanceof HttpError ? e.status : 400 },
		)
	}
}
