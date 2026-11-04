import { requireUser, scopeWhere } from '@/lib/auth'
import { db } from '@/lib/db'
export async function GET() {
	try {
		const u = await requireUser(),
			where = { schoolId: u.schoolId, ...scopeWhere(u) }
		const [assets, materials] = await Promise.all([
			db.asset.findMany({ where, select: { id: true } }),
			db.material.findMany({ where, select: { id: true } }),
		])
		const ids = assets.map((a) => a.id),
			lots = await db.lot.findMany({
				where: {
					schoolId: u.schoolId,
					materialId: { in: materials.map((m) => m.id) },
				},
				select: { id: true },
			})
		const [repairs, loans, sets] = await Promise.all([
			db.repair.findMany({
				where: { schoolId: u.schoolId, assetId: { in: ids } },
				orderBy: { createdAt: 'desc' },
			}),
			db.loan.findMany({
				where: {
					schoolId: u.schoolId,
					OR: [
						{ assetId: { in: ids } },
						{ lotId: { in: lots.map((l) => l.id) } },
					],
				},
				orderBy: { createdAt: 'desc' },
			}),
			db.assetSet.findMany({
				where: { schoolId: u.schoolId },
				orderBy: { createdAt: 'desc' },
			}),
		])
		const allowed = new Set(ids)
		return Response.json(
			{
				repairs,
				loans,
				sets: sets.filter((s) =>
					(s.assetIds as string[]).every((id) => allowed.has(id)),
				),
			},
			{ headers: { 'Cache-Control': 'no-store' } },
		)
	} catch (e: any) {
		console.error('extras', e)
		return Response.json(
			{
				error:
					e.message === 'UNAUTHORIZED'
						? 'Требуется вход'
						: 'Не удалось загрузить модули. Проверьте обновление схемы БД.',
			},
			{ status: e.message === 'UNAUTHORIZED' ? 401 : 500 },
		)
	}
}
