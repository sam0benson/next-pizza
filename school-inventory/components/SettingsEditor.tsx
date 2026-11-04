'use client'
import { useState } from 'react'
export default function SettingsEditor({
	school,
	act,
}: {
	school: any
	act: any
}) {
	const [name, setName] = useState(school.name),
		[categories, setCategories] = useState(
			(school.settings.categories || []).join('\n'),
		),
		[fields, setFields] = useState<any[]>(school.settings.fields || []),
		[busy, setBusy] = useState(false),
		[message, setMessage] = useState('')
	return (
		<form
			className='card'
			onSubmit={async (e) => {
				e.preventDefault()
				setBusy(true)
				setMessage('')
				try {
					const cats = categories
						.split('\n')
						.map((s: string) => s.trim())
						.filter(Boolean)
					if (new Set(fields.map((f) => f.name.trim())).size !== fields.length)
						throw new Error('Названия полей должны быть уникальными')
					await act('settings', {
						name,
						settings: { ...school.settings, categories: cats, fields },
					})
					setMessage('Сохранено')
				} catch (e: any) {
					setMessage(e.message)
				} finally {
					setBusy(false)
				}
			}}
		>
			<h2>Школа и справочники</h2>
			<label>
				Название школы
				<input
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
				/>
			</label>
			<label>
				Категории — по одной на строку
				<textarea
					value={categories}
					onChange={(e) => setCategories(e.target.value)}
					required
				/>
			</label>
			<h3>Дополнительные поля</h3>
			<p className='muted'>
				Имя — постоянный ключ поля. Переименование создаст новый ключ; прежние
				значения сохранятся в карточках. Удаление определения не удаляет уже
				записанные значения.
			</p>
			{fields.map((f, i) => (
				<div className='field-editor' key={i}>
					<input
						aria-label='Название поля'
						value={f.name}
						required
						onChange={(e) =>
							setFields(
								fields.map((x, j) =>
									j === i ? { ...x, name: e.target.value } : x,
								),
							)
						}
					/>
					<select
						aria-label='Тип поля'
						value={f.type}
						onChange={(e) =>
							setFields(
								fields.map((x, j) =>
									j === i ? { ...x, type: e.target.value } : x,
								),
							)
						}
					>
						{[
							['text', 'Текст'],
							['number', 'Число'],
							['date', 'Дата'],
							['checkbox', 'Да / Нет'],
						].map(([v, l]) => (
							<option key={v} value={v}>
								{l}
							</option>
						))}
					</select>
					<button
						type='button'
						className='secondary'
						onClick={() => setFields(fields.filter((_, j) => j !== i))}
					>
						Удалить поле
					</button>
				</div>
			))}
			<div className='toolbar'>
				<button
					type='button'
					className='secondary'
					onClick={() => setFields([...fields, { name: '', type: 'text' }])}
				>
					+ Поле
				</button>
				<button disabled={busy}>Сохранить настройки</button>
			</div>
			{message && <p role='status'>{message}</p>}
		</form>
	)
}
