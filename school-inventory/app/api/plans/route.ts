import { checkOrigin, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
export async function POST(req: Request) {
	try {
		checkOrigin(req)
		const u = await requireUser()
		if (u.role !== 'ADMIN') throw new Error('Нет прав')
		const form = await req.formData(),
			file = form.get('file')
		if (!(file instanceof File) || file.size > 10 * 1024 * 1024)
			throw new Error('Изображение до 10 МБ')
		const b = Buffer.from(await file.arrayBuffer())
		const png = b
				.subarray(0, 8)
				.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
			jpg = b[0] === 255 && b[1] === 216 && b[2] === 255
		if (!png && !jpg) throw new Error('Разрешены только PNG и JPEG')
		const image = randomUUID() + (png ? '.png' : '.jpg'),
			dir = path.join(process.env.DATA_DIR || './data', u.schoolId)
		await mkdir(dir, { recursive: true })
		await writeFile(path.join(dir, image), b)
		const plan = await db.floorPlan.create({
			data: {
				schoolId: u.schoolId,
				name: String(form.get('name') || 'План этажа').slice(0, 200),
				image,
			},
		})
		return Response.json(plan)
	} catch (e: any) {
		return Response.json({ error: e.message }, { status: 400 })
	}
}
