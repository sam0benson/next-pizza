'use client'
import { useEffect, useState } from 'react'
export default function Operations({ data, act }: { data: any; act: any }) {
	const [extra, setExtra] = useState<any>({ repairs: [], loans: [], sets: [] }),
		[section, setSection] = useState('repairs'),
		[form, setForm] = useState<any>(null),
		[error, setError] = useState(''),
		[busy, setBusy] = useState(false)
	const write = data.user.role !== 'VIEWER'
	async function load() {
		const r = await fetch('/api/extras'),
			j = await r.json()
		if (!r.ok) throw new Error(j.error)
		setExtra(j)
	}
	useEffect(() => {
		load().catch((e) => setError(e.message))
	}, [])
	const asset = (id: string) => data.assets.find((a: any) => a.id === id),
		lot = (id: string) => data.lots.find((l: any) => l.id === id)
	const label = (l: any) => {
		if (l.assetId) {
			const a = asset(l.assetId)
			return a ? `${a.inventory} · ${a.name}` : 'Объект'
		}
		const p = lot(l.lotId)
		return (
			data.materials.find((m: any) => m.id === p?.materialId)?.name ||
			'Материал'
		)
	}
	async function run(action: string, d: any) {
		setBusy(true)
		setError('')
		try {
			await act(action, d)
			await load()
			setForm(null)
		} catch (e: any) {
			setError(e.message)
		} finally {
			setBusy(false)
		}
	}
	const fields = (
		name: string,
		title: string,
		type = 'text',
		required = true,
	) => (
		<label key={name}>
			{title}
			<input
				name={name}
				type={type}
				required={required}
				step={type === 'number' ? '0.001' : undefined}
				min={type === 'number' ? 0 : undefined}
				defaultValue={form?.[name] ?? ''}
			/>
		</label>
	)
	return (
		<>
			<div className='segmented'>
				{[
					['repairs', 'Ремонты'],
					['loans', 'Выдача / возврат'],
					['sets', 'Комплекты'],
					['alerts', 'Предупреждения'],
				].map(([v, l]) => (
					<button
						className={section === v ? 'active' : ''}
						key={v}
						onClick={() => setSection(v)}
					>
						{l}
					</button>
				))}
			</div>
			{error && <p className='error'>{error}</p>}
			{section === 'repairs' && (
				<>
					{write && (
						<button
							onClick={() =>
								setForm({ action: 'repair', status: 'OPEN', cost: 0 })
							}
						>
							+ Ремонт / обслуживание
						</button>
					)}
					<div className='cards'>
						{extra.repairs.map((r: any) => (
							<div className='card' key={r.id}>
								<h3>{asset(r.assetId)?.name}</h3>
								<p>{r.problem}</p>
								<span className='badge'>
									{
										(
											{
												OPEN: 'Открыт',
												IN_PROGRESS: 'В работе',
												DONE: 'Завершён',
												CANCELLED: 'Отменён',
											} as any
										)[r.status]
									}
								</span>
								<p>Исполнитель: {r.executor || '—'}</p>
								<p>Стоимость: {r.cost} ₽</p>
								<p>{r.notes}</p>
								<small>
									Создан: {new Date(r.createdAt).toLocaleString('ru-RU')}
								</small>
								{write && (
									<button
										className='secondary'
										onClick={() =>
											setForm({
												...r,
												action: 'repair',
												dueAt: r.dueAt?.slice(0, 10) || '',
											})
										}
									>
										Изменить
									</button>
								)}
							</div>
						))}
					</div>
					<p className='muted'>
						Ремонт не меняет состояние карточки автоматически: результат
						диагностики внесите отдельно.
					</p>
				</>
			)}
			{section === 'loans' && (
				<>
					{write && (
						<div className='toolbar'>
							<button
								onClick={() => setForm({ action: 'loan', kind: 'asset' })}
							>
								Выдать имущество
							</button>
							<button
								onClick={() =>
									setForm({ action: 'loan', kind: 'material', quantity: 1 })
								}
							>
								Выдать материал временно
							</button>
						</div>
					)}
					<p className='muted'>
						Выдача материалов уменьшает складской остаток, но не является
						списанием. Возврат пополняет исходную партию. Выданное имущество
						остаётся на учёте; получатель хранится в записи выдачи.
					</p>
					<div className='tablewrap'>
						<table>
							<thead>
								<tr>
									<th>Объект</th>
									<th>Получатель</th>
									<th>Выдано / возвращено</th>
									<th>Срок</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{extra.loans.map((l: any) => (
									<tr key={l.id}>
										<td>{label(l)}</td>
										<td>{l.recipient}</td>
										<td>
											{l.quantity} / {l.returned}
										</td>
										<td>
											{l.dueAt
												? new Date(l.dueAt).toLocaleDateString('ru-RU')
												: '—'}
										</td>
										<td>
											{l.closedAt
												? 'Возвращено'
												: write && (
														<button
															className='secondary'
															onClick={() =>
																setForm({
																	action: 'returnLoan',
																	id: l.id,
																	quantity:
																		Number(l.quantity) - Number(l.returned),
																})
															}
														>
															Возврат
														</button>
													)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			)}
			{section === 'sets' && (
				<>
					{write && (
						<button
							onClick={() => setForm({ action: 'assetSet', assetIds: [] })}
						>
							+ Комплект
						</button>
					)}
					<div className='cards'>
						{extra.sets.map((s: any) => (
							<div className='card' key={s.id}>
								<h3>{s.name}</h3>
								{s.assetIds.map((id: string) => (
									<p key={id}>
										{asset(id)?.inventory} · {asset(id)?.name}
									</p>
								))}
								{write && (
									<div className='toolbar'>
										<button
											className='secondary'
											onClick={() => setForm({ ...s, action: 'assetSet' })}
										>
											Изменить
										</button>
										<button
											className='secondary'
											disabled={busy}
											onClick={() => {
												if (
													confirm(
														'Расформировать комплект? Карточки имущества сохранятся.',
													)
												)
													run('deleteSet', { id: s.id })
											}}
										>
											Расформировать
										</button>
									</div>
								)}
							</div>
						))}
					</div>
				</>
			)}
			{section === 'alerts' && (
				<div className='card'>
					<h3>Просроченные возвраты</h3>
					{extra.loans
						.filter(
							(l: any) =>
								!l.closedAt && l.dueAt && new Date(l.dueAt) < new Date(),
						)
						.map((l: any) => (
							<p className='warning' key={l.id}>
								{label(l)} · {l.recipient} · срок{' '}
								{new Date(l.dueAt).toLocaleDateString('ru-RU')}
							</p>
						))}
					<h3>Просроченные ремонты</h3>
					{extra.repairs
						.filter(
							(r: any) =>
								['OPEN', 'IN_PROGRESS'].includes(r.status) &&
								r.dueAt &&
								new Date(r.dueAt) < new Date(),
						)
						.map((r: any) => (
							<p className='warning' key={r.id}>
								{asset(r.assetId)?.name}: {r.problem}
							</p>
						))}
					<h3>Низкие складские остатки</h3>
					{data.materials
						.filter(
							(m: any) =>
								data.lots
									.filter((l: any) => l.materialId === m.id)
									.reduce((s: number, l: any) => s + Number(l.quantity), 0) <
								Number(m.minimum),
						)
						.map((m: any) => (
							<p className='warning' key={m.id}>
								{m.name}
							</p>
						))}
					<p className='muted'>
						Предупреждения внутри приложения; email и push не отправляются.
					</p>
				</div>
			)}
			{form && (
				<div className='overlay'>
					<section className='dialog'>
						<h2>
							{
								(
									{
										repair: 'Ремонт / обслуживание',
										loan: 'Временная выдача',
										returnLoan: 'Возврат',
										assetSet: 'Комплект',
									} as any
								)[form.action]
							}
						</h2>
						{error && <p className='error'>{error}</p>}
						<form
							onSubmit={(e) => {
								e.preventDefault()
								const f = new FormData(e.currentTarget),
									d: any = { ...form, ...Object.fromEntries(f) }
								if (form.action === 'assetSet')
									d.assetIds = f.getAll('assetIds')
								run(form.action, d)
							}}
						>
							<div className='formgrid'>
								{(form.action === 'repair' ||
									(form.action === 'loan' && form.kind === 'asset')) && (
									<label>
										Имущество
										<select
											name='assetId'
											required
											defaultValue={form.assetId || ''}
										>
											<option value=''>Выберите объект</option>
											{data.assets
												.filter(
													(a: any) =>
														a.status === 'ACTIVE' &&
														(!form.id ||
															form.action !== 'repair' ||
															a.id === form.assetId),
												)
												.map((a: any) => (
													<option key={a.id} value={a.id}>
														{a.inventory} · {a.name}
													</option>
												))}
										</select>
									</label>
								)}
								{form.action === 'repair' && (
									<>
										{fields('problem', 'Неисправность / работа')}
										{fields('executor', 'Исполнитель', 'text', false)}
										{fields('cost', 'Стоимость', 'number')}
										<label>
											Этап
											<select name='status' defaultValue={form.status}>
												{[
													['OPEN', 'Открыт'],
													['IN_PROGRESS', 'В работе'],
													['DONE', 'Завершён'],
													['CANCELLED', 'Отменён'],
												].map(([v, l]) => (
													<option key={v} value={v}>
														{l}
													</option>
												))}
											</select>
										</label>
										{fields('dueAt', 'Плановая дата', 'date', false)}
									</>
								)}
								{form.action === 'loan' && (
									<>
										{form.kind === 'material' && (
											<>
												<label>
													Партия
													<select name='lotId' required>
														<option value=''>Выберите партию</option>
														{data.lots
															.filter((l: any) => Number(l.quantity) > 0)
															.map((l: any) => (
																<option key={l.id} value={l.id}>
																	{
																		data.materials.find(
																			(m: any) => m.id === l.materialId,
																		)?.name
																	}{' '}
																	·{' '}
																	{
																		data.locations.find(
																			(p: any) => p.id === l.locationId,
																		)?.name
																	}{' '}
																	· остаток {l.quantity} · {l.price} ₽
																</option>
															))}
													</select>
												</label>
												{fields('quantity', 'Количество', 'number')}
											</>
										)}
										{fields('recipient', 'Получатель')}
										{fields('dueAt', 'Вернуть до', 'date', false)}
									</>
								)}
								{form.action === 'returnLoan' &&
									fields('quantity', 'Количество к возврату', 'number')}
								{form.action === 'assetSet' ? (
									<>
										{fields('name', 'Название комплекта')}
										<label>
											Состав (Ctrl/Cmd — несколько)
											<select
												name='assetIds'
												multiple
												size={10}
												required
												defaultValue={form.assetIds}
											>
												{data.assets.map((a: any) => (
													<option key={a.id} value={a.id}>
														{a.inventory} · {a.name}
													</option>
												))}
											</select>
										</label>
									</>
								) : (
									fields('notes', 'Примечание', 'text', false)
								)}
							</div>
							<footer>
								<button disabled={busy}>Сохранить</button>
								<button
									className='secondary'
									type='button'
									disabled={busy}
									onClick={() => setForm(null)}
								>
									Закрыть
								</button>
							</footer>
						</form>
					</section>
				</div>
			)}
		</>
	)
}
