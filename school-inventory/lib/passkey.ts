import { createHash } from 'node:crypto'
import { db } from './db'

/** Параметры проверяющей стороны WebAuthn берутся из APP_ORIGIN. */
export function rp() {
	const origin = (process.env.APP_ORIGIN || '').replace(/\/+$/, '')
	if (!origin) throw new Error('APP_ORIGIN не задан')
	return { origin, rpID: new URL(origin).hostname }
}

export class HttpError extends Error {
	constructor(
		msg: string,
		public status = 400,
	) {
		super(msg)
	}
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

/**
 * Таблицы Passkey/AuthChallenge создаются автоматически (IF NOT EXISTS),
 * чтобы обновление до 0.5 не требовало ручных команд на сервере.
 */
// Совпадает с prisma/upgrades/0.5.sql
const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS "Passkey" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsed" TIMESTAMP(3),
    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "AuthChallenge" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "userId" TEXT,
    "tokenHash" TEXT,
    "expires" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Passkey_userId_idx" ON "Passkey"("userId");
CREATE INDEX IF NOT EXISTS "Passkey_deviceId_idx" ON "Passkey"("deviceId");
CREATE INDEX IF NOT EXISTS "AuthChallenge_expires_idx" ON "AuthChallenge"("expires");`
let ready: Promise<void> | undefined
export function ensurePasskeySchema() {
	return (ready ??= (async () => {
		for (const stmt of SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean))
			await db.$executeRawUnsafe(stmt)
	})().catch((e) => {
		ready = undefined
		throw e
	}))
}

const TTL = 5 * 60_000
export async function saveChallenge(
	challenge: string,
	purpose: 'register' | 'login',
	data: { userId?: string; tokenHash?: string },
) {
	await db.authChallenge.deleteMany({ where: { expires: { lt: new Date() } } })
	await db.authChallenge.create({
		data: {
			id: sha(challenge),
			purpose,
			...data,
			expires: new Date(Date.now() + TTL),
		},
	})
}

/** Достаёт challenge из clientDataJSON ответа и одноразово «погашает» его. */
export async function takeChallenge(response: any, purpose: 'register' | 'login') {
	let challenge = ''
	try {
		const json = Buffer.from(
			String(response?.response?.clientDataJSON || ''),
			'base64url',
		).toString('utf8')
		challenge = String(JSON.parse(json).challenge || '')
	} catch {}
	if (!challenge) throw new HttpError('Некорректный ответ устройства')
	const id = sha(challenge)
	const rec = await db.authChallenge.findUnique({ where: { id } })
	if (!rec) throw new HttpError('Запрос устарел, попробуйте ещё раз', 401)
	await db.authChallenge.delete({ where: { id } }).catch(() => {})
	if (rec.purpose !== purpose || rec.expires < new Date())
		throw new HttpError('Запрос устарел, попробуйте ещё раз', 401)
	return { challenge, rec }
}
