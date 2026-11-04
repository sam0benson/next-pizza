import { requireUser, scopeWhere } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensurePasskeySchema } from '@/lib/passkey'
export async function GET() {
	try {
		const u = await requireUser(),
			where = { schoolId: u.schoolId, ...scopeWhere(u) }
		const [
			school,
			locations,
			assets,
			materials,
			lots,
			documents,
			plans,
			audit,
			stocktakes,
			users,
			devices,
			people,
		] = await Promise.all([
			db.school.findUnique({ where: { id: u.schoolId } }),
			db.location.findMany({
				where: { schoolId: u.schoolId },
				orderBy: { name: 'asc' },
			}),
			db.asset.findMany({ where, orderBy: { createdAt: 'desc' } }),
			db.material.findMany({ where }),
			db.lot.findMany({
				where: { schoolId: u.schoolId },
				orderBy: { received: 'asc' },
			}),
			db.document.findMany({ where, orderBy: { createdAt: 'desc' } }),
			db.floorPlan.findMany({ where: { schoolId: u.schoolId } }),
			db.audit.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 }),
			db.stocktake.findMany({ where, orderBy: { createdAt: 'desc' } }),
			u.role === 'ADMIN'
				? db.user.findMany({
						where: { schoolId: u.schoolId },
						select: {
							id: true,
							email: true,
							name: true,
							role: true,
							scope: true,
							active: true,
							totpEnabled: true,
						},
					})
				: [],
			u.role === 'ADMIN'
				? db.device.findMany({
						where: { schoolId: u.schoolId },
						orderBy: [{ status: 'asc' }, { lastSeen: 'desc' }],
						select: {
							id: true,
							userId: true,
							name: true,
							userAgent: true,
							ip: true,
							status: true,
							createdAt: true,
							approvedAt: true,
							lastSeen: true,
						},
					})
				: [],
			db.user.findMany({
				where: { schoolId: u.schoolId },
				select: { id: true, name: true },
			}),
		])
		await ensurePasskeySchema()
		const keys =
			u.role === 'ADMIN'
				? await db.passkey.findMany({
						where: { schoolId: u.schoolId },
						select: { id: true, deviceId: true },
					})
				: []
		const materialIds = new Set(materials.map((m) => m.id))
		return Response.json(
			{
				user: {
					id: u.id,
					name: u.name,
					email: u.email,
					role: u.role,
					scope: u.scope,
					totpEnabled: u.totpEnabled,
				},
				school,
				locations,
				assets,
				materials,
				lots: lots.filter((l) => materialIds.has(l.materialId)),
				documents,
				plans,
				audit,
				stocktakes,
				users,
				devices: devices.map((d) => ({
					...d,
					passkeys: keys.filter((k) => k.deviceId === d.id).map((k) => k.id),
				})),
				people,
			},
			{ headers: { 'Cache-Control': 'no-store' } },
		)
	} catch (e: any) {
		console.error('data', e)
		return Response.json(
			{
				error:
					e.message === 'UNAUTHORIZED'
						? 'Требуется вход'
						: 'Ошибка загрузки данных',
			},
			{ status: e.message === 'UNAUTHORIZED' ? 401 : 500 },
		)
	}
}
