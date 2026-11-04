import { attachmentTarget } from '@/lib/attachment-access'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
export async function GET(
	req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const u = await requireUser(),
			{ id } = await params,
			a = await db.attachment.findFirst({ where: { id, schoolId: u.schoolId } })
		if (!a) return new Response(null, { status: 404 })
		await attachmentTarget(u, a.targetType, a.targetId)
		const b = await readFile(
			path.join(
				process.env.DATA_DIR || './data',
				u.schoolId,
				'attachments',
				a.storageKey,
			),
		)
		const inline =
			new URL(req.url).searchParams.get('preview') === '1' &&
			a.mime.startsWith('image/')
		return new Response(new Uint8Array(b), {
			headers: {
				'Content-Type': a.mime,
				'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.originalName).replace(/'/g, '%27')}`,
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff',
				'Content-Security-Policy': "default-src 'none'; sandbox",
			},
		})
	} catch {
		return new Response(null, { status: 403 })
	}
}
