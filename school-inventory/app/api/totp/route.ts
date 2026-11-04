import { checkOrigin, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import {
	decrypt,
	encrypt,
	newTotpSecret,
	otpauthUrl,
	verifyTotp,
} from '@/lib/security'
import QRCode from 'qrcode'
/** Подключение и отключение двухфакторной аутентификации текущим пользователем. */
export async function POST(req: Request) {
	try {
		checkOrigin(req)
		const u = await requireUser()
		const { step, code } = await req.json()
		const audit = (action: string) =>
			db.audit.create({
				data: {
					schoolId: u.schoolId,
					scope: u.scope,
					userId: u.id,
					action,
					entityId: u.id,
					details: {},
				},
			})
		if (step === 'start') {
			if (u.totpEnabled) throw new Error('2FA уже включена')
			const secret = newTotpSecret()
			await db.user.update({
				where: { id: u.id },
				data: { totpPending: encrypt(secret) },
			})
			const school = await db.school.findUnique({ where: { id: u.schoolId } })
			const url = otpauthUrl(secret, u.email, school?.name || 'Школьный инвентарь')
			return Response.json({
				secret,
				qr: await QRCode.toDataURL(url, { width: 220, margin: 1 }),
			})
		}
		if (step === 'confirm') {
			if (!u.totpPending) throw new Error('Сначала начните подключение')
			const secret = decrypt(u.totpPending)
			const s = verifyTotp(secret, code)
			if (s === null) throw new Error('Неверный код')
			await db.user.update({
				where: { id: u.id },
				data: {
					totpSecret: encrypt(secret),
					totpPending: null,
					totpEnabled: true,
					totpLastStep: s,
				},
			})
			await audit('2FA включена')
			return Response.json({ ok: true })
		}
		if (step === 'disable') {
			if (!u.totpEnabled || !u.totpSecret) throw new Error('2FA не включена')
			if (verifyTotp(decrypt(u.totpSecret), code, u.totpLastStep) === null)
				throw new Error('Неверный код')
			await db.user.update({
				where: { id: u.id },
				data: {
					totpSecret: null,
					totpPending: null,
					totpEnabled: false,
					totpLastStep: null,
				},
			})
			await audit('2FA отключена')
			return Response.json({ ok: true })
		}
		throw new Error('Неизвестный шаг')
	} catch (e: any) {
		return Response.json(
			{ error: e.message === 'UNAUTHORIZED' ? 'Требуется вход' : e.message },
			{ status: e.message === 'UNAUTHORIZED' ? 401 : 400 },
		)
	}
}
