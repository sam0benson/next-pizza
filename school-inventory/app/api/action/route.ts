import { canWrite, checkOrigin, requireUser, scopeWhere } from '@/lib/auth'
import { db } from '@/lib/db'
import { extraAction } from '@/lib/extras'
import { ensurePasskeySchema } from '@/lib/passkey'
import { newQrCode } from '@/lib/qr'
import { parseRegions, uniqueLines } from '@/lib/rules'
import { normalizeCode } from '@/lib/security'
import { Prisma } from '@prisma/client'
import { hash } from 'bcryptjs'
import { z } from 'zod'
const text = z.string().trim().min(1).max(300)
const money = z.coerce.number().finite().min(0).max(999999999)
const quantity = z.coerce
	.number()
	.finite()
	.positive()
	.max(999999999)
	.refine(
		(n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.0001,
		'Не более 3 знаков после запятой',
	)
export async function POST(req: Request) {
	try {
		checkOrigin(req)
		await ensurePasskeySchema()
		const u = await requireUser()
		canWrite(u)
		const { action, data: d } = await req.json()
		const where = { schoolId: u.schoolId, ...scopeWhere(u) }
		const result = await db.$transaction(
			async (tx) => {
				const audit = async (
					action: string,
					id: string,
					details: any,
					scope = u.scope,
				) =>
					tx.audit.create({
						data: {
							schoolId: u.schoolId,
							scope,
							userId: u.id,
							action,
							entityId: id,
							details,
						},
					})
				const scope = (s: string) =>
					u.role === 'ADMIN' || u.scope === 'ALL'
						? z.enum(['IT', 'HOUSEHOLD']).parse(s)
						: u.scope
				const location = async (id: string) => {
					if (
						!(await tx.location.findFirst({
							where: { id, schoolId: u.schoolId },
						}))
					)
						throw new Error('Помещение не найдено')
				}
				const asset = async (id: string) => {
					const a = await tx.asset.findFirst({ where: { id, ...where } })
					if (!a) throw new Error('Объект не найден')
					return a
				}
				if (action === 'location') {
					if (u.role !== 'ADMIN')
						throw new Error('Настройка помещений доступна администратору')
					const data = {
						name: text.parse(d.name),
						building: text.parse(d.building),
						floor: text.parse(d.floor),
						zone: String(d.zone || '').slice(0, 200),
						responsible: String(d.responsible || '').slice(0, 200),
					}
					if (d.id) {
						const old = await tx.location.findFirst({
							where: { id: d.id, schoolId: u.schoolId },
						})
						if (!old) throw new Error('Не найдено')
						await tx.location.update({ where: { id: d.id }, data })
						await audit(action, d.id, { before: old, after: data })
						return { id: d.id }
					}
					const r = await tx.location.create({
						data: { ...data, schoolId: u.schoolId },
					})
					await audit(action, r.id, data)
					return r
				}
				if (action === 'asset') {
					await location(d.locationId)
					const data = {
						inventory: text.parse(d.inventory),
						name: text.parse(d.name),
						category: text.parse(d.category),
						scope: scope(d.scope),
						serial: String(d.serial || '').slice(0, 300),
						locationId: d.locationId,
						responsible: String(d.responsible || '').slice(0, 300),
						condition: text.parse(d.condition || 'Исправно'),
						cost: money.parse(d.cost),
						acquired: z.coerce.date().parse(d.acquired || new Date()),
						notes: String(d.notes || '').slice(0, 10000),
						fields: z
							.record(
								z.union([
									z.string().max(2000),
									z.number().finite(),
									z.boolean(),
								]),
							)
							.parse(d.fields || {}),
					}
					if (d.id) {
						const old = await asset(d.id)
						if (old.scope !== data.scope)
							throw new Error('Направление существующего объекта не меняется')
						if (old.status !== 'ACTIVE')
							throw new Error('Архивная карточка не редактируется')
						if (old.locationId !== data.locationId)
							throw new Error('Используйте операцию перемещения')
						await tx.asset.update({ where: { id: d.id }, data })
						await audit(
							action,
							d.id,
							{ before: JSON.parse(JSON.stringify(old)), after: data },
							data.scope,
						)
						return { id: d.id }
					}
					const r = await tx.asset.create({
						data: { ...data, schoolId: u.schoolId },
					})
					await audit(action, r.id, data, r.scope)
					return r
				}
				if (action === 'move') {
					if (
						await tx.loan.findFirst({
							where: { assetId: d.id, schoolId: u.schoolId, closedAt: null },
						})
					)
						throw new Error('Сначала оформите возврат выданного имущества')
					const a = await asset(d.id)
					if (a.status !== 'ACTIVE') throw new Error('Объект списан')
					await location(d.locationId)
					await tx.asset.update({
						where: { id: a.id },
						data: {
							locationId: d.locationId,
							responsible: String(d.responsible ?? a.responsible),
						},
					})
					await audit(
						'Перемещение',
						a.id,
						{
							from: a.locationId,
							to: d.locationId,
							reason: text.parse(d.reason),
							responsible: d.responsible || a.responsible,
						},
						a.scope,
					)
					return { ok: true }
				}
				if (action === 'material') {
					const data = {
						name: text.parse(d.name),
						category: text.parse(d.category || 'Материалы'),
						scope: scope(d.scope),
						unit: text.parse(d.unit || 'шт.'),
						minimum: money.parse(d.minimum || 0),
					}
					if (d.id) {
						const old = await tx.material.findFirst({
							where: { id: d.id, ...where },
						})
						if (!old) throw new Error('Не найдено')
						if (old.scope !== data.scope)
							throw new Error('Направление существующего материала не меняется')
						await tx.material.update({ where: { id: d.id }, data })
						await audit(action, d.id, data, data.scope)
						return { id: d.id }
					}
					const m = await tx.material.create({
						data: { schoolId: u.schoolId, ...data },
					})
					await audit(action, m.id, data, m.scope)
					return m
				}
				if (action === 'receive') {
					const m = await tx.material.findFirst({
						where: { id: d.materialId, ...where },
					})
					if (!m) throw new Error('Материал не найден')
					await location(d.locationId)
					const lot = await tx.lot.create({
						data: {
							schoolId: u.schoolId,
							materialId: m.id,
							locationId: d.locationId,
							quantity: quantity.parse(d.quantity),
							price: money.parse(d.price),
						},
					})
					await audit(
						'Приход материала',
						m.id,
						JSON.parse(JSON.stringify(lot)),
						m.scope,
					)
					return lot
				}
				if (action === 'transferLot') {
					const lot = await tx.lot.findFirst({
						where: { id: d.id, schoolId: u.schoolId },
					})
					if (!lot) throw new Error('Партия не найдена')
					const m = await tx.material.findFirst({
						where: { id: lot.materialId, ...where },
					})
					if (!m) throw new Error('Нет доступа')
					await location(d.locationId)
					if (lot.locationId === d.locationId)
						throw new Error('Выберите другое помещение')
					const q = new Prisma.Decimal(quantity.parse(d.quantity))
					if (lot.quantity.lessThan(q)) throw new Error('Недостаточный остаток')
					await tx.lot.update({
						where: { id: lot.id },
						data: { quantity: { decrement: q } },
					})
					await tx.lot.create({
						data: {
							schoolId: u.schoolId,
							materialId: m.id,
							locationId: d.locationId,
							quantity: q,
							price: lot.price,
							received: lot.received,
						},
					})
					await audit(
						'Перемещение материала',
						m.id,
						{
							lot: lot.id,
							from: lot.locationId,
							to: d.locationId,
							quantity: q.toString(),
							reason: text.parse(d.reason),
						},
						m.scope,
					)
					return { ok: true }
				}
				if (action === 'document') {
					const kind = z
						.enum(['ASSET_WRITE_OFF', 'MATERIAL_WRITE_OFF'])
						.parse(d.kind)
					uniqueLines(d.lines)
					const lines: any[] = []
					let docScope = ''
					for (const l of d.lines) {
						if (kind === 'ASSET_WRITE_OFF') {
							const a = await asset(l.id)
							if (
								await tx.loan.findFirst({
									where: {
										assetId: a.id,
										schoolId: u.schoolId,
										closedAt: null,
									},
								})
							)
								throw new Error('Сначала оформите возврат выданного имущества')
							if (a.status !== 'ACTIVE') throw new Error('Объект уже списан')
							if (docScope && docScope !== a.scope)
								throw new Error('Разделите направления на разные акты')
							docScope = a.scope
							lines.push({
								id: a.id,
								name: a.name,
								inventory: a.inventory,
								quantity: 1,
								cost: a.cost.toString(),
								locationId: a.locationId,
							})
						} else {
							const lot = await tx.lot.findFirst({
								where: { id: l.id, schoolId: u.schoolId },
							})
							if (!lot) throw new Error('Нет партии')
							const m = await tx.material.findFirst({
								where: { id: lot.materialId, ...where },
							})
							if (!m) throw new Error('Нет доступа')
							if (docScope && docScope !== m.scope)
								throw new Error('Разделите направления')
							docScope = m.scope
							const q = quantity.parse(l.quantity)
							if (lot.quantity.lessThan(q))
								throw new Error('Недостаточный остаток')
							lines.push({
								id: lot.id,
								materialId: m.id,
								name: m.name,
								unit: m.unit,
								quantity: q,
								cost: lot.price.toString(),
								locationId: lot.locationId,
							})
						}
					}
					const doc = await tx.document.create({
						data: {
							schoolId: u.schoolId,
							scope: docScope,
							kind,
							number: text.parse(d.number),
							date: z.coerce.date().parse(d.date),
							reason: text.parse(d.reason),
							commission: String(d.commission || '').slice(0, 3000),
							lines,
							createdBy: u.id,
						},
					})
					await audit(
						'Черновик списания',
						doc.id,
						{ number: doc.number },
						docScope,
					)
					return doc
				}
				if (action === 'postDocument' || action === 'cancelDocument') {
					const doc = await tx.document.findFirst({
						where: { id: d.id, ...where },
					})
					if (!doc) throw new Error('Документ не найден')
					if (action === 'cancelDocument') {
						if (doc.status === 'CANCELLED') throw new Error('Уже отменён')
						if (doc.status === 'POSTED') {
							if (u.role !== 'ADMIN')
								throw new Error('Отмена проведения доступна администратору')
							text.parse(d.reason)
							for (const l of doc.lines as any[]) {
								if (doc.kind === 'ASSET_WRITE_OFF')
									await tx.asset.update({
										where: { id: l.id },
										data: { status: 'ACTIVE' },
									})
								else
									await tx.lot.update({
										where: { id: l.id },
										data: { quantity: { increment: l.quantity } },
									})
							}
						}
						await tx.document.update({
							where: { id: doc.id },
							data: { status: 'CANCELLED' },
						})
						await audit(
							'Отмена документа',
							doc.id,
							{ reason: d.reason || 'Отмена черновика' },
							doc.scope,
						)
						return { ok: true }
					}
					if (doc.status !== 'DRAFT') throw new Error('Документ уже обработан')
					for (const l of doc.lines as any[]) {
						if (doc.kind === 'ASSET_WRITE_OFF') {
							const a = await asset(l.id)
							if (
								await tx.loan.findFirst({
									where: {
										assetId: a.id,
										schoolId: u.schoolId,
										closedAt: null,
									},
								})
							)
								throw new Error('Сначала оформите возврат выданного имущества')
							if (a.status !== 'ACTIVE') throw new Error('Объект уже списан')
							if (
								a.scope !== doc.scope ||
								a.cost.toString() !== l.cost ||
								a.locationId !== l.locationId ||
								a.name !== l.name ||
								a.inventory !== l.inventory
							)
								throw new Error('Карточка изменилась. Создайте новый акт.')
							await tx.asset.update({
								where: { id: a.id },
								data: { status: 'WRITTEN_OFF' },
							})
							await audit(
								'Списание имущества',
								a.id,
								{ documentId: doc.id },
								a.scope,
							)
						} else {
							const lot = await tx.lot.findFirst({
								where: { id: l.id, schoolId: u.schoolId },
							})
							if (!lot || lot.quantity.lessThan(l.quantity))
								throw new Error('Недостаточный остаток партии')
							await tx.lot.update({
								where: { id: l.id },
								data: { quantity: { decrement: l.quantity } },
							})
							await audit(
								'Списание материала',
								l.materialId,
								{ documentId: doc.id, quantity: l.quantity, lot: l.id },
								doc.scope,
							)
						}
					}
					await tx.document.update({
						where: { id: doc.id },
						data: { status: 'POSTED', postedAt: new Date() },
					})
					await audit(
						'Проведение документа',
						doc.id,
						{ number: doc.number },
						doc.scope,
					)
					return { ok: true }
				}
				if (action === 'stocktake') {
					const s = scope(d.scope)
					const items = await tx.asset.findMany({
						where: {
							...where,
							scope: s,
							status: 'ACTIVE',
							...(d.locationId ? { locationId: d.locationId } : {}),
						},
					})
					const st = await tx.stocktake.create({
						data: {
							schoolId: u.schoolId,
							scope: s,
							name: text.parse(d.name),
							snapshot: items.map((a) => ({
								id: a.id,
								inventory: a.inventory,
								name: a.name,
								locationId: a.locationId,
							})),
						},
					})
					await audit(action, st.id, { count: items.length }, s)
					return st
				}
				if (action === 'check' || action === 'closeStocktake') {
					const st = await tx.stocktake.findFirst({
						where: { id: d.id, ...where },
					})
					if (!st || st.status !== 'OPEN')
						throw new Error('Проверка закрыта или не найдена')
					if (action === 'closeStocktake') {
						await tx.stocktake.update({
							where: { id: st.id },
							data: { status: 'CLOSED', closedAt: new Date() },
						})
						await audit(action, st.id, {}, st.scope)
						return { ok: true }
					}
					if (!(st.snapshot as any[]).some((a) => a.id === d.assetId))
						throw new Error('Объект вне проверки')
					await location(d.locationId)
					const results = {
						...(st.results as object),
						[d.assetId]: {
							locationId: d.locationId,
							at: new Date().toISOString(),
							userId: u.id,
						},
					}
					await tx.stocktake.update({ where: { id: st.id }, data: { results } })
					await audit(
						'Проверка наличия',
						st.id,
						{ assetId: d.assetId, locationId: d.locationId },
						st.scope,
					)
					return { ok: true }
				}
				if (action === 'missing') {
					const st = await tx.stocktake.findFirst({
						where: { id: d.id, ...where },
					})
					if (!st || st.status !== 'OPEN')
						throw new Error('Проверка закрыта или не найдена')
					if (!(st.snapshot as any[]).some((a) => a.id === d.assetId))
						throw new Error('Объект вне проверки')
					const results = {
						...(st.results as object),
						[d.assetId]: {
							status: 'MISSING',
							at: new Date().toISOString(),
							userId: u.id,
						},
					}
					await tx.stocktake.update({ where: { id: st.id }, data: { results } })
					await audit(
						'Не найден при проверке',
						st.id,
						{ assetId: d.assetId },
						st.scope,
					)
					return { ok: true }
				}
				if (action === 'settings') {
					if (u.role !== 'ADMIN') throw new Error('Нет прав')
					const settings = z
						.object({
							categories: z.array(text).min(1).max(100),
							fields: z
								.array(
									z.object({
										name: text,
										type: z.enum(['text', 'number', 'date', 'checkbox']),
									}),
								)
								.max(100),
						})
						.parse(d.settings)
					if (
						new Set(settings.fields.map((f) => f.name)).size !==
						settings.fields.length
					)
						throw new Error('Названия полей должны быть уникальными')
					await tx.school.update({
						where: { id: u.schoolId },
						data: { name: text.parse(d.name), settings },
					})
					await audit(action, u.schoolId, d)
					return { ok: true }
				}
				if (action === 'user') {
					if (u.role !== 'ADMIN') throw new Error('Нет прав')
					const data = {
						name: text.parse(d.name),
						email: z.string().email().parse(d.email).toLowerCase(),
						role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).parse(d.role),
						scope: z.enum(['ALL', 'IT', 'HOUSEHOLD']).parse(d.scope),
						active: d.active !== false,
					}
					if (d.id === u.id && (data.role !== 'ADMIN' || !data.active))
						throw new Error(
							'Нельзя отключить собственный доступ администратора',
						)
					const password = d.password
						? await hash(z.string().min(14).max(128).parse(d.password), 12)
						: undefined
					if (d.id) {
						if (
							!(await tx.user.findFirst({
								where: { id: d.id, schoolId: u.schoolId },
							}))
						)
							throw new Error('Нет пользователя')
						await tx.user.update({
							where: { id: d.id },
							data: { ...data, ...(password ? { password } : {}) },
						})
						await tx.session.deleteMany({ where: { userId: d.id } })
						await audit(action, d.id, data)
						return { ok: true }
					}
					if (!password) throw new Error('Задайте пароль')
					const r = await tx.user.create({
						data: { ...data, password, schoolId: u.schoolId },
					})
					await audit(action, r.id, data)
					return { id: r.id }
				}
				if (action === 'plan') {
					if (u.role !== 'ADMIN') throw new Error('Нет прав')
					const old = await tx.floorPlan.findFirst({
						where: { id: d.id, schoolId: u.schoolId },
					})
					if (!old) throw new Error('План не найден')
					const ids = new Set(
						(
							await tx.location.findMany({ where: { schoolId: u.schoolId } })
						).map((l) => l.id),
					)
					const regions = parseRegions(d.regions, ids)
					await tx.floorPlan.update({
						where: { id: old.id },
						data: { name: text.parse(d.name), regions },
					})
					await audit(action, old.id, { regions })
					return { ok: true }
				}
				if (
					['approveDevice', 'revokeDevice', 'deleteDevice'].includes(action)
				) {
					if (u.role !== 'ADMIN') throw new Error('Нет прав')
					const dev = await tx.device.findFirst({
						where: { id: text.parse(d.id), schoolId: u.schoolId },
					})
					if (!dev) throw new Error('Устройство не найдено')
					if (action === 'approveDevice') {
						if (dev.status !== 'PENDING')
							throw new Error('Заявка уже обработана')
						if (normalizeCode(d.code) !== normalizeCode(dev.code))
							throw new Error(
								'Код не совпадает. Сверьте код на экране устройства пользователя',
							)
						await tx.device.update({
							where: { id: dev.id },
							data: {
								status: 'APPROVED',
								approvedAt: new Date(),
								approvedBy: u.id,
							},
						})
					} else {
						if (dev.userId === u.id && dev.status === 'APPROVED') {
							const mine = await tx.device.count({
								where: { userId: u.id, status: 'APPROVED' },
							})
							if (mine <= 1)
								throw new Error(
									'Нельзя отключить последнее доверенное устройство администратора',
								)
						}
						await tx.session.deleteMany({ where: { deviceId: dev.id } })
						await tx.passkey.deleteMany({ where: { deviceId: dev.id } })
						if (action === 'revokeDevice')
							await tx.device.update({
								where: { id: dev.id },
								data: { status: 'REVOKED', ticketHash: null },
							})
						else await tx.device.delete({ where: { id: dev.id } })
					}
					await audit(action, dev.id, {
						userId: dev.userId,
						name: dev.name,
						ip: dev.ip,
					}, 'ALL')
					return { ok: true }
				}
				if (action === 'resetTotp') {
					if (u.role !== 'ADMIN') throw new Error('Нет прав')
					const target = await tx.user.findFirst({
						where: { id: text.parse(d.id), schoolId: u.schoolId },
					})
					if (!target) throw new Error('Нет пользователя')
					await tx.user.update({
						where: { id: target.id },
						data: {
							totpEnabled: false,
							totpSecret: null,
							totpPending: null,
							totpLastStep: null,
						},
					})
					await tx.session.deleteMany({ where: { userId: target.id } })
					await audit(action, target.id, {}, 'ALL')
					return { ok: true }
				}
				if (action === 'reissueQr') {
					const ids = z.array(text).min(1).max(100).parse(d.ids)
					for (const id of ids) {
						const a = await asset(id)
						await tx.asset.update({
							where: { id: a.id },
							data: { qrCode: newQrCode() },
						})
						await audit('QR перевыпущен', a.id, {}, a.scope)
					}
					return { ok: true }
				}
				const extra = await extraAction(tx, u, action, d)
				if (extra !== undefined) return extra
				throw new Error('Неизвестная операция')
			},
			{
				isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
				timeout: 20000,
			},
		)
		return Response.json(result)
	} catch (e: any) {
		const message =
			e.code === 'P2002'
				? 'Такой инвентарный номер или email уже существует'
				: e.code === 'P2034'
					? 'Данные изменились параллельно. Повторите операцию'
					: e instanceof z.ZodError
						? e.issues.map((i) => i.message).join('; ')
						: e.message || 'Ошибка операции'
		return Response.json(
			{ error: message },
			{ status: message === 'UNAUTHORIZED' ? 401 : 400 },
		)
	}
}
