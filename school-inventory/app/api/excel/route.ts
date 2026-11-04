import { canWrite, checkOrigin, requireUser, scopeWhere } from '@/lib/auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import ExcelJS from 'exceljs'
export async function GET() {
	const u = await requireUser()
	const rows = await db.asset.findMany({
			where: { schoolId: u.schoolId, ...scopeWhere(u) },
		}),
		locations = await db.location.findMany({ where: { schoolId: u.schoolId } })
	const book = new ExcelJS.Workbook(),
		sheet = book.addWorksheet('Имущество')
	sheet.addRow([
		'Инвентарный номер',
		'Название',
		'Категория',
		'Помещение',
		'Стоимость',
		'Направление',
		'Серийный номер',
		'Ответственный',
		'Статус',
	])
	for (const a of rows)
		sheet.addRow([
			a.inventory,
			a.name,
			a.category,
			locations.find((l) => l.id === a.locationId)?.name || '',
			a.cost.toString(),
			a.scope,
			a.serial,
			a.responsible,
			a.status,
		])
	sheet.getColumn(1).numFmt = '@'
	sheet.columns.forEach((c) => (c.width = 25))
	sheet.getRow(1).font = { bold: true }
	return new Response(new Uint8Array(await book.xlsx.writeBuffer()), {
		headers: {
			'Content-Type':
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename=inventory.xlsx',
		},
	})
}
export async function POST(req: Request) {
	try {
		checkOrigin(req)
		const u = await requireUser()
		canWrite(u)
		const form = await req.formData(),
			file = form.get('file')
		if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
			throw new Error('Нужен XLSX до 5 МБ')
		const book = new ExcelJS.Workbook()
		await book.xlsx.load((await file.arrayBuffer()) as any)
		const sheet = book.worksheets[Number(form.get('sheet') || 0)]
		if (!sheet || sheet.rowCount > 5000)
			throw new Error('Лист не найден или превышен лимит 5000 строк')
		const header = Number(form.get('header') || 1)
		if (!Number.isInteger(header) || header < 1)
			throw new Error('Неверная строка заголовка')
		const raw: string[][] = []
		sheet.eachRow((row, i) => {
			if (i >= header)
				raw.push(
					Array.from({ length: Math.min(sheet.columnCount, 50) }, (_, n) =>
						row.getCell(n + 1).text.trim(),
					),
				)
		})
		if (form.get('mode') === 'inspect')
			return Response.json({
				sheets: book.worksheets.map((s) => s.name),
				headers: raw[0] || [],
				sample: raw.slice(1, 6),
			})
		const map = JSON.parse(String(form.get('mapping') || '{}')),
			locations = await db.location.findMany({
				where: { schoolId: u.schoolId },
			})
		const existing = new Set(
			(
				await db.asset.findMany({
					where: { schoolId: u.schoolId },
					select: { inventory: true },
				})
			).map((a) => a.inventory),
		)
		const seen = new Set<string>(),
			errors: string[] = [],
			rows: any[] = []
		raw.slice(1).forEach((r, index) => {
			const val = (key: string) =>
				map[key] === undefined || map[key] === ''
					? ''
					: r[Number(map[key])] || ''
			const inventory = val('inventory'),
				name = val('name'),
				category = val('category'),
				room = val('location'),
				cost = val('cost').replace(/\s/g, '').replace(',', '.')
			if (!r.some(Boolean)) return
			const matches = locations.filter((l) => l.name === room)
			const scope =
				u.role === 'ADMIN' || u.scope === 'ALL' ? val('scope') || 'IT' : u.scope
			let error = ''
			if (!inventory || !name || !category)
				error = 'Пустой номер, название или категория'
			else if (existing.has(inventory) || seen.has(inventory))
				error = 'Дублирующийся инвентарный номер'
			else if (matches.length !== 1)
				error = 'Помещение не найдено или название неоднозначно'
			else if (
				!cost ||
				!Number.isFinite(Number(cost)) ||
				Number(cost) < 0 ||
				Number(cost) > 999999999
			)
				error = 'Некорректная стоимость'
			else if (!['IT', 'HOUSEHOLD'].includes(scope))
				error = 'Направление: IT или HOUSEHOLD'
			seen.add(inventory)
			if (error) errors.push(`Строка ${header + index + 1}: ${error}`)
			else
				rows.push({
					schoolId: u.schoolId,
					inventory,
					name,
					category,
					locationId: matches[0].id,
					cost: Number(cost),
					scope,
					serial: val('serial'),
					responsible: val('responsible'),
				})
		})
		if (form.get('mode') !== 'commit')
			return Response.json({
				rows: rows.slice(0, 20),
				count: rows.length,
				errors,
			})
		if (errors.length) throw new Error('Исправьте все ошибки перед импортом')
		await db.$transaction(
			async (tx) => {
				await tx.asset.createMany({ data: rows })
				await tx.audit.create({
					data: {
						schoolId: u.schoolId,
						scope: u.scope,
						userId: u.id,
						action: 'Импорт Excel',
						entityId: 'import',
						details: {
							count: rows.length,
							inventories: rows.map((r) => r.inventory),
						},
					},
				})
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
		)
		return Response.json({ count: rows.length })
	} catch (e: any) {
		return Response.json(
			{
				error:
					e.code === 'P2002'
						? 'Обнаружены дубликаты. Повторите предпросмотр.'
						: e.message,
			},
			{ status: 400 },
		)
	}
}
