import {
	checkOrigin,
	deviceToken,
	hash,
	setTicket,
	signIn,
	TICKET_COOKIE,
} from '@/lib/auth'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'
/** Проверка статуса заявки устройства после ввода пароля (опрос со страницы входа). */
export async function POST(req: Request) {
	try {
		checkOrigin(req)
		const dt = await deviceToken(),
			ticket = (await cookies()).get(TICKET_COOKIE)?.value
		if (!dt || !ticket)
			return Response.json({ expired: true }, { status: 401 })
		const device = await db.device.findFirst({
			where: {
				tokenHash: hash(dt),
				ticketHash: hash(ticket),
				ticketExpires: { gt: new Date() },
			},
		})
		if (!device) {
			await setTicket(null)
			return Response.json(
				{ expired: true, error: 'Время ожидания истекло, войдите заново' },
				{ status: 401 },
			)
		}
		if (device.status === 'REVOKED') {
			await setTicket(null)
			return Response.json(
				{ error: 'Администратор отклонил устройство' },
				{ status: 403 },
			)
		}
		if (device.status !== 'APPROVED')
			return Response.json({ pending: true, code: device.code })
		const user = await db.user.findFirst({
			where: { id: device.userId, active: true },
		})
		if (!user) return Response.json({ expired: true }, { status: 401 })
		await db.device.update({
			where: { id: device.id },
			data: { ticketHash: null, ticketExpires: null, lastSeen: new Date() },
		})
		await setTicket(null)
		await signIn(user.id, device.id)
		return Response.json({ ok: true })
	} catch {
		return Response.json({ error: 'Ошибка проверки' }, { status: 400 })
	}
}
