import { checkOrigin, hash } from '@/lib/auth'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'
export async function POST(req: Request) {
	checkOrigin(req)
	const c = await cookies()
	const t = c.get('inventory_session')?.value
	if (t) await db.session.deleteMany({ where: { id: hash(t) } })
	c.delete('inventory_session')
	return Response.json({ ok: true })
}
