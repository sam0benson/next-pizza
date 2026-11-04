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
			{ id } = await params
		const p = await db.floorPlan.findFirst({
			where: { id, schoolId: u.schoolId },
		})
		if (!p) return new Response(null, { status: 404 })
		const b = await readFile(
			path.join(process.env.DATA_DIR || './data', u.schoolId, p.image),
		)
		return new Response(new Uint8Array(b), {
			headers: {
				'Content-Type': p.image.endsWith('.png') ? 'image/png' : 'image/jpeg',
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff',
			},
		})
	} catch {
		return new Response(null, { status: 401 })
	}
}
