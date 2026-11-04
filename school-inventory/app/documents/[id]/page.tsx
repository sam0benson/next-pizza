import Attachments from '@/components/Attachments'
import PrintButton from '@/components/PrintButton'
import { requireUser, scopeWhere } from '@/lib/auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { notFound } from 'next/navigation'
export const dynamic = 'force-dynamic'
export default async function DocumentPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const u = await requireUser(),
		{ id } = await params,
		doc = await db.document.findFirst({
			where: { id, schoolId: u.schoolId, ...scopeWhere(u) },
		})
	if (!doc) notFound()
	const school = await db.school.findUnique({ where: { id: u.schoolId } }),
		lines = doc.lines as any[]
	const total = lines.reduce(
		(s, l) => s.plus(new Prisma.Decimal(l.cost).times(l.quantity)),
		new Prisma.Decimal(0),
	)
	return (
		<article className='printdoc'>
			<PrintButton />
			<p>{school?.name}</p>
			<h1>
				Акт списания{' '}
				{doc.kind === 'ASSET_WRITE_OFF' ? 'имущества' : 'материалов'}
			</h1>
			<h2>
				№ {doc.number} от {doc.date.toLocaleDateString('ru-RU')}
			</h2>
			<p>
				Статус:{' '}
				{doc.status === 'POSTED'
					? 'Проведён'
					: doc.status === 'DRAFT'
						? 'ЧЕРНОВИК — НЕ ПРОВЕДЁН'
						: 'ОТМЕНЁН'}
			</p>
			<p>Основание: {doc.reason}</p>
			<p>Комиссия: {doc.commission || '________________________________'}</p>
			<table>
				<thead>
					<tr>
						<th>№</th>
						<th>Наименование</th>
						<th>Инв. номер</th>
						<th>Количество</th>
						<th>Цена</th>
						<th>Сумма</th>
					</tr>
				</thead>
				<tbody>
					{lines.map((l, i) => (
						<tr key={l.id}>
							<td>{i + 1}</td>
							<td>{l.name}</td>
							<td>{l.inventory || '—'}</td>
							<td>
								{l.quantity} {l.unit || 'шт.'}
							</td>
							<td>{l.cost}</td>
							<td>{new Prisma.Decimal(l.cost).times(l.quantity).toFixed(2)}</td>
						</tr>
					))}
				</tbody>
			</table>
			<h3>Итого: {total.toFixed(2)} руб.</h3>
			<div className='signatures'>
				<p>
					Председатель комиссии
					<br />
					<br />
					__________________
				</p>
				<p>
					Члены комиссии
					<br />
					<br />
					__________________
					<br />
					<br />
					__________________
				</p>
				<p>
					Ответственный
					<br />
					<br />
					__________________
				</p>
			</div>
			<p>
				Создан: {doc.createdAt.toLocaleString('ru-RU')}. Проведён:{' '}
				{doc.postedAt?.toLocaleString('ru-RU') || '—'}.
			</p>
			<small>
				Базовый внутренний шаблон. До использования в официальном учёте
				согласовать форму с бухгалтерией. Запись в системе не является
				электронной подписью.
			</small>
			<div className='no-print'>
				<Attachments type='document' id={doc.id} write={u.role !== 'VIEWER'} />
			</div>
		</article>
	)
}
