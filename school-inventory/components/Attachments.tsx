'use client'
import { useEffect, useState } from 'react'
export default function Attachments({
	type,
	id,
	write,
}: {
	type: 'asset' | 'document'
	id: string
	write: boolean
}) {
	const [rows, setRows] = useState<any[]>([]),
		[error, setError] = useState(''),
		[busy, setBusy] = useState(false)
	async function load() {
		const r = await fetch(
				`/api/attachments?type=${type}&id=${encodeURIComponent(id)}`,
			),
			j = await r.json()
		if (!r.ok) throw new Error(j.error)
		setRows(j)
	}
	useEffect(() => {
		setRows([])
		setError('')
		load().catch((e) => setError(e.message))
	}, [type, id])
	return (
		<section className='card'>
			<h3>
				{type === 'asset'
					? 'Фото и документы'
					: 'Подписанные акты и приложения'}
			</h3>
			{error && <p className='error'>{error}</p>}
			{write && (
				<form
					className='toolbar'
					onSubmit={async (e) => {
						e.preventDefault()
						const form = e.currentTarget,
							f = new FormData(form)
						f.set('type', type)
						f.set('id', id)
						setBusy(true)
						setError('')
						try {
							const r = await fetch('/api/attachments', {
									method: 'POST',
									body: f,
								}),
								j = await r.json()
							if (!r.ok) throw new Error(j.error)
							await load()
							form.reset()
						} catch (e: any) {
							setError(e.message)
						} finally {
							setBusy(false)
						}
					}}
				>
					<input
						name='file'
						type='file'
						accept='image/png,image/jpeg,application/pdf'
						required
					/>
					<button disabled={busy}>{busy ? 'Загрузка…' : 'Прикрепить'}</button>
				</form>
			)}
			<p className='muted'>
				PNG, JPEG, PDF до 10 МБ. PDF скачивается, а не выполняется внутри
				страницы. Проверяйте файлы антивирусом.
			</p>
			<div className='attachment-grid'>
				{rows.map((a) => (
					<a
						className='attachment'
						key={a.id}
						href={`/api/attachments/${a.id}`}
					>
						{a.mime.startsWith('image/') && (
							<img
								src={`/api/attachments/${a.id}?preview=1`}
								alt={a.originalName}
							/>
						)}
						<span>{a.originalName}</span>
						<small>
							{Math.ceil(a.size / 1024)} КБ ·{' '}
							{new Date(a.createdAt).toLocaleDateString('ru-RU')}
						</small>
					</a>
				))}
			</div>
		</section>
	)
}
