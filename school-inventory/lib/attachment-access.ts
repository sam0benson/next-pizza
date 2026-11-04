import { scopeWhere } from './auth'
import { db } from './db'
export async function attachmentTarget(
	u: { schoolId: string; role: string; scope: string },
	type: string,
	id: string,
) {
	const where = { id, schoolId: u.schoolId, ...scopeWhere(u) }
	const target =
		type === 'asset'
			? await db.asset.findFirst({ where })
			: type === 'document'
				? await db.document.findFirst({ where })
				: null
	if (!target) throw new Error('Объект не найден или недоступен')
	return target
}
