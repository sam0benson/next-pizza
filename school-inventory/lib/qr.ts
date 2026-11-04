import { randomBytes } from 'node:crypto'
import { db } from './db'
/**
 * Содержимое QR-этикетки — непрозрачная строка вида "SINV1:<случайный токен>".
 * Это не ссылка: обычная камера покажет только текст. Расшифровать её может
 * только сервер, и только для вошедшего пользователя с доверенного устройства.
 */
export const QR_PREFIX = 'SINV1:'
export const newQrCode = () => randomBytes(18).toString('base64url')
export const qrPayload = (code: string) => QR_PREFIX + code
export function parseQr(text: string): { code?: string; legacyId?: string } {
	const t = String(text || '').trim()
	if (t.startsWith(QR_PREFIX)) {
		const code = t.slice(QR_PREFIX.length)
		return /^[A-Za-z0-9_-]{16,64}$/.test(code) ? { code } : {}
	}
	// Совместимость со старыми этикетками вида https://.../?asset=<id>
	try {
		const id = new URL(t).searchParams.get('asset')
		if (id && /^[a-z0-9]{10,40}$/.test(id)) return { legacyId: id }
	} catch {}
	return {}
}
/** Выдаёт QR-коды объектам, у которых их ещё нет. */
export async function ensureQrCodes<T extends { id: string; qrCode: string | null }>(
	assets: T[],
): Promise<(T & { qrCode: string })[]> {
	return Promise.all(
		assets.map(async (a) => {
			if (a.qrCode) return a as T & { qrCode: string }
			const code = newQrCode()
			const r = await db.asset.updateMany({
				where: { id: a.id, qrCode: null },
				data: { qrCode: code },
			})
			if (r.count) return { ...a, qrCode: code }
			const fresh = await db.asset.findUnique({ where: { id: a.id } })
			return { ...a, qrCode: fresh!.qrCode! }
		}),
	)
}
