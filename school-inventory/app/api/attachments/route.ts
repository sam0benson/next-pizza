import { attachmentTarget } from '@/lib/attachment-access'
import { canWrite, checkOrigin, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
export async function GET(req: Request) {
	try {
		const u = await requireUser(),
			url = new URL(req.url),
			type = url.searchParams.get('type') || '',
			id = url.searchParams.get('id') || ''
		await attachmentTarget(u, type, id)
		const rows = await db.attachment.findMany({
			where: { schoolId: u.schoolId, targetType: type, targetId: id },
			orderBy: { createdAt: 'desc' },
			select: {
				id: true,
				originalName: true,
				mime: true,
				size: true,
				createdAt: true,
			},
		})
		return Response.json(rows, { headers: { 'Cache-Control': 'no-store' } })
	} catch (e: any) {
		return Response.json({ error: e.message }, { status: 403 })
	}
}
export async function POST(req: Request) {
	let saved: string | undefined
	try {
		checkOrigin(req)
		const u = await requireUser()
		canWrite(u)
		const form = await req.formData(),
			type = String(form.get('type')),
			id = String(form.get('id'))
		const target = await attachmentTarget(u, type, id)
		const file = form.get('file')
		if (
			!(file instanceof File) ||
			file.size === 0 ||
			file.size > 10 * 1024 * 1024
		)
			throw new Error('Выберите PNG, JPEG или PDF до 10 МБ')
		const b = Buffer.from(await file.arrayBuffer())
		let mime = '',
			ext = ''
		if (
			b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
		) {
			mime = 'image/png'
			ext = 'png'
		} else if (b[0] === 255 && b[1] === 216 && b[2] === 255) {
			mime = 'image/jpeg'
			ext = 'jpg'
		} else if (b.subarray(0, 5).toString() === '%PDF-') {
			mime = 'application/pdf'
			ext = 'pdf'
		} else throw new Error('Разрешены только PNG, JPEG и PDF')
		const storageKey = randomUUID() + '.' + ext,
			dir = path.join(
				process.env.DATA_DIR || './data',
				u.schoolId,
				'attachments',
			)
		await mkdir(dir, { recursive: true })
		saved = path.join(dir, storageKey)
		await writeFile(saved, b, { flag: 'wx' })
		const row = await db.$transaction(async (tx) => {
			const a = await tx.attachment.create({
				data: {
					schoolId: u.schoolId,
					targetType: type,
					targetId: id,
					storageKey,
					mime,
					size: b.length,
					originalName: file.name.replace(/[\/\r\n]/g, '_').slice(0, 200),
					createdBy: u.id,
				},
			})
			await tx.audit.create({
				data: {
					schoolId: u.schoolId,
					scope: target.scope,
					userId: u.id,
					action: 'Загрузка вложения',
					entityId: id,
					details: { attachmentId: a.id, name: a.originalName },
				},
			})
			return a
		})
		saved = undefined
		return Response.json({ id: row.id })
	} catch (e: any) {
		if (saved) await unlink(saved).catch(() => {})
		return Response.json({ error: e.message }, { status: 400 })
	}
}
