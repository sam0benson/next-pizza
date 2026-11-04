import { Prisma, User } from '@prisma/client'
import { z } from 'zod'
import { scopeWhere } from './auth'
const text = z.string().trim().min(1).max(500)
const optionalDate = (v: unknown) => (v ? z.coerce.date().parse(v) : null)
const qty = z.coerce
	.number()
	.finite()
	.positive()
	.max(999999999)
	.refine(
		(v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 0.00001,
		'Не более трёх десятичных знаков',
	)
export async function extraAction(
	tx: Prisma.TransactionClient,
	u: User,
	action: string,
	d: any,
) {
	const where = { schoolId: u.schoolId, ...scopeWhere(u) }
	const asset = async (id: string) => {
		const a = await tx.asset.findFirst({ where: { id, ...where } })
		if (!a) throw new Error('Объект не найден или недоступен')
		return a
	}
	const location = async (id: string) => {
		if (!(await tx.location.findFirst({ where: { id, schoolId: u.schoolId } })))
			throw new Error('Помещение не найдено')
	}
	const audit = async (name: string, id: string, details: any, scope: string) =>
		tx.audit.create({
			data: {
				schoolId: u.schoolId,
				userId: u.id,
				scope,
				action: name,
				entityId: id,
				details,
			},
		})
	if (action === 'repair') {
		const a = await asset(text.parse(d.assetId))
		if (a.status !== 'ACTIVE') throw new Error('Объект списан')
		const status = z
			.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'])
			.parse(d.status || 'OPEN')
		const values = {
			problem: text.parse(d.problem),
			executor: String(d.executor || '').slice(0, 500),
			status,
			cost: z.coerce
				.number()
				.finite()
				.min(0)
				.max(999999999)
				.parse(d.cost || 0),
			notes: String(d.notes || '').slice(0, 10000),
			dueAt: optionalDate(d.dueAt),
			completedAt: status === 'DONE' ? new Date() : null,
		}
		let r
		if (d.id) {
			const old = await tx.repair.findFirst({
				where: { id: d.id, schoolId: u.schoolId, assetId: a.id },
			})
			if (!old) throw new Error('Ремонт не найден')
			r = await tx.repair.update({ where: { id: old.id }, data: values })
		} else
			r = await tx.repair.create({
				data: { ...values, schoolId: u.schoolId, assetId: a.id },
			})
		await audit(
			'Ремонт / обслуживание',
			a.id,
			{ repairId: r.id, ...values },
			a.scope,
		)
		return r
	}
	if (action === 'loan') {
		if (Boolean(d.assetId) === Boolean(d.lotId))
			throw new Error('Выберите имущество или партию')
		let scope = '',
			quantity = new Prisma.Decimal(1)
		if (d.assetId) {
			const a = await asset(d.assetId)
			if (a.status !== 'ACTIVE') throw new Error('Объект списан')
			if (
				await tx.loan.findFirst({
					where: { schoolId: u.schoolId, assetId: a.id, closedAt: null },
				})
			)
				throw new Error('Объект уже выдан')
			scope = a.scope
		} else {
			const lot = await tx.lot.findFirst({
				where: { id: d.lotId, schoolId: u.schoolId },
			})
			if (!lot) throw new Error('Партия не найдена')
			const m = await tx.material.findFirst({
				where: { id: lot.materialId, ...where },
			})
			if (!m) throw new Error('Нет доступа')
			scope = m.scope
			quantity = new Prisma.Decimal(qty.parse(d.quantity))
			if (lot.quantity.lessThan(quantity))
				throw new Error('Недостаточный остаток')
			await tx.lot.update({
				where: { id: lot.id },
				data: { quantity: { decrement: quantity } },
			})
		}
		const r = await tx.loan.create({
			data: {
				schoolId: u.schoolId,
				assetId: d.assetId || null,
				lotId: d.lotId || null,
				recipient: text.parse(d.recipient),
				quantity,
				dueAt: optionalDate(d.dueAt),
				notes: String(d.notes || '').slice(0, 5000),
				createdBy: u.id,
			},
		})
		await audit(
			'Временная выдача',
			d.assetId || d.lotId,
			{ loanId: r.id, recipient: r.recipient, quantity: quantity.toString() },
			scope,
		)
		return r
	}
	if (action === 'returnLoan') {
		const loan = await tx.loan.findFirst({
			where: { id: d.id, schoolId: u.schoolId, closedAt: null },
		})
		if (!loan) throw new Error('Выдача закрыта или не найдена')
		const quantity = new Prisma.Decimal(qty.parse(d.quantity)),
			remaining = loan.quantity.minus(loan.returned)
		if (quantity.greaterThan(remaining))
			throw new Error('Количество больше невозвращённого остатка')
		let scope = ''
		if (loan.assetId) {
			const a = await asset(loan.assetId)
			scope = a.scope
			if (!quantity.equals(1)) throw new Error('Объект возвращается целиком')
		} else {
			const lot = await tx.lot.findFirst({
				where: { id: loan.lotId!, schoolId: u.schoolId },
			})
			if (!lot) throw new Error('Партия не найдена')
			const m = await tx.material.findFirst({
				where: { id: lot.materialId, ...where },
			})
			if (!m) throw new Error('Нет доступа')
			scope = m.scope
			await tx.lot.update({
				where: { id: lot.id },
				data: { quantity: { increment: quantity } },
			})
		}
		const returned = loan.returned.plus(quantity)
		await tx.loan.update({
			where: { id: loan.id },
			data: {
				returned,
				closedAt: returned.equals(loan.quantity) ? new Date() : null,
			},
		})
		await audit(
			'Возврат из временной выдачи',
			loan.assetId || loan.lotId!,
			{
				loanId: loan.id,
				quantity: quantity.toString(),
				note: String(d.notes || '').slice(0, 5000),
			},
			scope,
		)
		return { ok: true }
	}
	if (action === 'bulkMove') {
		const ids = z.array(text).min(1).max(300).parse(d.ids)
		if (new Set(ids).size !== ids.length)
			throw new Error('Повторяющиеся объекты')
		await location(d.locationId)
		const reason = text.parse(d.reason)
		for (const id of ids) {
			const a = await asset(id)
			if (a.status !== 'ACTIVE')
				throw new Error('Нельзя перемещать списанное имущество')
			if (
				await tx.loan.findFirst({
					where: { assetId: id, schoolId: u.schoolId, closedAt: null },
				})
			)
				throw new Error('Сначала оформите возврат выданного имущества')
			await tx.asset.update({
				where: { id },
				data: { locationId: d.locationId },
			})
			await audit(
				'Массовое перемещение',
				id,
				{ from: a.locationId, to: d.locationId, reason },
				a.scope,
			)
		}
		return { ok: true }
	}
	if (action === 'assetSet') {
		const ids = z.array(text).min(1).max(100).parse(d.assetIds)
		if (new Set(ids).size !== ids.length)
			throw new Error('Повторяющиеся объекты')
		let scope = ''
		for (const id of ids) {
			const a = await asset(id)
			if (scope && scope !== a.scope)
				throw new Error('Комплект должен относиться к одному направлению')
			scope = a.scope
		}
		const name = text.parse(d.name)
		if (d.id) {
			const old = await tx.assetSet.findFirst({
				where: { id: d.id, schoolId: u.schoolId },
			})
			if (!old) throw new Error('Комплект не найден')
			for (const id of old.assetIds as string[]) await asset(id)
			await tx.assetSet.update({
				where: { id: old.id },
				data: { name, assetIds: ids },
			})
			await audit('Изменение комплекта', old.id, { name, assetIds: ids }, scope)
			return { ok: true }
		}
		const r = await tx.assetSet.create({
			data: { schoolId: u.schoolId, name, assetIds: ids },
		})
		await audit('Создание комплекта', r.id, { name, assetIds: ids }, scope)
		return r
	}
	if (action === 'deleteSet') {
		const s = await tx.assetSet.findFirst({
			where: { id: d.id, schoolId: u.schoolId },
		})
		if (!s) throw new Error('Комплект не найден')
		let scope = ''
		for (const id of s.assetIds as string[]) scope = (await asset(id)).scope
		await tx.assetSet.delete({ where: { id: s.id } })
		await audit(
			'Расформирование комплекта',
			s.id,
			{ name: s.name, assetIds: s.assetIds },
			scope,
		)
		return { ok: true }
	}
	return undefined
}
