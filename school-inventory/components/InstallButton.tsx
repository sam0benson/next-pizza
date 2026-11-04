'use client'
import { useEffect, useState } from 'react'
/** Кнопка установки PWA (Android/Chrome/Edge) и подсказка для iPhone. */
export default function InstallButton() {
	const [prompt, setPrompt] = useState<any>(null),
		[ios, setIos] = useState(false)
	useEffect(() => {
		const standalone =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as any).standalone
		if (standalone) return
		setIos(/iPhone|iPad|iPod/.test(navigator.userAgent))
		const h = (e: Event) => {
			e.preventDefault()
			setPrompt(e)
		}
		addEventListener('beforeinstallprompt', h)
		return () => removeEventListener('beforeinstallprompt', h)
	}, [])
	if (prompt)
		return (
			<button
				type='button'
				className='secondary install'
				onClick={async () => {
					prompt.prompt()
					await prompt.userChoice
					setPrompt(null)
				}}
			>
				Установить приложение
			</button>
		)
	if (ios)
		return (
			<p className='muted install'>
				Чтобы установить на iPhone: «Поделиться» → «На экран „Домой“». Вход
				и подтверждение устройства выполните уже в установленном приложении.
			</p>
		)
	return null
}
