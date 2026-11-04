import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
const db = new PrismaClient()
async function main() {
	const email = process.env.ADMIN_EMAIL,
		password = process.env.ADMIN_PASSWORD
	if (
		!email ||
		!password ||
		password.length < 14 ||
		password.startsWith('replace-')
	)
		throw new Error(
			'Задайте ADMIN_EMAIL и уникальный ADMIN_PASSWORD длиной не менее 14 символов',
		)
	const existing = await db.user.findUnique({ where: { email } })
	if (existing) {
		console.log('Администратор уже существует')
		return
	}
	const school = await db.school.create({
		data: {
			name: process.env.SCHOOL_NAME || 'Моя школа',
			settings: {
				categories: ['Компьютеры', 'Принтеры', 'Периферия', 'Мебель'],
				fields: [],
			},
		},
	})
	await db.user.create({
		data: {
			schoolId: school.id,
			email,
			name: 'Администратор',
			role: 'ADMIN',
			scope: 'ALL',
			password: await hash(password, 12),
		},
	})
	await db.location.createMany({
		data: ['Склад', 'Серверная', 'Кабинет 101'].map((name) => ({
			schoolId: school.id,
			name,
		})),
	})
	console.log('Школа и администратор созданы')
}
main().finally(() => db.$disconnect())
