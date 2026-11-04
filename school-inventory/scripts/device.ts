/**
 * Управление доверенными устройствами из консоли сервера (нужно для первого входа администратора).
 *   npm run device -- list
 *   npm run device -- approve ABCD-EFGH
 *   npm run device -- revoke <id>
 */
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
async function main() {
	const [cmd, arg] = process.argv.slice(2)
	if (cmd === 'list' || !cmd) {
		const list = await db.device.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
		const users = new Map(
			(await db.user.findMany({ select: { id: true, email: true } })).map((u) => [u.id, u.email]),
		)
		for (const d of list)
			console.log(
				[d.status.padEnd(8), d.code, users.get(d.userId), d.name, d.ip, d.createdAt.toISOString(), d.id].join('  '),
			)
		if (!list.length) console.log('Устройств нет. Сначала попробуйте войти в приложение.')
		return
	}
	if (cmd === 'approve') {
		if (!arg) throw new Error('Укажите код: npm run device -- approve ABCD-EFGH')
		const pending = (await db.device.findMany({ where: { status: 'PENDING' } })).filter(
			(d) => norm(d.code) === norm(arg),
		)
		if (pending.length !== 1) throw new Error('Ожидающая заявка с таким кодом не найдена')
		await db.device.update({
			where: { id: pending[0].id },
			data: { status: 'APPROVED', approvedAt: new Date(), approvedBy: 'console' },
		})
		await db.audit.create({
			data: {
				schoolId: pending[0].schoolId,
				scope: 'ALL',
				userId: pending[0].userId,
				action: 'approveDevice (консоль)',
				entityId: pending[0].id,
				details: { name: pending[0].name, ip: pending[0].ip },
			},
		})
		console.log(`Устройство ${pending[0].name} подтверждено. Вернитесь в приложение — вход завершится автоматически.`)
		return
	}
	if (cmd === 'revoke') {
		if (!arg) throw new Error('Укажите id устройства (см. list)')
		await db.session.deleteMany({ where: { deviceId: arg } })
		await db.device.update({ where: { id: arg }, data: { status: 'REVOKED' } })
		console.log('Устройство заблокировано, его сессии завершены.')
		return
	}
	throw new Error('Команды: list | approve <код> | revoke <id>')
}
main()
	.catch((e) => {
		console.error(e.message)
		process.exitCode = 1
	})
	.finally(() => db.$disconnect())
