import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	randomBytes,
	randomInt,
	timingSafeEqual,
} from 'node:crypto'

/* ---------- Шифрование секретов (AES-256-GCM, ключ из APP_SECRET) ---------- */
function key() {
	const s = process.env.APP_SECRET || ''
	if (s.length < 32 || s.startsWith('replace-'))
		throw new Error('APP_SECRET не задан (нужно не менее 32 случайных символов)')
	return createHash('sha256').update(s).digest()
}
export function encrypt(plain: string) {
	const iv = randomBytes(12),
		c = createCipheriv('aes-256-gcm', key(), iv)
	const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
	return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.')
}
export function decrypt(box: string) {
	const [iv, tag, data] = box.split('.').map((p) => Buffer.from(p, 'base64url'))
	const d = createDecipheriv('aes-256-gcm', key(), iv)
	d.setAuthTag(tag)
	return Buffer.concat([d.update(data), d.final()]).toString('utf8')
}

/* ---------- TOTP (RFC 6238, совместим с Google Authenticator, Яндекс Ключ, Aegis) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function base32(buf: Buffer) {
	let bits = 0,
		value = 0,
		out = ''
	for (const byte of buf) {
		value = (value << 8) | byte
		bits += 8
		while (bits >= 5) {
			out += B32[(value >>> (bits - 5)) & 31]
			bits -= 5
		}
	}
	if (bits > 0) out += B32[(value << (5 - bits)) & 31]
	return out
}
function unbase32(s: string) {
	let bits = 0,
		value = 0
	const out: number[] = []
	for (const ch of s.replace(/=+$/, '').toUpperCase()) {
		const i = B32.indexOf(ch)
		if (i < 0) continue
		value = (value << 5) | i
		bits += 5
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255)
			bits -= 8
		}
	}
	return Buffer.from(out)
}
export const newTotpSecret = () => base32(randomBytes(20))
function hotp(secret: string, counter: number) {
	const msg = Buffer.alloc(8)
	msg.writeBigUInt64BE(BigInt(counter))
	const h = createHmac('sha1', unbase32(secret)).update(msg).digest()
	const o = h[h.length - 1] & 15
	return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
/** Возвращает номер временного шага при совпадении кода (±30 секунд), иначе null. */
export function verifyTotp(secret: string, code: string, lastStep?: number | null) {
	const c = String(code || '').replace(/\D/g, '')
	if (c.length !== 6) return null
	const now = Math.floor(Date.now() / 30000)
	for (const step of [now - 1, now, now + 1]) {
		if (lastStep != null && step <= lastStep) continue // защита от повторного использования
		if (safeEqual(hotp(secret, step), c)) return step
	}
	return null
}
export function otpauthUrl(secret: string, account: string, issuer: string) {
	return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
export function safeEqual(a: string, b: string) {
	const x = Buffer.from(a),
		y = Buffer.from(b)
	return x.length === y.length && timingSafeEqual(x, y)
}

/* ---------- Код подтверждения устройства ---------- */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // без 0/O, 1/I
export function deviceCode() {
	let s = ''
	for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
	return `${s.slice(0, 4)}-${s.slice(4)}`
}
export const normalizeCode = (s: string) =>
	String(s || '')
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')

export function deviceName(ua: string) {
	const os = /iPhone/.test(ua)
		? 'iPhone'
		: /iPad/.test(ua)
			? 'iPad'
			: /Android/.test(ua)
				? 'Android'
				: /Windows/.test(ua)
					? 'Windows'
					: /Mac OS X/.test(ua)
						? 'macOS'
						: /Linux/.test(ua)
							? 'Linux'
							: 'Устройство'
	const br = /YaBrowser/.test(ua)
		? 'Яндекс Браузер'
		: /Edg\//.test(ua)
			? 'Edge'
			: /OPR\//.test(ua)
				? 'Opera'
				: /Firefox\//.test(ua)
					? 'Firefox'
					: /Chrome\//.test(ua)
						? 'Chrome'
						: /Safari\//.test(ua)
							? 'Safari'
							: 'браузер'
	return `${os} · ${br}`
}

/* ---------- IP клиента и ограничение частоты ---------- */
export function clientIp(req: Request) {
	// Traefik (Dokploy) и Caddy выставляют X-Real-IP; последний элемент X-Forwarded-For добавлен прокси.
	const real = req.headers.get('x-real-ip')
	if (real) return real.trim().slice(0, 64)
	const xff = req.headers.get('x-forwarded-for')
	if (xff) return xff.split(',').pop()!.trim().slice(0, 64)
	return 'unknown'
}
const buckets = new Map<string, { n: number; until: number }>()
/** Простой лимит в памяти процесса: не более `max` событий за `windowMs`. */
export function rateLimit(key: string, max: number, windowMs: number) {
	const now = Date.now()
	if (buckets.size > 10000)
		for (const [k, v] of buckets) if (v.until < now) buckets.delete(k)
	const b = buckets.get(key)
	if (!b || b.until < now) {
		buckets.set(key, { n: 1, until: now + windowMs })
		return true
	}
	b.n++
	return b.n <= max
}
