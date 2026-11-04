'use client'
import { useEffect } from 'react'
/**
 * Регистрация service worker и «нативное» поведение PWA:
 * — запрет масштабирования страницы жестами (pinch, double-tap, ctrl+колесо в режиме приложения);
 * — карта школы (.map-viewport) масштабируется своими обработчиками.
 */
export default function PwaRegister() {
	useEffect(() => {
		if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator)
			navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
		const standalone =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as any).standalone === true
		document.documentElement.classList.toggle('standalone', standalone)
		const inMap = (t: EventTarget | null) =>
			t instanceof Element && !!t.closest('.map-viewport')
		// iOS Safari игнорирует user-scalable=no, поэтому гасим жесты вручную
		const gesture = (e: Event) => e.preventDefault()
		const touchMove = (e: TouchEvent) => {
			if (e.touches.length > 1 && !inMap(e.target)) e.preventDefault()
		}
		// двойной тап отключён через CSS touch-action: manipulation
		const wheel = (e: WheelEvent) => {
			if (e.ctrlKey && standalone && !inMap(e.target)) e.preventDefault()
		}
		const keys = (e: KeyboardEvent) => {
			if (
				standalone &&
				(e.ctrlKey || e.metaKey) &&
				['+', '-', '=', '0'].includes(e.key)
			)
				e.preventDefault()
		}
		document.addEventListener('gesturestart', gesture, { passive: false })
		document.addEventListener('gesturechange', gesture, { passive: false })
		document.addEventListener('touchmove', touchMove, { passive: false })
		document.addEventListener('wheel', wheel, { passive: false })
		document.addEventListener('keydown', keys)
		return () => {
			document.removeEventListener('gesturestart', gesture)
			document.removeEventListener('gesturechange', gesture)
			document.removeEventListener('touchmove', touchMove)
			document.removeEventListener('wheel', wheel)
			document.removeEventListener('keydown', keys)
		}
	}, [])
	return null
}
