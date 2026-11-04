import { requireUser, scopeWhere } from '@/lib/auth'
import { db } from '@/lib/db'
import ExcelJS from 'exceljs'
export async function GET(req: Request) {
	try {
		const u = await requireUser(),
			url = new URL(req.url),
			type = url.searchParams.get('type') || 'materials',
			where = { schoolId: u.schoolId, ...scopeWhere(u) }
		const book = new ExcelJS.Workbook(),
			sheet = book.addWorksheet('Экспорт')
		if (type === 'materials') {
			const materials = await db.material.findMany({ where }),
				locations = await db.location.findMany({
					where: { schoolId: u.schoolId },
				}),
				lots = await db.lot.findMany({
					where: {
						schoolId: u.schoolId,
						materialId: { in: materials.map((m) => m.id) },
					},
				})
			sheet.addRow([
				'Материал',
				'Направление',
				'Ед.',
				'Помещение',
				'Партия',
				'Остаток на складе',
				'Цена',
				'Дата поступления',
			])
			for (const l of lots) {
				const m = materials.find((m) => m.id === l.materialId)!
				sheet.addRow([
					m.name,
					m.scope,
					m.unit,
					locations.find((p) => p.id === l.locationId)?.name || '',
					l.id,
					l.quantity.toString(),
					l.price.toString(),
					l.received.toISOString(),
				])
			}
		} else if (type === 'audit') {
			const from = url.searchParams.get('from'),
				to = url.searchParams.get('to')
			const valid = (v: string) => {
				if (
					!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
					!Number.isFinite(new Date(v + 'T00:00:00Z').getTime())
				)
					throw new Error('Неверная дата')
				return new Date(v + 'T00:00:00Z')
			}
			const start = from ? valid(from) : undefined,
				end = to ? new Date(valid(to).getTime() + 86400000) : undefined
			if (start && end && start >= end) throw new Error('Неверный диапазон дат')
			const filter = {
				...where,
				createdAt: {
					...(start ? { gte: start } : {}),
					...(end ? { lt: end } : {}),
				},
			}
			if ((await db.audit.count({ where: filter })) > 20000)
				throw new Error('Больше 20000 событий: сузьте период')
			const rows = await db.audit.findMany({
				where: filter,
				orderBy: { createdAt: 'desc' },
				take: 20000,
			})
			sheet.addRow([
				'Время UTC',
				'Действие',
				'Направление',
				'Пользователь ID',
				'Объект ID',
				'Данные',
			])
			for (const r of rows)
				sheet.addRow([
					r.createdAt.toISOString(),
					r.action,
					r.scope,
					r.userId,
					r.entityId,
					JSON.stringify(r.details),
				])
		} else if (type === 'stocktake') {
			const st = await db.stocktake.findFirst({
				where: { id: url.searchParams.get('id') || '', ...where },
			})
			if (!st) throw new Error('Проверка не найдена')
			const locations = await db.location.findMany({
					where: { schoolId: u.schoolId },
				}),
				name = (id: string) => locations.find((l) => l.id === id)?.name || id
			sheet.addRow(['Проверка', st.name, 'Статус', st.status])
			sheet.addRow([
				'Инв. номер',
				'Название',
				'Учётное помещение',
				'Фактическое помещение',
				'Результат',
				'Отметка UTC',
			])
			for (const a of st.snapshot as any[]) {
				const r = (st.results as any)[a.id]
				sheet.addRow([
					a.inventory,
					a.name,
					name(a.locationId),
					r?.locationId ? name(r.locationId) : '',
					!r
						? 'Не проверено'
						: r.status === 'MISSING'
							? 'Не найдено'
							: r.locationId === a.locationId
								? 'На месте'
								: 'Другое помещение',
					r?.at || '',
				])
			}
		} else throw new Error('Неизвестный экспорт')
		sheet.getRow(1).font = { bold: true }
		sheet.columns.forEach((c) => (c.width = 25))
		return new Response(new Uint8Array(await book.xlsx.writeBuffer()), {
			headers: {
				'Content-Type':
					'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename=${type}.xlsx`,
				'Cache-Control': 'no-store',
			},
		})
	} catch (e: any) {
		return Response.json({ error: e.message }, { status: 400 })
	}
}
