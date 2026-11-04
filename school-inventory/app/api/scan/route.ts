import { checkOrigin, requireUser, scopeWhere } from '@/lib/auth'
import { db } from '@/lib/db'
import { parseQr } from '@/lib/qr'
import { rateLimit } from '@/lib/security'
/** Расшифровка отсканированного QR. Работает только для авторизованного пользователя. */
export async function POST(req: Request) {
	try {
		checkOrigin(req)
		const u = await requireUser()
		if (!rateLimit('scan:' + u.id, 120, 60_000))
			return Response.json({ error: 'Слишком часто' }, { status: 429 })
		const { text } = await req.json()
		const p = parseQr(String(text || '').slice(0, 500))
		if (!p.code && !p.legacyId)
			return Response.json(
				{ error: 'Это не этикетка школьного инвентаря' },
				{ status: 404 },
			)
		const a = await db.asset.findFirst({
			where: {
				schoolId: u.schoolId,
				...scopeWhere(u),
				...(p.code ? { qrCode: p.code } : { id: p.legacyId }),
			},
			select: { id: true },
		})
		if (!a)
			return Response.json(
				{ error: 'Объект не найден, этикетка перевыпущена или нет доступа' },
				{ status: 404 },
			)
		return Response.json({ id: a.id, legacy: !!p.legacyId })
	} catch (e: any) {
		const auth = e.message === 'UNAUTHORIZED'
		return Response.json(
			{ error: auth ? 'Требуется вход' : 'Ошибка сканирования' },
			{ status: auth ? 401 : 400 },
		)
	}
}
