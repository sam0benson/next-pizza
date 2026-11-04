'use client'
import { useEffect, useState } from 'react'
export const money = (n: any) =>
	new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(
		Number(n) || 0,
	)
export const moneyShort = (n: any) => {
	const v = Number(n) || 0
	if (Math.abs(v) >= 1e6)
		return (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн ₽'
	if (Math.abs(v) >= 1e4)
		return Math.round(v / 1e3).toLocaleString('ru-RU') + ' тыс ₽'
	return money(v)
}
export const date = (v: string) => new Date(v).toLocaleString('ru-RU')
export const day = (v: string) => new Date(v).toLocaleDateString('ru-RU')
export function ago(v: string) {
	const d = new Date(v),
		s = (Date.now() - d.getTime()) / 1000
	if (s < 60) return 'только что'
	if (s < 3600) return Math.floor(s / 60) + ' мин назад'
	const today = new Date()
	const t = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
	if (d.toDateString() === today.toDateString()) return 'сегодня, ' + t
	const y = new Date(today)
	y.setDate(today.getDate() - 1)
	if (d.toDateString() === y.toDateString()) return 'вчера, ' + t
	return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + t
}
export const initials = (name = '') =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join('') || '?'
export const CONDITIONS = ['Исправно', 'Неисправно', 'Требует диагностики', 'В ремонте']
export function conditionTone(c: string) {
	if (c === 'Исправно') return 'ok'
	if (c === 'Неисправно') return 'bad'
	if (c === 'В ремонте') return 'info'
	return 'warn'
}
export const ROLE: Record<string, string> = {
	ADMIN: 'Администратор',
	OPERATOR: 'Оператор',
	VIEWER: 'Просмотр',
}
export const SCOPE: Record<string, string> = {
	ALL: 'Все направления',
	IT: 'IT — техника',
	HOUSEHOLD: 'Хозчасть',
}
export const DOC_STATUS: Record<string, [string, string]> = {
	DRAFT: ['Черновик', 'warn'],
	POSTED: ['Проведён', 'ok'],
	CANCELLED: ['Отменён', 'plain'],
}
const ACTION: Record<string, string> = {
	location: 'Помещение сохранено',
	asset: 'Карточка имущества сохранена',
	material: 'Номенклатура сохранена',
	stocktake: 'Начата инвентаризация',
	closeStocktake: 'Инвентаризация завершена',
	settings: 'Изменены настройки школы',
	user: 'Изменён пользователь',
	plan: 'Изменён план этажа',
	approveDevice: 'Устройство подтверждено',
	revokeDevice: 'Устройство заблокировано',
	resetTotp: 'Сброшена 2FA',
	passkeyAdd: 'Включён вход по Face ID',
	passkeyRemove: 'Отключён вход по Face ID',
}
export const actionLabel = (a: string) =>
	ACTION[a] || (a.startsWith('approveDevice') ? 'Устройство подтверждено' + a.slice(13) : a)
/** Текст уведомления после успешного действия. */
export const OK_TEXT: Record<string, string> = {
	location: 'Помещение сохранено',
	asset: 'Карточка сохранена',
	move: 'Объект перемещён',
	bulkMove: 'Объекты перемещены',
	material: 'Номенклатура сохранена',
	receive: 'Приход оформлен',
	transferLot: 'Материал перемещён',
	document: 'Черновик акта создан',
	postDocument: 'Акт проведён',
	cancelDocument: 'Акт отменён',
	stocktake: 'Инвентаризация начата',
	check: 'Отмечено',
	missing: 'Отмечено как не найденное',
	closeStocktake: 'Инвентаризация завершена',
	settings: 'Настройки сохранены',
	user: 'Пользователь сохранён',
	plan: 'План сохранён',
	approveDevice: 'Устройство подтверждено',
	revokeDevice: 'Устройство заблокировано',
	resetTotp: '2FA сброшена',
	reissueQr: 'QR-код перевыпущен',
	repair: 'Заявка сохранена',
	loan: 'Выдача оформлена',
	returnLoan: 'Возврат оформлен',
	assetSet: 'Комплект сохранён',
	deleteSet: 'Комплект расформирован',
}
export function useMedia(query: string) {
	const [m, setM] = useState(false)
	useEffect(() => {
		const q = matchMedia(query)
		setM(q.matches)
		const f = () => setM(q.matches)
		q.addEventListener('change', f)
		return () => q.removeEventListener('change', f)
	}, [query])
	return m
}
export type Theme = 'auto' | 'light' | 'dark'
export function useTheme(): [Theme, (t: Theme) => void] {
	const [t, setT] = useState<Theme>('auto')
	useEffect(() => {
		const s = localStorage.getItem('theme')
		if (s === 'light' || s === 'dark') setT(s)
	}, [])
	return [
		t,
		(v: Theme) => {
			setT(v)
			try {
				if (v === 'auto') {
					localStorage.removeItem('theme')
					delete document.documentElement.dataset.theme
				} else {
					localStorage.setItem('theme', v)
					document.documentElement.dataset.theme = v
				}
			} catch {}
		},
	]
}
export function useOnline() {
	const [on, setOn] = useState(true)
	useEffect(() => {
		setOn(navigator.onLine)
		const a = () => setOn(true),
			b = () => setOn(false)
		addEventListener('online', a)
		addEventListener('offline', b)
		return () => {
			removeEventListener('online', a)
			removeEventListener('offline', b)
		}
	}, [])
	return on
}
/** plural(5, 'объект', 'объекта', 'объектов') → «5 объектов» */
export function plural(n: number, one: string, few: string, many: string, withNumber = true) {
	const a = Math.abs(n) % 100,
		b = a % 10
	const w = a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many
	return withNumber ? `${n} ${w}` : w
}
