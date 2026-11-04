'use client'
import { useState } from 'react'
const fields: Record<string, string> = {
	inventory: 'Инвентарный номер *',
	name: 'Название *',
	category: 'Категория *',
	location: 'Помещение *',
	cost: 'Стоимость *',
	scope: 'Направление (IT/HOUSEHOLD)',
	serial: 'Серийный номер',
	responsible: 'Ответственный',
}
export default function ExcelImport({ reload }: { reload: any }) {
	const [file, setFile] = useState<File | null>(null),
		[sheet, setSheet] = useState('0'),
		[header, setHeader] = useState('1'),
		[info, setInfo] = useState<any>(null),
		[mapping, setMapping] = useState<any>({}),
		[preview, setPreview] = useState<any>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState('')
	async function run(mode: string) {
		if (!file) return
		setBusy(true)
		setError('')
		try {
			const f = new FormData()
			f.set('file', file)
			f.set('mode', mode)
			f.set('sheet', sheet)
			f.set('header', header)
			f.set('mapping', JSON.stringify(mapping))
			const r = await fetch('/api/excel', { method: 'POST', body: f }),
				j = await r.json()
			if (!r.ok) throw new Error(j.error)
			if (mode === 'inspect') {
				setInfo(j)
				setPreview(null)
			} else if (mode === 'preview') setPreview(j)
			else {
				alert(`Импортировано: ${j.count}`)
				setPreview(null)
				await reload()
			}
		} catch (e: any) {
			setError(e.message)
		} finally {
			setBusy(false)
		}
	}
	return (
		<div className='card'>
			<h2>Импорт XLSX</h2>
			<p>
				Импорт добавляет новые карточки имущества. Существующие записи не
				перезаписываются. Помещения должны уже существовать и иметь однозначные
				названия.
			</p>
			<input
				type='file'
				accept='.xlsx'
				onChange={(e) => {
					setFile(e.target.files?.[0] || null)
					setInfo(null)
					setPreview(null)
				}}
			/>
			{info && (
				<select
					value={sheet}
					onChange={(e) => {
						setSheet(e.target.value)
						setPreview(null)
						setInfo(null)
					}}
				>
					{info.sheets.map((s: string, i: number) => (
						<option value={i} key={i}>
							{s}
						</option>
					))}
				</select>
			)}
			<label>
				Строка заголовков
				<input
					type='number'
					min='1'
					value={header}
					onChange={(e) => {
						setHeader(e.target.value)
						setPreview(null)
					}}
				/>
			</label>
			<button disabled={busy || !file} onClick={() => run('inspect')}>
				Прочитать заголовки
			</button>
			{info && (
				<>
					<div className='formgrid'>
						{Object.entries(fields).map(([key, label]) => (
							<label key={key}>
								{label}
								<select
									value={mapping[key] ?? ''}
									onChange={(e) => {
										setMapping({ ...mapping, [key]: e.target.value })
										setPreview(null)
									}}
								>
									<option value=''>Не выбрано</option>
									{info.headers.map((h: string, i: number) => (
										<option value={i} key={i}>
											{i + 1}. {h}
										</option>
									))}
								</select>
							</label>
						))}
					</div>
					<button disabled={busy} onClick={() => run('preview')}>
						Проверить импорт
					</button>
				</>
			)}
			{preview && (
				<>
					<p>
						Готово к загрузке: {preview.count}. Ошибок: {preview.errors.length}
					</p>
					<pre>
						{preview.errors.join('\n') || JSON.stringify(preview.rows, null, 2)}
					</pre>
					<button
						disabled={busy || preview.errors.length > 0 || preview.count === 0}
						onClick={() => run('commit')}
					>
						Подтвердить импорт
					</button>
				</>
			)}
			{error && <p className='error'>{error}</p>}
		</div>
	)
}
