'use client'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
	actionLabel,
	ago,
	CONDITIONS,
	conditionTone,
	date,
	day,
	DOC_STATUS,
	initials,
	money,
	moneyShort,
	OK_TEXT,
	plural,
	ROLE,
	SCOPE,
	useMedia,
	useOnline,
	useTheme,
} from '@/lib/ui'
import Attachments from './Attachments'
import Devices from './Devices'
import ExcelImport from './ExcelImport'
import Icon from './Icons'
import { PasskeyOffer } from './Passkey'
import MapEditor from './MapEditor'
import Operations from './Operations'
import Scanner, { ScanResult } from './Scanner'
import Security from './Security'
import SettingsEditor from './SettingsEditor'
const titles: Record<string, string> = {
	home: 'Обзор',
	assets: 'Имущество',
	stocktakes: 'Инвентаризация',
	map: 'Карта школы',
	materials: 'Материалы',
	locations: 'Помещения',
	operations: 'Ремонты и выдача',
	documents: 'Документы',
	archive: 'Архив',
	reports: 'Отчёты',
	excel: 'Excel',
	audit: 'Журнал',
	settings: 'Настройки',
	users: 'Пользователи',
	devices: 'Устройства',
	security: 'Безопасность',
}
const icons: Record<string, string> = {
	home: 'home',
	assets: 'box',
	stocktakes: 'clipboard',
	map: 'map',
	materials: 'layers',
	locations: 'door',
	operations: 'wrench',
	documents: 'file',
	archive: 'archive',
	reports: 'chart',
	excel: 'sheet',
	audit: 'history',
	settings: 'settings',
	users: 'users',
	devices: 'phone',
	security: 'shield',
}
const GROUPS: [string, string[]][] = [
	['Главное', ['home', 'assets', 'stocktakes', 'map']],
	['Учёт', ['materials', 'locations', 'operations', 'documents', 'archive']],
	['Данные', ['reports', 'excel', 'audit']],
	['Администрирование', ['settings', 'users', 'devices']],
	['Аккаунт', ['security']],
]
const ADMIN_TABS = ['settings', 'users', 'devices']
const MOBILE_TABS = ['home', 'assets', 'stocktakes']
const MODAL_TITLES: Record<string, string> = {
	bulkMove: 'Массовое перемещение',
	asset: 'Карточка имущества',
	location: 'Помещение',
	move: 'Перемещение имущества',
	material: 'Материал',
	receive: 'Приход партии',
	transferLot: 'Перемещение материала',
	document: 'Акт списания',
	materialWriteoff: 'Количество к списанию',
	stocktake: 'Новая инвентаризация',
	check: 'Фактическое наличие',
	user: 'Пользователь',
}
type Toast = { id: number; text: string; kind: 'ok' | 'error' }
type ScanMode = null | { mode: 'open' } | { mode: 'stocktake'; id: string }
export default function Dashboard() {
	const [data, setData] = useState<any>(null),
		[tab, setTabRaw] = useState('home'),
		[search, setSearch] = useState(''),
		[room, setRoom] = useState(''),
		[category, setCategory] = useState(''),
		[condition, setCondition] = useState(''),
		[sort, setSort] = useState('new'),
		[modal, setModal] = useState<any>(null),
		[selected, setSelected] = useState<string[]>([]),
		[error, setError] = useState(''),
		[loadError, setLoadError] = useState(''),
		[busy, setBusy] = useState(false),
		[detailId, setDetailId] = useState(''),
		[stId, setStId] = useState(''),
		[stFilter, setStFilter] = useState('all'),
		[scan, setScan] = useState<ScanMode>(null),
		[scanRoom, setScanRoom] = useState(''),
		[toasts, setToasts] = useState<Toast[]>([]),
		[more, setMore] = useState(false),
		[extras, setExtras] = useState<any>(null),
		[auditQuery, setAuditQuery] = useState(''),
		[scrolled, setScrolled] = useState(false)
	const mobile = useMedia('(max-width: 900px)'),
		online = useOnline(),
		[theme, setTheme] = useTheme()
	const toastId = useRef(0)
	function notify(text: string, kind: Toast['kind'] = 'ok') {
		const id = ++toastId.current
		setToasts((t) => [...t.slice(-2), { id, text, kind }])
		setTimeout(
			() => setToasts((t) => t.filter((x) => x.id !== id)),
			kind === 'error' ? 6000 : 3000,
		)
	}
	function setTab(k: string) {
		setTabRaw(k)
		setSearch('')
		setRoom('')
		setCategory('')
		setCondition('')
		setSelected([])
		setMore(false)
		window.scrollTo({ top: 0 })
	}
	async function reload() {
		const r = await fetch('/api/data', { cache: 'no-store' })
		if (r.status === 401) {
			location.reload()
			return
		}
		if (!r.ok) throw new Error('Ошибка загрузки')
		const j = await r.json()
		setData(j)
		return j
	}
	async function loadExtras() {
		try {
			const r = await fetch('/api/extras', { cache: 'no-store' })
			if (r.ok) setExtras(await r.json())
		} catch {}
	}
	useEffect(() => {
		reload().catch((e) => setLoadError(e.message))
		loadExtras()
		const q = new URLSearchParams(location.search)
		const a = q.get('asset')
		if (a) {
			setTabRaw('assets')
			setSearch(a)
			history.replaceState(null, '', '/')
		}
		if (q.get('scan')) {
			setScan({ mode: 'open' })
			history.replaceState(null, '', '/')
		}
		const onScroll = () => setScrolled(window.scrollY > 4)
		addEventListener('scroll', onScroll, { passive: true })
		return () => removeEventListener('scroll', onScroll)
	}, [])
	// Закрытие окон кнопкой «Назад» на Android и клавишей Esc
	useEffect(() => {
		const esc = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			if (scan) setScan(null)
			else if (modal) setModal(null)
			else if (detailId) setDetailId('')
			else if (more) setMore(false)
		}
		addEventListener('keydown', esc)
		return () => removeEventListener('keydown', esc)
	}, [scan, modal, detailId, more])
	// Блокируем прокрутку фона под открытыми окнами
	useEffect(() => {
		const open = !!(modal || detailId || scan || more)
		document.body.style.overflow = open ? 'hidden' : ''
	}, [modal, detailId, scan, more])
	async function act(action: string, d: any, opts: { silent?: boolean } = {}) {
		setBusy(true)
		setError('')
		try {
			const r = await fetch('/api/action', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action, data: d }),
				}),
				j = await r.json().catch(() => ({}))
			if (r.status === 401) location.reload()
			if (!r.ok) throw new Error(j.error || 'Ошибка')
			await reload()
			if (['repair', 'loan', 'returnLoan', 'assetSet', 'deleteSet'].includes(action))
				loadExtras()
			if (!opts.silent) notify(OK_TEXT[action] || 'Сохранено')
			return j
		} catch (e: any) {
			const msg =
				e?.message === 'Failed to fetch' ? 'Нет соединения с сервером' : e.message
			if (modal) setError(msg)
			else if (!opts.silent) notify(msg, 'error')
			throw new Error(msg)
		} finally {
			setBusy(false)
		}
	}
	function fire(action: string, d: any) {
		act(action, d).catch(() => {})
	}
	/** Определяет объект по тексту QR или инвентарному номеру. */
	async function resolveAsset(
		text: string,
	): Promise<{ asset?: any; error?: string; fresh?: any }> {
		const t = text.trim()
		if (!t.startsWith('SINV1:') && !/^https?:\/\//i.test(t)) {
			const hit = data.assets.filter(
				(a: any) => a.inventory.toLowerCase() === t.toLowerCase(),
			)
			if (hit.length === 1) return { asset: hit[0] }
			return { error: 'Объект с таким инвентарным номером не найден' }
		}
		const r = await fetch('/api/scan', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text: t }),
		})
		const j = await r.json().catch(() => ({}))
		if (r.status === 401) location.reload()
		if (!r.ok) return { error: j.error || 'Код не распознан' }
		let found = data.assets.find((x: any) => x.id === j.id),
			fresh
		if (!found) {
			fresh = await reload()
			found = fresh?.assets.find((x: any) => x.id === j.id)
		}
		if (!found) return { error: 'Объект недоступен' }
		return { asset: found, fresh }
	}
	async function onScan(text: string): Promise<ScanResult> {
		const { asset, error } = await resolveAsset(text)
		if (!asset) return { kind: 'bad', text: error! }
		if (scan?.mode === 'stocktake') {
			const s = data.stocktakes.find((x: any) => x.id === scan.id)
			if (!s || s.status !== 'OPEN')
				return { kind: 'bad', text: 'Инвентаризация закрыта' }
			const snap = s.snapshot.find((x: any) => x.id === asset.id)
			if (!snap)
				return {
					kind: 'bad',
					text: `${asset.inventory} · ${asset.name} не входит в эту проверку`,
				}
			const where = scanRoom || snap.locationId
			const again = !!s.results[asset.id]
			try {
				await act('check', { id: s.id, assetId: asset.id, locationId: where }, { silent: true })
			} catch (e: any) {
				return { kind: 'bad', text: e.message }
			}
			return where === snap.locationId
				? {
						kind: 'ok',
						text: `${asset.inventory} · ${asset.name} — на месте${again ? ' (повторно)' : ''}`,
					}
				: {
						kind: 'warn',
						text: `${asset.inventory} · ${asset.name}: числится в «${loc(snap.locationId)}», отмечен в «${loc(where)}»`,
					}
		}
		setScan(null)
		setDetailId(asset.id)
		return { kind: 'ok', text: asset.name, close: true }
	}
	const filtered = useMemo(() => {
		if (!data) return []
		const q = search.toLowerCase().trim()
		const list = data.assets.filter(
			(a: any) =>
				(tab === 'archive' ? a.status !== 'ACTIVE' : a.status === 'ACTIVE') &&
				(!room || a.locationId === room) &&
				(!category || a.category === category) &&
				(!condition || a.condition === condition) &&
				(!q ||
					[a.id, a.inventory, a.name, a.serial, a.responsible, a.category].some(
						(s: string) => (s || '').toLowerCase().includes(q),
					)),
		)
		const by: Record<string, (a: any, b: any) => number> = {
			new: () => 0,
			name: (a, b) => a.name.localeCompare(b.name, 'ru'),
			inventory: (a, b) =>
				a.inventory.localeCompare(b.inventory, 'ru', { numeric: true }),
			costDesc: (a, b) => Number(b.cost) - Number(a.cost),
			costAsc: (a, b) => Number(a.cost) - Number(b.cost),
		}
		return sort === 'new' ? list : [...list].sort(by[sort])
	}, [data, tab, search, room, category, condition, sort])
	if (!data)
		return (
			<main className='login'>
				<div className='card' style={{ textAlign: 'center' }}>
					<div className='brand' style={{ margin: '0 auto 14px' }}>
						ШИ
					</div>
					{loadError ? (
						<>
							<p className='error'>{loadError}</p>
							<button onClick={() => location.reload()}>Повторить</button>
						</>
					) : (
						<p className='muted'>Загрузка…</p>
					)}
				</div>
			</main>
		)
	const write = data.user.role !== 'VIEWER',
		admin = data.user.role === 'ADMIN'
	const locName = (id: string) =>
		data.locations.find((l: any) => l.id === id)?.name || '—'
	function loc(id: string) {
		return locName(id)
	}
	const person = (id: string) =>
		data.people?.find((p: any) => p.id === id)?.name ||
		(id === data.user.id ? data.user.name : 'Пользователь')
	const active = data.assets.filter((a: any) => a.status === 'ACTIVE'),
		assets = filtered
	const total = active.reduce((s: number, a: any) => s + Number(a.cost), 0),
		stock = data.lots.reduce(
			(s: number, l: any) => s + Number(l.quantity) * Number(l.price),
			0,
		)
	const roomOptions: { value: string; label: string }[] = data.locations.map(
		(l: any) => ({
			value: l.id,
			label: `${l.name} · ${l.building}, ${l.floor} этаж${l.zone ? ', ' + l.zone : ''}`,
		}),
	)
	const categories = [
		...new Set<string>([
			...(data.school.settings?.categories || []),
			...active.map((a: any) => a.category),
		]),
	].filter(Boolean)
	const pendingDevices = (data.devices || []).filter(
		(d: any) => d.status === 'PENDING',
	).length
	const lowStock = data.materials.filter(
		(m: any) =>
			Number(m.minimum) > 0 &&
			data.lots
				.filter((l: any) => l.materialId === m.id)
				.reduce((s: number, l: any) => s + Number(l.quantity), 0) <
				Number(m.minimum),
	)
	const drafts = data.documents.filter((d: any) => d.status === 'DRAFT')
	const faulty = active.filter((a: any) => a.condition !== 'Исправно')
	const openStocktakes = data.stocktakes.filter((s: any) => s.status === 'OPEN')
	const overdue = (extras?.loans || []).filter(
		(l: any) => !l.closedAt && l.dueAt && new Date(l.dueAt) < new Date(),
	)
	const openRepairs = (extras?.repairs || []).filter((r: any) =>
		['OPEN', 'IN_PROGRESS'].includes(r.status),
	)
	function edit(type: string, d: any = {}) {
		setModal({ type, data: d })
		setError('')
	}
	const newAsset = () =>
		edit('asset', {
			scope: data.user.scope === 'ALL' ? 'IT' : data.user.scope,
			condition: 'Исправно',
			cost: 0,
			locationId: room || undefined,
			category: category || undefined,
		})
	function input(
		name: string,
		label: string,
		type = 'text',
		options?: any[],
		required = true,
	) {
		const d = modal.data
		return (
			<label key={name}>
				{label}
				{options ? (
					<select
						name={name}
						defaultValue={String(d[name] ?? options[0]?.value ?? '')}
						required={required}
					>
						{options.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				) : type === 'textarea' ? (
					<textarea
						name={name}
						defaultValue={d[name] || ''}
						required={required}
					/>
				) : (
					<input
						name={name}
						type={type}
						step={type === 'number' ? '0.001' : undefined}
						min={type === 'number' ? '0' : undefined}
						inputMode={type === 'number' ? 'decimal' : undefined}
						autoComplete={type === 'password' ? 'new-password' : 'off'}
						defaultValue={
							d[name] ??
							(type === 'date' ? new Date().toISOString().slice(0, 10) : '')
						}
						required={required}
					/>
				)}
			</label>
		)
	}
	const scopes = [
		{ value: 'IT', label: 'IT — техника' },
		{ value: 'HOUSEHOLD', label: 'Хозяйственная часть' },
	]
	const scopeInput = () =>
		input(
			'scope',
			'Направление',
			'text',
			admin || data.user.scope === 'ALL'
				? scopes
				: scopes.filter((s) => s.value === data.user.scope),
		)
	async function save(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault()
		const d: any = {
			...modal.data,
			...Object.fromEntries(new FormData(e.currentTarget)),
		}
		try {
			if (modal.type === 'asset') {
				d.fields = { ...(modal.data.fields || {}) }
				for (const f of data.school.settings.fields || []) {
					const v = d['custom_' + f.name]
					d.fields[f.name] =
						f.type === 'checkbox'
							? v === 'true'
							: f.type === 'number'
								? v === ''
									? ''
									: Number(v)
								: v || ''
					delete d['custom_' + f.name]
				}
			}
			if (modal.type === 'document') {
				d.lines = modal.data.lines
			}
			if (modal.type === 'user') d.active = d.active !== 'false'
			await act(modal.type, d)
			setModal(null)
			setSelected([])
		} catch {}
	}
	const st =
		data.stocktakes.find((s: any) => s.id === stId) || data.stocktakes[0]
	const detail = detailId
		? data.assets.find((a: any) => a.id === detailId)
		: null
	function stResult(s: any, a: any) {
		const r = s.results[a.id]
		if (!r) return 'none'
		if (r.status === 'MISSING') return 'missing'
		return r.locationId === a.locationId ? 'ok' : 'moved'
	}
	function stStats(s: any) {
		const c = { ok: 0, moved: 0, missing: 0, none: 0 }
		for (const a of s.snapshot) c[stResult(s, a) as keyof typeof c]++
		return { ...c, total: s.snapshot.length, done: s.snapshot.length - c.none }
	}
	const pct = (n: number, t: number) => (t ? (n / t) * 100 : 0) + '%'
	function startStocktakeScan(s: any) {
		setScanRoom(s.snapshot[0]?.locationId || data.locations[0]?.id || '')
		setScan({ mode: 'stocktake', id: s.id })
	}
	const visibleTabs = Object.keys(titles).filter(
		(k) => admin || !ADMIN_TABS.includes(k),
	)
	const navButton = (k: string) => (
		<button
			key={k}
			className={tab === k ? 'nav active' : 'nav'}
			onClick={() => setTab(k)}
		>
			<Icon name={icons[k]} size={19} />
			<span>{titles[k]}</span>
			{k === 'devices' && pendingDevices > 0 && (
				<span className='dot'>{pendingDevices}</span>
			)}
			{k === 'stocktakes' && openStocktakes.length > 0 && (
				<span className='dot' style={{ background: 'var(--primary)' }}>
					{openStocktakes.length}
				</span>
			)}
		</button>
	)
	const themeSwitch = (
		<div className='theme-switch' role='group' aria-label='Тема оформления'>
			{(
				[
					['auto', 'Авто', 'auto'],
					['light', 'Светлая', 'sun'],
					['dark', 'Тёмная', 'moon'],
				] as const
			).map(([v, l, i]) => (
				<button
					key={v}
					className={theme === v ? 'active' : ''}
					onClick={() => setTheme(v)}
					title={l}
				>
					<Icon name={i} size={15} />
					<span>{l}</span>
				</button>
			))}
		</div>
	)
	async function logout() {
		await fetch('/api/logout', { method: 'POST' })
		location.reload()
	}
	const conditionBadge = (c: string) => (
		<span className={'badge ' + conditionTone(c)}>{c}</span>
	)
	const toggle = (id: string, on: boolean) =>
		setSelected(on ? [...selected, id] : selected.filter((x) => x !== id))
	const stocktakeView = st && (() => {
		const c = stStats(st)
		const rows = st.snapshot.filter(
			(a: any) =>
				(stFilter === 'all' || stResult(st, a) === stFilter) &&
				(!search ||
					[a.inventory, a.name].some((s: string) =>
						s.toLowerCase().includes(search.toLowerCase()),
					)),
		)
		const label = (a: any) => {
			const r = st.results[a.id]
			const k = stResult(st, a)
			if (k === 'none') return <span className='badge plain'>Не проверено</span>
			if (k === 'missing') return <span className='badge bad'>Не найдено</span>
			if (k === 'ok') return <span className='badge ok'>На месте</span>
			return <span className='badge warn'>В «{loc(r.locationId)}»</span>
		}
		const actions = (a: any) =>
			write &&
			st.status === 'OPEN' && (
				<>
					<button
						className='secondary sm'
						disabled={busy}
						onClick={() =>
							fire('check', { id: st.id, assetId: a.id, locationId: a.locationId })
						}
					>
						<Icon name='check' size={15} /> На месте
					</button>
					<button
						className='secondary sm'
						onClick={() =>
							edit('check', {
								id: st.id,
								assetId: a.id,
								locationId: st.results[a.id]?.locationId || a.locationId,
							})
						}
					>
						Отметить
					</button>
					<button
						className='ghost sm'
						disabled={busy}
						onClick={() => fire('missing', { id: st.id, assetId: a.id })}
					>
						Не найдено
					</button>
				</>
			)
		return { c, rows, label, actions }
	})()
	return (
		<div className='shell'>
			<aside className='sidebar'>
				<div className='brand-row'>
					<div className='brand'>ШИ</div>
					<div>
						<b title={data.school.name}>{data.school.name}</b>
						<small>{SCOPE[data.user.scope] || data.user.scope}</small>
					</div>
				</div>
				<nav aria-label='Разделы'>
					{GROUPS.map(([g, keys]) => {
						const items = keys.filter((k) => visibleTabs.includes(k))
						if (!items.length) return null
						return (
							<Fragment key={g}>
								<div className='nav-title'>{g}</div>
								{items.map(navButton)}
							</Fragment>
						)
					})}
				</nav>
				<div className='sidebar-foot'>
					{themeSwitch}
					<div className='user-card'>
						<div className='avatar'>{initials(data.user.name)}</div>
						<div>
							<b>{data.user.name}</b>
							<small>{ROLE[data.user.role]}</small>
						</div>
						<button
							className='ghost icon-btn'
							title='Выйти'
							aria-label='Выйти'
							onClick={logout}
						>
							<Icon name='logout' size={18} />
						</button>
					</div>
				</div>
			</aside>
			<div className='content'>
				{!online && (
					<div className='offline' role='status'>
						<Icon name='wifiOff' size={16} /> Нет подключения к сети — данные
						могут быть неактуальны
					</div>
				)}
				<header className={'topbar' + (scrolled ? ' scrolled' : '')}>
					<div className='brand mobile-only'>ШИ</div>
					<div className='titles'>
						<p className='eyebrow'>{data.school.name}</p>
						<h1>{titles[tab]}</h1>
					</div>
					<div className='header-actions desktop-only'>
						<span className='scope-pill'>
							<Icon name='user' size={14} />
							{SCOPE[data.user.scope] || data.user.scope}
						</span>
						<button className='scan-btn' onClick={() => setScan({ mode: 'open' })}>
							<Icon name='scan' size={18} /> Сканировать QR
						</button>
					</div>
				</header>
				<main className='page' key={tab}>
					{tab === 'home' && (
						<>
							<PasskeyOffer notify={notify} />
							<div className='hero'>
								<div>
									<h2>
										{(() => {
											const h = new Date().getHours()
											return h < 5
												? 'Доброй ночи'
												: h < 12
													? 'Доброе утро'
													: h < 18
														? 'Добрый день'
														: 'Добрый вечер'
										})()}
										, {data.user.name.split(' ')[0]}
									</h2>
									<p className='muted' style={{ margin: 0 }}>
										{new Date().toLocaleDateString('ru-RU', {
											weekday: 'long',
											day: 'numeric',
											month: 'long',
										})}
									</p>
								</div>
							</div>
							<div className='stats'>
								<button
									className='card stat'
									style={{ color: 'inherit', textAlign: 'left' }}
									onClick={() => setTab('assets')}
								>
									<div className='stat-icon'>
										<Icon name='box' />
									</div>
									<span>На учёте</span>
									<strong>{active.length}</strong>
									<small>{plural(active.length, 'объект', 'объекта', 'объектов', false)} имущества</small>
								</button>
								<div className='card stat ok'>
									<div className='stat-icon'>
										<Icon name='ruble' />
									</div>
									<span>Стоимость имущества</span>
									<strong title={money(total)}>{moneyShort(total)}</strong>
									<small>по данным системы</small>
								</div>
								<button
									className='card stat violet'
									style={{ color: 'inherit', textAlign: 'left' }}
									onClick={() => setTab('materials')}
								>
									<div className='stat-icon'>
										<Icon name='layers' />
									</div>
									<span>Материалы</span>
									<strong title={money(stock)}>{moneyShort(stock)}</strong>
									<small>{plural(data.materials.length, 'наименование', 'наименования', 'наименований')}</small>
								</button>
								<button
									className='card stat teal'
									style={{ color: 'inherit', textAlign: 'left' }}
									onClick={() => setTab('locations')}
								>
									<div className='stat-icon'>
										<Icon name='door' />
									</div>
									<span>Помещения</span>
									<strong>{data.locations.length}</strong>
									<small>{plural(data.plans.length, 'план этажа', 'плана этажей', 'планов этажей')}</small>
								</button>
							</div>
							<div className='grid-2'>
								<div>
									{openStocktakes.map((s: any) => {
										const c = stStats(s)
										return (
											<div className='card' key={s.id}>
												<div className='card-head'>
													<div>
														<span className='badge info'>Идёт инвентаризация</span>
														<h2 style={{ marginTop: 8 }}>{s.name}</h2>
													</div>
													<strong style={{ fontSize: 22 }}>
														{Math.round((c.done / (c.total || 1)) * 100)}%
													</strong>
												</div>
												<div className='progress'>
													<span className='ok' style={{ width: pct(c.ok, c.total) }} />
													<span className='warn' style={{ width: pct(c.moved, c.total) }} />
													<span className='bad' style={{ width: pct(c.missing, c.total) }} />
												</div>
												<div className='legend'>
													<span>
														<i style={{ background: 'var(--ok)' }} />
														На месте {c.ok}
													</span>
													<span>
														<i style={{ background: 'var(--warn)' }} />В другом месте{' '}
														{c.moved}
													</span>
													<span>
														<i style={{ background: 'var(--bad)' }} />
														Не найдено {c.missing}
													</span>
													<span>
														<i style={{ background: 'var(--border-strong)' }} />
														Осталось {c.none}
													</span>
												</div>
												<div className='action-row' style={{ marginBottom: 0 }}>
													{write && (
														<button onClick={() => startStocktakeScan(s)}>
															<Icon name='scan' size={18} /> Продолжить сканирование
														</button>
													)}
													<button
														className='secondary'
														onClick={() => {
															setTab('stocktakes')
															setStId(s.id)
														}}
													>
														Ведомость
													</button>
												</div>
											</div>
										)
									})}
									<div className='card'>
										<h2>Быстрые действия</h2>
										<div className='quick-grid'>
											<button
												className='quick primary'
												onClick={() => setScan({ mode: 'open' })}
											>
												<span className='q-icon'>
													<Icon name='scan' />
												</span>
												Сканировать QR
											</button>
											{write && (
												<button className='quick' onClick={newAsset}>
													<span className='q-icon'>
														<Icon name='plus' />
													</span>
													Добавить имущество
												</button>
											)}
											{write && (
												<button
													className='quick'
													onClick={() => edit('stocktake')}
												>
													<span className='q-icon'>
														<Icon name='clipboard' />
													</span>
													Начать инвентаризацию
												</button>
											)}
											<button className='quick' onClick={() => setTab('map')}>
												<span className='q-icon'>
													<Icon name='map' />
												</span>
												Карта школы
											</button>
											<button className='quick' onClick={() => setTab('reports')}>
												<span className='q-icon'>
													<Icon name='chart' />
												</span>
												Отчёты
											</button>
											<button
												className='quick'
												onClick={() => setTab('operations')}
											>
												<span className='q-icon'>
													<Icon name='wrench' />
												</span>
												Ремонты и выдача
											</button>
										</div>
									</div>
								</div>
								<div>
									<div className='card'>
										<h2>Требует внимания</h2>
										<div className='list'>
											{admin && pendingDevices > 0 && (
												<button className='list-item bad' onClick={() => setTab('devices')}>
													<span className='li-icon'>
														<Icon name='phone' />
													</span>
													<span className='li-text'>
														Устройства ждут подтверждения
														<small>Новые входы сотрудников</small>
													</span>
													<span className='dot'>{pendingDevices}</span>
													<Icon name='chevron' size={18} />
												</button>
											)}
											{overdue.length > 0 && (
												<button className='list-item bad' onClick={() => setTab('operations')}>
													<span className='li-icon'>
														<Icon name='clock' />
													</span>
													<span className='li-text'>
														Просрочен возврат
														<small>Выдано и не возвращено в срок</small>
													</span>
													<b>{overdue.length}</b>
													<Icon name='chevron' size={18} />
												</button>
											)}
											{drafts.length > 0 && (
												<button className='list-item warn' onClick={() => setTab('documents')}>
													<span className='li-icon'>
														<Icon name='file' />
													</span>
													<span className='li-text'>
														Черновики актов списания
														<small>Ожидают проведения</small>
													</span>
													<b>{drafts.length}</b>
													<Icon name='chevron' size={18} />
												</button>
											)}
											{faulty.length > 0 && (
												<button
													className='list-item warn'
													onClick={() => {
														setTab('assets')
														setCondition(
															faulty.some((a: any) => a.condition === 'Неисправно')
																? 'Неисправно'
																: faulty[0].condition,
														)
													}}
												>
													<span className='li-icon'>
														<Icon name='alert' />
													</span>
													<span className='li-text'>
														Неисправное имущество
														<small>Требует ремонта или диагностики</small>
													</span>
													<b>{faulty.length}</b>
													<Icon name='chevron' size={18} />
												</button>
											)}
											{openRepairs.length > 0 && (
												<button className='list-item info' onClick={() => setTab('operations')}>
													<span className='li-icon'>
														<Icon name='wrench' />
													</span>
													<span className='li-text'>
														Открытые ремонты
														<small>В работе или ожидают</small>
													</span>
													<b>{openRepairs.length}</b>
													<Icon name='chevron' size={18} />
												</button>
											)}
											{lowStock.map((m: any) => (
												<button
													key={m.id}
													className='list-item warn'
													onClick={() => setTab('materials')}
												>
													<span className='li-icon'>
														<Icon name='layers' />
													</span>
													<span className='li-text'>
														{m.name}
														<small>Ниже минимального остатка ({m.minimum} {m.unit})</small>
													</span>
													<Icon name='chevron' size={18} />
												</button>
											))}
											{!(
												(admin && pendingDevices) ||
												overdue.length ||
												drafts.length ||
												faulty.length ||
												openRepairs.length ||
												lowStock.length
											) && (
												<div className='all-good'>
													<Icon name='check' /> Всё в порядке
												</div>
											)}
										</div>
									</div>
									<div className='card'>
										<div className='card-head'>
											<h2>Последние действия</h2>
											<button className='ghost sm' onClick={() => setTab('audit')}>
												Весь журнал
											</button>
										</div>
										<div className='feed'>
											{data.audit.slice(0, 6).map((a: any) => {
												const obj = data.assets.find((x: any) => x.id === a.entityId)
												return (
													<div className='feed-item' key={a.id}>
														<div className='avatar sm'>{initials(person(a.userId))}</div>
														<div>
															<p>
																<b>{person(a.userId)}</b> · {actionLabel(a.action)}
																{obj && (
																	<>
																		{' '}
																		—{' '}
																		<button className='link' onClick={() => setDetailId(obj.id)}>
																			{obj.name}
																		</button>
																	</>
																)}
															</p>
															<small>{ago(a.createdAt)}</small>
														</div>
													</div>
												)
											})}
											{!data.audit.length && <p className='muted'>Пока нет событий</p>}
										</div>
									</div>
								</div>
							</div>
						</>
					)}
					{(tab === 'assets' || tab === 'archive') && (
						<>
							<div className='toolbar'>
								<div className='search'>
									<Icon name='search' size={18} />
									<input
										type='search'
										placeholder='Номер, название, серийный номер…'
										value={search}
										onChange={(e) => setSearch(e.target.value)}
									/>
								</div>
								<div className='filters'>
									<select
										aria-label='Помещение'
										value={room}
										onChange={(e) => setRoom(e.target.value)}
									>
										<option value=''>Все помещения</option>
										{roomOptions.map((o) => (
											<option key={o.value} value={o.value}>
												{o.label}
											</option>
										))}
									</select>
									<select
										aria-label='Категория'
										value={category}
										onChange={(e) => setCategory(e.target.value)}
									>
										<option value=''>Все категории</option>
										{categories.map((c) => (
											<option key={c}>{c}</option>
										))}
									</select>
									{tab === 'assets' && (
										<select
											aria-label='Состояние'
											value={condition}
											onChange={(e) => setCondition(e.target.value)}
										>
											<option value=''>Любое состояние</option>
											{CONDITIONS.map((c) => (
												<option key={c}>{c}</option>
											))}
										</select>
									)}
									<select
										aria-label='Сортировка'
										value={sort}
										onChange={(e) => setSort(e.target.value)}
									>
										<option value='new'>Сначала новые</option>
										<option value='name'>По названию</option>
										<option value='inventory'>По инв. номеру</option>
										<option value='costDesc'>Сначала дорогие</option>
										<option value='costAsc'>Сначала дешёвые</option>
									</select>
								</div>
								<span className='spacer' />
								{write && tab !== 'archive' && (
									<button onClick={newAsset}>
										<Icon name='plus' size={18} /> Объект
									</button>
								)}
								<a className='button secondary' href='/api/excel'>
									<Icon name='down' size={17} /> XLSX
								</a>
							</div>
							<p className='summary-line'>
								Найдено: {assets.length} · на сумму{' '}
								{money(assets.reduce((s: number, a: any) => s + Number(a.cost), 0))}
								{(search || room || category || condition) && (
									<>
										{' · '}
										<button
											className='link'
											onClick={() => {
												setSearch('')
												setRoom('')
												setCategory('')
												setCondition('')
											}}
										>
											Сбросить фильтры
										</button>
									</>
								)}
							</p>
							{selected.length > 0 && (
								<div className='card notice' style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', position: 'sticky', top: mobile ? 64 : 84, zIndex: 5 }}>
									<b style={{ marginRight: 'auto' }}>Выбрано: {selected.length}</b>
									<button
										className='secondary sm'
										onClick={() => edit('bulkMove', { ids: selected })}
									>
										<Icon name='move' size={15} /> Переместить
									</button>
									<button
										className='secondary sm'
										disabled={selected.length > 100}
										onClick={() =>
											window.open(`/labels?ids=${selected.join(',')}`, '_blank')
										}
									>
										<Icon name='qr' size={15} /> QR-этикетки
									</button>
									<button
										className='danger sm'
										onClick={() =>
											edit('document', {
												kind: 'ASSET_WRITE_OFF',
												lines: selected.map((id) => ({ id })),
												number: `СП-${Date.now().toString().slice(-6)}`,
											})
										}
									>
										На списание ({selected.length})
									</button>
									<button className='ghost sm' onClick={() => setSelected([])}>
										<Icon name='x' size={15} /> Снять
									</button>
								</div>
							)}
							{mobile ? (
								<div className='item-list'>
									{assets.map((a: any) => (
										<div
											className={'item' + (selected.includes(a.id) ? ' selected' : '')}
											key={a.id}
										>
											{write && tab !== 'archive' && (
												<input
													type='checkbox'
													aria-label='Выбрать'
													checked={selected.includes(a.id)}
													onChange={(e) => toggle(a.id, e.target.checked)}
												/>
											)}
											<div className='item-main' onClick={() => setDetailId(a.id)}>
												<b>{a.name}</b>
												<small>
													{a.inventory} · {loc(a.locationId)}
												</small>
											</div>
											<div className='item-side' onClick={() => setDetailId(a.id)}>
												{tab === 'archive' ? (
													<span className='badge plain'>Списан</span>
												) : (
													conditionBadge(a.condition)
												)}
												<span>{money(a.cost)}</span>
											</div>
										</div>
									))}
									{!assets.length && (
										<div className='empty'>
											<Icon name='box' size={32} />
											Объекты не найдены
										</div>
									)}
								</div>
							) : (
								<div className='tablewrap'>
									<table>
										<thead>
											<tr>
												<th style={{ width: 44 }}>
													{write && tab !== 'archive' && assets.length > 0 && (
														<input
															type='checkbox'
															aria-label='Выбрать все'
															checked={assets.every((a: any) => selected.includes(a.id))}
															onChange={(e) =>
																setSelected(
																	e.target.checked ? assets.map((a: any) => a.id) : [],
																)
															}
														/>
													)}
												</th>
												<th>Инв. номер</th>
												<th>Объект</th>
												<th>Помещение</th>
												<th>Ответственный</th>
												<th className='num'>Стоимость</th>
												<th>Состояние</th>
												<th></th>
											</tr>
										</thead>
										<tbody>
											{assets.map((a: any) => (
												<tr key={a.id} className={selected.includes(a.id) ? 'selected' : ''}>
													<td>
														{write && tab !== 'archive' && (
															<input
																type='checkbox'
																aria-label='Выбрать'
																checked={selected.includes(a.id)}
																onChange={(e) => toggle(a.id, e.target.checked)}
															/>
														)}
													</td>
													<td>
														<button className='link' onClick={() => setDetailId(a.id)}>
															{a.inventory}
														</button>
													</td>
													<td>
														<b>{a.name}</b>
														<small>
															{a.category}
															{a.serial ? ' · ' + a.serial : ''}
														</small>
													</td>
													<td>{loc(a.locationId)}</td>
													<td>{a.responsible || '—'}</td>
													<td className='num'>{money(a.cost)}</td>
													<td>
														{tab === 'archive' ? (
															<span className='badge plain'>Списан</span>
														) : (
															conditionBadge(a.condition)
														)}
													</td>
													<td>
														{write && tab !== 'archive' && (
															<div className='rowactions'>
																<button
																	className='ghost icon-btn sm'
																	title='Изменить'
																	aria-label='Изменить'
																	onClick={() =>
																		edit('asset', {
																			...a,
																			acquired: a.acquired.slice(0, 10),
																		})
																	}
																>
																	<Icon name='edit' size={17} />
																</button>
																<button
																	className='ghost icon-btn sm'
																	title='Переместить'
																	aria-label='Переместить'
																	onClick={() =>
																		edit('move', {
																			id: a.id,
																			locationId: a.locationId,
																			responsible: a.responsible,
																		})
																	}
																>
																	<Icon name='move' size={17} />
																</button>
															</div>
														)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
									{!assets.length && (
										<div className='empty'>
											<Icon name='box' size={32} />
											Объекты не найдены
										</div>
									)}
								</div>
							)}
						</>
					)}
					{tab === 'locations' && (
						<>
							<div className='toolbar'>
								<div className='search'>
									<Icon name='search' size={18} />
									<input
										type='search'
										placeholder='Поиск помещения…'
										value={search}
										onChange={(e) => setSearch(e.target.value)}
									/>
								</div>
								<span className='spacer' />
								{admin && (
									<button
										onClick={() =>
											edit('location', {
												building: 'Основной корпус',
												floor: '1',
											})
										}
									>
										<Icon name='plus' size={18} /> Помещение
									</button>
								)}
							</div>
							<div className='cards'>
								{data.locations
									.filter((l: any) =>
										[l.name, l.building, l.zone, l.responsible].some((s: string) =>
											(s || '').toLowerCase().includes(search.toLowerCase()),
										),
									)
									.map((l: any) => {
										const items = active.filter((a: any) => a.locationId === l.id)
										return (
											<div className='card' key={l.id}>
												<div className='card-head' style={{ marginBottom: 4 }}>
													<span className='badge info plain'>
														{l.building}, {l.floor} этаж
													</span>
													{admin && (
														<button
															className='ghost icon-btn sm'
															aria-label='Изменить'
															title='Изменить'
															onClick={() => edit('location', l)}
														>
															<Icon name='edit' size={17} />
														</button>
													)}
												</div>
												<h2>{l.name}</h2>
												<p className='muted' style={{ margin: 0 }}>
													{[l.zone, l.responsible && 'Отв.: ' + l.responsible]
														.filter(Boolean)
														.join(' · ') || '\u00a0'}
												</p>
												<p>
													<b>{items.length}</b> объектов ·{' '}
													{money(items.reduce((s: number, a: any) => s + Number(a.cost), 0))}
												</p>
												<button
													className='secondary'
													onClick={() => {
														setTab('assets')
														setRoom(l.id)
													}}
												>
													Посмотреть имущество
												</button>
											</div>
										)
									})}
							</div>
						</>
					)}
					{tab === 'map' && (
						<MapEditor
							data={data}
							act={act}
							reload={reload}
							openRoom={(id: string) => {
								setTab('assets')
								setRoom(id)
							}}
						/>
					)}
					{tab === 'materials' && (
						<>
							<div className='toolbar'>
								<div className='search'>
									<Icon name='search' size={18} />
									<input
										type='search'
										placeholder='Поиск материала…'
										value={search}
										onChange={(e) => setSearch(e.target.value)}
									/>
								</div>
								<span className='spacer' />
								{write && (
									<button
										onClick={() =>
											edit('material', { scope: 'IT', unit: 'шт.', minimum: 0 })
										}
									>
										<Icon name='plus' size={18} /> Номенклатура
									</button>
								)}
								<a className='button secondary' href='/api/export?type=materials'>
									<Icon name='down' size={17} /> Партии XLSX
								</a>
							</div>
							<div className='cards'>
								{data.materials
									.filter((m: any) =>
										[m.name, m.category].some((s: string) =>
											(s || '').toLowerCase().includes(search.toLowerCase()),
										),
									)
									.map((m: any) => {
										const lots = data.lots.filter(
											(l: any) => l.materialId === m.id && Number(l.quantity) > 0,
										)
										const qty = lots.reduce(
											(s: number, l: any) => s + Number(l.quantity),
											0,
										)
										const low = Number(m.minimum) > 0 && qty < Number(m.minimum)
										return (
											<div className='card' key={m.id}>
												<div className='card-head' style={{ marginBottom: 4 }}>
													<span className={'badge ' + (low ? 'warn' : 'ok')}>
														{low ? 'Мало' : 'В наличии'}
													</span>
													{write && (
														<button
															className='ghost icon-btn sm'
															aria-label='Изменить'
															title='Изменить'
															onClick={() => edit('material', m)}
														>
															<Icon name='edit' size={17} />
														</button>
													)}
												</div>
												<h2>{m.name}</h2>
												<p style={{ margin: '0 0 8px' }}>
													<span className='lot-total'>
														{qty.toLocaleString('ru-RU')}
													</span>{' '}
													{m.unit}
													<small>
														минимум {m.minimum} · {m.category || 'без категории'}
													</small>
												</p>
												{write && (
													<button
														onClick={() =>
															edit('receive', {
																materialId: m.id,
																quantity: 1,
																price: 0,
															})
														}
													>
														<Icon name='plus' size={17} /> Приход
													</button>
												)}
												{lots.map((l: any) => (
													<div className='lot' key={l.id}>
														<b>{loc(l.locationId)}</b>
														<p>
															{l.quantity} {m.unit} × {money(l.price)} · {day(l.received)}
														</p>
														{write && (
															<>
																<button
																	className='secondary sm'
																	onClick={() =>
																		edit('transferLot', { id: l.id, quantity: 1 })
																	}
																>
																	Переместить
																</button>
																<button
																	className='ghost sm'
																	onClick={() =>
																		edit('materialWriteoff', {
																			lot: l,
																			quantity: 1,
																		})
																	}
																>
																	Списать
																</button>
															</>
														)}
													</div>
												))}
											</div>
										)
									})}
							</div>
							{!data.materials.length && (
								<div className='empty'>
									<Icon name='layers' size={32} />
									Материалов пока нет
								</div>
							)}
						</>
					)}
					{tab === 'documents' && (
						<>
							{mobile ? (
								<div className='item-list'>
									{data.documents.map((d: any) => (
										<div className='item' key={d.id} style={{ alignItems: 'flex-start' }}>
											<div className='item-main'>
												<b>
													{d.number} ·{' '}
													{d.kind === 'ASSET_WRITE_OFF' ? 'имущество' : 'материалы'}
												</b>
												<small>{day(d.date)}</small>
												<div className='actions'>
													<a className='button secondary sm' href={`/documents/${d.id}`} target='_blank'>
														<Icon name='printer' size={15} /> Акт
													</a>
													{write && d.status === 'DRAFT' && (
														<button
															className='sm'
															disabled={busy}
															onClick={() =>
																confirm('Провести списание? Остатки будут изменены.') &&
																fire('postDocument', { id: d.id })
															}
														>
															Провести
														</button>
													)}
													{write &&
														d.status !== 'CANCELLED' &&
														(d.status === 'DRAFT' || admin) && (
															<button
																className='ghost sm'
																disabled={busy}
																onClick={() => {
																	const reason = prompt('Причина отмены:')
																	if (reason) fire('cancelDocument', { id: d.id, reason })
																}}
															>
																Отменить
															</button>
														)}
												</div>
											</div>
											<span className={'badge ' + DOC_STATUS[d.status]?.[1]}>
												{DOC_STATUS[d.status]?.[0]}
											</span>
										</div>
									))}
								</div>
							) : (
								<div className='tablewrap'>
									<table>
										<thead>
											<tr>
												<th>Номер / дата</th>
												<th>Вид</th>
												<th>Строк</th>
												<th>Статус</th>
												<th>Проведён</th>
												<th></th>
											</tr>
										</thead>
										<tbody>
											{data.documents.map((d: any) => (
												<tr key={d.id}>
													<td>
														<b>{d.number}</b>
														<small>{day(d.date)}</small>
													</td>
													<td>
														{d.kind === 'ASSET_WRITE_OFF'
															? 'Списание имущества'
															: 'Списание материалов'}
													</td>
													<td>{Array.isArray(d.lines) ? d.lines.length : '—'}</td>
													<td>
														<span className={'badge ' + DOC_STATUS[d.status]?.[1]}>
															{DOC_STATUS[d.status]?.[0]}
														</span>
													</td>
													<td>{d.postedAt ? date(d.postedAt) : '—'}</td>
													<td>
														<div className='rowactions'>
															<a
																className='button secondary sm'
																href={`/documents/${d.id}`}
																target='_blank'
															>
																<Icon name='printer' size={15} /> Акт / печать
															</a>
															{write && d.status === 'DRAFT' && (
																<button
																	className='sm'
																	disabled={busy}
																	onClick={() => {
																		if (confirm('Провести списание? Остатки будут изменены.'))
																			fire('postDocument', { id: d.id })
																	}}
																>
																	Провести
																</button>
															)}
															{write &&
																d.status !== 'CANCELLED' &&
																(d.status === 'DRAFT' || admin) && (
																	<button
																		className='ghost sm'
																		disabled={busy}
																		onClick={() => {
																			const reason = prompt('Причина отмены:')
																			if (reason) fire('cancelDocument', { id: d.id, reason })
																		}}
																	>
																		Отменить
																	</button>
																)}
														</div>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
							{!data.documents.length && (
								<div className='empty'>
									<Icon name='file' size={32} />
									Актов пока нет. Выберите объекты в разделе «Имущество» и нажмите
									«На списание».
								</div>
							)}
						</>
					)}
					{tab === 'stocktakes' && (
						<>
							<div className='toolbar'>
								{data.stocktakes.length > 0 && (
									<select
										aria-label='Проверка'
										value={st?.id || ''}
										onChange={(e) => setStId(e.target.value)}
										style={{ maxWidth: 420, flex: '1 1 240px' }}
									>
										{data.stocktakes.map((s: any) => (
											<option value={s.id} key={s.id}>
												{s.name} · {s.status === 'OPEN' ? 'идёт' : 'завершена'} ·{' '}
												{day(s.createdAt)}
											</option>
										))}
									</select>
								)}
								<span className='spacer' />
								{write && (
									<button
										className={st?.status === 'OPEN' ? 'secondary' : ''}
										onClick={() => edit('stocktake')}
									>
										<Icon name='plus' size={18} /> Новая проверка
									</button>
								)}
							</div>
							{!st && (
								<div className='card empty'>
									<Icon name='clipboard' size={36} />
									<p>Инвентаризаций ещё не было.</p>
									{write && (
										<button onClick={() => edit('stocktake')}>Начать первую</button>
									)}
								</div>
							)}
							{st && stocktakeView && (
								<>
									<div className='card'>
										<div className='card-head'>
											<div>
												<span className={'badge ' + (st.status === 'OPEN' ? 'info' : 'plain')}>
													{st.status === 'OPEN' ? 'Идёт проверка' : 'Завершена'}
												</span>
												<h2 style={{ marginTop: 8 }}>{st.name}</h2>
											</div>
											<strong style={{ fontSize: 26 }}>
												{stocktakeView.c.done}
												<span className='muted' style={{ fontSize: 16 }}>
													{' '}
													/ {stocktakeView.c.total}
												</span>
											</strong>
										</div>
										<div className='progress'>
											<span className='ok' style={{ width: pct(stocktakeView.c.ok, stocktakeView.c.total) }} />
											<span className='warn' style={{ width: pct(stocktakeView.c.moved, stocktakeView.c.total) }} />
											<span className='bad' style={{ width: pct(stocktakeView.c.missing, stocktakeView.c.total) }} />
										</div>
										<p className='muted' style={{ fontSize: 13 }}>
											Фактические отметки не меняют учётное местоположение
											автоматически.
										</p>
										<div className='action-row' style={{ marginBottom: 0 }}>
											{write && st.status === 'OPEN' && (
												<button onClick={() => startStocktakeScan(st)}>
													<Icon name='scan' size={18} /> Сканировать подряд
												</button>
											)}
											<a
												className='button secondary'
												href={`/api/export?type=stocktake&id=${st.id}`}
											>
												<Icon name='down' size={17} /> Ведомость XLSX
											</a>
											{write && st.status === 'OPEN' && (
												<button
													className='ghost'
													onClick={() => {
														if (
															confirm(
																'Закрыть проверку? Неотмеченные объекты останутся непроверенными.',
															)
														)
															fire('closeStocktake', { id: st.id })
													}}
												>
													Завершить
												</button>
											)}
										</div>
									</div>
									<div className='segmented'>
										{(
											[
												['all', 'Все', stocktakeView.c.total],
												['none', 'Не проверено', stocktakeView.c.none],
												['ok', 'На месте', stocktakeView.c.ok],
												['moved', 'В другом месте', stocktakeView.c.moved],
												['missing', 'Не найдено', stocktakeView.c.missing],
											] as const
										).map(([k, l, n]) => (
											<button
												key={k}
												className={stFilter === k ? 'active' : ''}
												onClick={() => setStFilter(k)}
											>
												{l} · {n}
											</button>
										))}
									</div>
									<div className='toolbar'>
										<div className='search'>
											<Icon name='search' size={18} />
											<input
												type='search'
												placeholder='Найти в ведомости…'
												value={search}
												onChange={(e) => setSearch(e.target.value)}
											/>
										</div>
									</div>
									{mobile ? (
										<div className='item-list'>
											{stocktakeView.rows.map((a: any) => (
												<div className='item' key={a.id} style={{ alignItems: 'flex-start' }}>
													<div className='item-main'>
														<b>{a.name}</b>
														<small>
															{a.inventory} · {loc(a.locationId)}
														</small>
														<div className='actions'>{stocktakeView.actions(a)}</div>
													</div>
													{stocktakeView.label(a)}
												</div>
											))}
											{!stocktakeView.rows.length && <div className='empty'>Пусто</div>}
										</div>
									) : (
										<div className='tablewrap'>
											<table>
												<thead>
													<tr>
														<th>Номер</th>
														<th>Объект</th>
														<th>Ожидалось</th>
														<th>Результат</th>
														<th></th>
													</tr>
												</thead>
												<tbody>
													{stocktakeView.rows.map((a: any) => (
														<tr key={a.id}>
															<td>{a.inventory}</td>
															<td>
																<b>{a.name}</b>
															</td>
															<td>{loc(a.locationId)}</td>
															<td>{stocktakeView.label(a)}</td>
															<td>
																<div className='rowactions'>{stocktakeView.actions(a)}</div>
															</td>
														</tr>
													))}
												</tbody>
											</table>
											{!stocktakeView.rows.length && <div className='empty'>Пусто</div>}
										</div>
									)}
								</>
							)}
						</>
					)}
					{tab === 'reports' && (
						<>
							<div className='stats'>
								<div className='card stat'>
									<div className='stat-icon'>
										<Icon name='box' />
									</div>
									<span>Имущество</span>
									<strong>{money(total)}</strong>
								</div>
								<div className='card stat violet'>
									<div className='stat-icon'>
										<Icon name='layers' />
									</div>
									<span>Материалы</span>
									<strong>{money(stock)}</strong>
								</div>
								<div className='card stat ok'>
									<div className='stat-icon'>
										<Icon name='ruble' />
									</div>
									<span>Всего</span>
									<strong>{money(total + stock)}</strong>
								</div>
							</div>
							<p className='muted'>
								Оперативная стоимость, не официальный бухгалтерский баланс.
								Амортизация не рассчитывается.
							</p>
							<div className='cards' style={{ gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fill, minmax(420px, 1fr))' }}>
								{['locationId', 'category', 'responsible', 'scope'].map((key) => {
									const groups: Record<string, { count: number; sum: number }> = {}
									for (const a of active) {
										const label =
											key === 'locationId'
												? loc(a[key])
												: key === 'scope'
													? SCOPE[a.scope] || a.scope
													: a[key] || 'Не указан'
										groups[label] ??= { count: 0, sum: 0 }
										groups[label].count++
										groups[label].sum += Number(a.cost)
									}
									const rows = Object.entries(groups).sort((a, b) => b[1].sum - a[1].sum)
									const max = Math.max(1, ...rows.map(([, v]) => v.sum))
									return (
										<div className='card' key={key}>
											<h2>
												{
													(
														{
															locationId: 'По помещениям',
															category: 'По категориям',
															responsible: 'По ответственным',
															scope: 'По направлениям',
														} as any
													)[key]
												}
											</h2>
											{rows.map(([k, v]) => (
												<div className='bar-row' key={k}>
													<span>
														{k} <span className='muted'>· {v.count} шт.</span>
													</span>
													<b style={{ fontVariantNumeric: 'tabular-nums' }}>{money(v.sum)}</b>
													<div className='progress'>
														<span style={{ width: (v.sum / max) * 100 + '%' }} />
													</div>
												</div>
											))}
											{!rows.length && <p className='muted'>Нет данных</p>}
										</div>
									)
								})}
							</div>
							<div className='action-row'>
								<button onClick={() => window.print()}>
									<Icon name='printer' size={18} /> Печать отчёта / PDF
								</button>
							</div>
						</>
					)}
					{tab === 'excel' && (
						<>
							<div className='card'>
								<div className='card-head'>
									<div>
										<h2>Выгрузка</h2>
										<p className='muted' style={{ margin: 0 }}>
											Всё активное имущество в один файл XLSX.
										</p>
									</div>
									<a className='button secondary' href='/api/excel'>
										<Icon name='down' size={17} /> Выгрузить
									</a>
								</div>
							</div>
							{write && <ExcelImport reload={reload} />}
						</>
					)}
					{tab === 'audit' && (
						<>
							<div className='card'>
								<form className='toolbar' method='GET' action='/api/export' style={{ marginBottom: 0 }}>
									<input type='hidden' name='type' value='audit' />
									<label>
										С даты (UTC)
										<input name='from' type='date' />
									</label>
									<label>
										По дату (UTC)
										<input name='to' type='date' />
									</label>
									<button>
										<Icon name='down' size={17} /> Скачать журнал XLSX
									</button>
								</form>
							</div>
							<div className='toolbar'>
								<div className='search'>
									<Icon name='search' size={18} />
									<input
										type='search'
										placeholder='Поиск по действию или пользователю…'
										value={auditQuery}
										onChange={(e) => setAuditQuery(e.target.value)}
									/>
								</div>
								<span className='muted'>Последние 300 событий</span>
							</div>
							<div className='card'>
								<div className='feed'>
									{data.audit
										.filter((a: any) =>
											[actionLabel(a.action), person(a.userId)].some((s) =>
												s.toLowerCase().includes(auditQuery.toLowerCase()),
											),
										)
										.map((a: any) => {
											const obj =
												data.assets.find((x: any) => x.id === a.entityId) ||
												data.locations.find((x: any) => x.id === a.entityId)
											return (
												<div className='feed-item' key={a.id}>
													<div className='avatar sm'>{initials(person(a.userId))}</div>
													<div>
														<p>
															<b>{person(a.userId)}</b> · {actionLabel(a.action)}
															{obj && <> — {obj.name}</>}
														</p>
														<small>{date(a.createdAt)}</small>
														{a.details && Object.keys(a.details).length > 0 && (
															<details style={{ border: 0, padding: '4px 0 0' }}>
																<summary className='muted' style={{ fontSize: 12 }}>
																	Подробности
																</summary>
																<pre>{JSON.stringify(a.details, null, 2)}</pre>
															</details>
														)}
													</div>
												</div>
											)
										})}
								</div>
							</div>
						</>
					)}
					{tab === 'users' && admin && (
						<>
							<div className='toolbar'>
								<span className='spacer' />
								<button
									onClick={() =>
										edit('user', { role: 'OPERATOR', scope: 'IT', active: true })
									}
								>
									<Icon name='plus' size={18} /> Пользователь
								</button>
							</div>
							<div className='cards'>
								{data.users.map((u: any) => (
									<div className='card' key={u.id}>
										<div className='user-card' style={{ padding: 0, marginBottom: 8 }}>
											<div className='avatar'>{initials(u.name)}</div>
											<div>
												<b style={{ fontSize: 15 }}>{u.name}</b>
												<small>{u.email}</small>
											</div>
										</div>
										<div className='chips' style={{ marginTop: 4 }}>
											<span className='badge info plain'>{ROLE[u.role]}</span>
											<span className='badge plain'>{SCOPE[u.scope]}</span>
											<span className={'badge ' + (u.active ? 'ok' : 'bad')}>
												{u.active ? 'Активен' : 'Отключён'}
											</span>
											<span className={'badge ' + (u.totpEnabled ? 'ok' : 'plain')}>
												2FA {u.totpEnabled ? 'вкл.' : 'выкл.'}
											</span>
										</div>
										<p className='muted'>
											Доверенных устройств:{' '}
											{
												data.devices.filter(
													(d: any) => d.userId === u.id && d.status === 'APPROVED',
												).length
											}
										</p>
										<div className='toolbar' style={{ marginBottom: 0 }}>
											<button className='secondary sm' onClick={() => edit('user', u)}>
												Настроить доступ
											</button>
											{u.totpEnabled && (
												<button
													className='ghost sm'
													onClick={() =>
														confirm(
															'Сбросить 2FA пользователя? Используйте, если он потерял телефон.',
														) && fire('resetTotp', { id: u.id })
													}
												>
													Сбросить 2FA
												</button>
											)}
										</div>
									</div>
								))}
							</div>
						</>
					)}
					{tab === 'devices' && admin && <Devices data={data} act={act} />}
					{tab === 'security' && (
						<>
							<Security user={data.user} reload={reload} />
							<div className='card mobile-only' style={{ display: mobile ? 'block' : 'none' }}>
								<h2>Оформление</h2>
								{themeSwitch}
							</div>
						</>
					)}
					{tab === 'settings' && admin && (
						<SettingsEditor school={data.school} act={act} />
					)}
					{tab === 'operations' && <Operations data={data} act={act} />}
				</main>
			</div>
			<nav className='tabbar' aria-label='Навигация'>
				{MOBILE_TABS.slice(0, 2).map((k) => (
					<button
						key={k}
						className={tab === k ? 'active' : ''}
						onClick={() => setTab(k)}
					>
						<Icon name={icons[k]} size={23} />
						<span>{titles[k]}</span>
					</button>
				))}
				<button
					className='tab-scan'
					aria-label='Сканировать QR'
					onClick={() => setScan({ mode: 'open' })}
				>
					<span className='scan-circle'>
						<Icon name='scan' size={26} />
					</span>
					<span>Скан</span>
				</button>
				<button
					className={tab === 'stocktakes' ? 'active' : ''}
					onClick={() => setTab('stocktakes')}
				>
					<Icon name='clipboard' size={23} />
					<span>Проверка</span>
					{openStocktakes.length > 0 && (
						<span className='dot' style={{ background: 'var(--primary)' }}>
							{openStocktakes.length}
						</span>
					)}
				</button>
				<button
					className={!MOBILE_TABS.includes(tab) || more ? 'active' : ''}
					onClick={() => setMore(true)}
				>
					<Icon name='grid' size={23} />
					<span>Ещё</span>
					{admin && pendingDevices > 0 && <span className='dot'>{pendingDevices}</span>}
				</button>
			</nav>
			{more && (
				<div className='overlay' onClick={(e) => e.target === e.currentTarget && setMore(false)}>
					<section className='dialog' role='dialog' aria-label='Все разделы'>
						<div className='user-card' style={{ marginBottom: 12 }}>
							<div className='avatar'>{initials(data.user.name)}</div>
							<div>
								<b>{data.user.name}</b>
								<small>
									{ROLE[data.user.role]} · {data.school.name}
								</small>
							</div>
							<button
								className='ghost icon-btn'
								aria-label='Закрыть'
								onClick={() => setMore(false)}
							>
								<Icon name='x' />
							</button>
						</div>
						<div className='sheet-grid'>
							{visibleTabs
								.filter((k) => !MOBILE_TABS.includes(k))
								.map((k) => (
									<button
										key={k}
										className={tab === k ? 'active' : ''}
										onClick={() => setTab(k)}
									>
										<Icon name={icons[k]} size={22} />
										{titles[k]}
										{k === 'devices' && pendingDevices > 0 && (
											<span className='dot'>{pendingDevices}</span>
										)}
									</button>
								))}
						</div>
						<h3>Оформление</h3>
						{themeSwitch}
						<button className='danger' style={{ width: '100%', marginTop: 16 }} onClick={logout}>
							<Icon name='logout' size={18} /> Выйти
						</button>
					</section>
				</div>
			)}
			{modal && (
				<div className='overlay' onClick={(e) => e.target === e.currentTarget && !busy && setModal(null)}>
					<section className='dialog' role='dialog' aria-label={MODAL_TITLES[modal.type]}>
						<div className='dialog-head'>
							<h2>{MODAL_TITLES[modal.type]}</h2>
							<button
								className='ghost icon-btn'
								aria-label='Закрыть'
								onClick={() => setModal(null)}
							>
								<Icon name='x' />
							</button>
						</div>
						{error && (
							<p className='error' role='alert'>
								<Icon name='alert' size={18} /> {error}
							</p>
						)}
						<form
							onSubmit={
								modal.type === 'materialWriteoff'
									? (e) => {
											e.preventDefault()
											const quantity = Number(
												new FormData(e.currentTarget).get('quantity'),
											)
											edit('document', {
												kind: 'MATERIAL_WRITE_OFF',
												lines: [{ id: modal.data.lot.id, quantity }],
												number: `М-${Date.now().toString().slice(-6)}`,
											})
										}
									: save
							}
						>
							<div className='formgrid'>
								{modal.type === 'asset' && (
									<>
										{input('inventory', 'Инвентарный номер')}
										{input('name', 'Название')}
										{input(
											'category',
											'Категория',
											'text',
											(data.school.settings.categories || ['Техника']).map(
												(c: string) => ({ value: c, label: c }),
											),
										)}
										{scopeInput()}
										{input(
											'serial',
											'Серийный номер',
											'text',
											undefined,
											false,
										)}
										{input(
											'locationId',
											'Помещение',
											'text',
											modal.data.id
												? roomOptions.filter(
														(o) => o.value === modal.data.locationId,
													)
												: roomOptions,
										)}
										{input(
											'responsible',
											'Ответственный',
											'text',
											undefined,
											false,
										)}
										{input('cost', 'Стоимость', 'number')}
										{input('acquired', 'Дата поступления', 'date')}
										{input(
											'condition',
											'Состояние',
											'text',
											[
												'Исправно',
												'Неисправно',
												'Требует диагностики',
												'В ремонте',
											].map((v) => ({ value: v, label: v })),
										)}
										{input('notes', 'Примечание', 'textarea', undefined, false)}
										{(data.school.settings.fields || []).map((f: any) => (
											<label key={f.name}>
												{f.name}
												{f.type === 'checkbox' ? (
													<select
														name={'custom_' + f.name}
														defaultValue={String(
															modal.data.fields?.[f.name] || false,
														)}
													>
														<option value='false'>Нет</option>
														<option value='true'>Да</option>
													</select>
												) : (
													<input
														name={'custom_' + f.name}
														type={f.type}
														defaultValue={modal.data.fields?.[f.name] ?? ''}
													/>
												)}
											</label>
										))}
									</>
								)}
								{modal.type === 'location' && (
									<>
										{input('name', 'Название')}
										{input('building', 'Корпус')}
										{input('floor', 'Этаж')}
										{input('zone', 'Зона / стеллаж', 'text', undefined, false)}
										{input(
											'responsible',
											'Ответственный',
											'text',
											undefined,
											false,
										)}
									</>
								)}
								{modal.type === 'bulkMove' && (
									<>
										{input('locationId', 'Куда', 'text', roomOptions)}
										{input('reason', 'Основание перемещения')}
									</>
								)}
								{modal.type === 'move' && (
									<>
										{input('locationId', 'Куда', 'text', roomOptions)}
										{input(
											'responsible',
											'Ответственный',
											'text',
											undefined,
											false,
										)}
										{input('reason', 'Причина')}
									</>
								)}
								{modal.type === 'material' && (
									<>
										{input('name', 'Название')}
										{input('category', 'Категория', 'text', undefined, false)}
										{scopeInput()}
										{input('unit', 'Единица измерения')}
										{input('minimum', 'Минимальный остаток', 'number')}
									</>
								)}
								{modal.type === 'receive' && (
									<>
										{input('locationId', 'Место хранения', 'text', roomOptions)}
										{input('quantity', 'Количество', 'number')}
										{input('price', 'Цена за единицу', 'number')}
									</>
								)}
								{modal.type === 'transferLot' && (
									<>
										{input('locationId', 'Куда', 'text', roomOptions)}
										{input('quantity', 'Количество', 'number')}
										{input('reason', 'Основание / причина')}
									</>
								)}
								{modal.type === 'materialWriteoff' &&
									input('quantity', 'Количество', 'number')}
								{modal.type === 'document' && (
									<>
										<p>Строк в акте: {modal.data.lines.length}</p>
										{input('number', 'Номер акта')}
										{input('date', 'Дата акта', 'date')}
										{input('reason', 'Основание списания', 'textarea')}
										{input(
											'commission',
											'Комиссия',
											'textarea',
											undefined,
											false,
										)}
									</>
								)}
								{modal.type === 'stocktake' && (
									<>
										{input('name', 'Название проверки')}
										{scopeInput()}
										{input(
											'locationId',
											'Помещение',
											'text',
											[{ value: '', label: 'Все помещения' }, ...roomOptions],
											false,
										)}
									</>
								)}
								{modal.type === 'check' &&
									input('locationId', 'Где обнаружено', 'text', roomOptions)}
								{modal.type === 'user' && (
									<>
										{input('name', 'Имя')}
										{input('email', 'Email', 'email')}
										{input(
											'password',
											modal.data.id
												? 'Новый пароль (пусто — не менять)'
												: 'Пароль — минимум 14 символов',
											'password',
											undefined,
											!modal.data.id,
										)}
										{input('role', 'Роль', 'text', [
											{ value: 'ADMIN', label: 'Администратор' },
											{ value: 'OPERATOR', label: 'Оператор' },
											{ value: 'VIEWER', label: 'Просмотр' },
										])}
										{input('scope', 'Доступ', 'text', [
											{ value: 'ALL', label: 'Все направления' },
											...scopes,
										])}
										{input('active', 'Состояние', 'text', [
											{ value: 'true', label: 'Активен' },
											{ value: 'false', label: 'Отключён' },
										])}
									</>
								)}
							</div>
							<footer>
								<button disabled={busy}>
									{busy
										? 'Сохранение…'
										: modal.type === 'document'
											? 'Создать черновик'
											: modal.type === 'materialWriteoff'
												? 'Далее'
												: 'Сохранить'}
								</button>
								<button
									type='button'
									className='secondary'
									onClick={() => setModal(null)}
								>
									Отмена
								</button>
							</footer>
						</form>
					</section>
				</div>
			)}
			{detail && !modal && (
				<div className='overlay' onClick={(e) => e.target === e.currentTarget && setDetailId('')}>
					<section className='dialog' role='dialog' aria-label={detail.name}>
						<div className='detail-head'>
							<div className='d-icon'>
								<Icon name='box' size={24} />
							</div>
							<div>
								<h2>{detail.name}</h2>
								<div className='chips'>
									<span className='chip'>{detail.inventory}</span>
									{detail.status === 'ACTIVE' ? (
										conditionBadge(detail.condition)
									) : (
										<span className='badge plain'>Списан</span>
									)}
								</div>
							</div>
							<button
								className='ghost icon-btn'
								aria-label='Закрыть'
								onClick={() => setDetailId('')}
							>
								<Icon name='x' />
							</button>
						</div>
						<dl className='kv'>
							<div>
								<dt>Помещение</dt>
								<dd>{loc(detail.locationId)}</dd>
							</div>
							<div>
								<dt>Стоимость</dt>
								<dd>{money(detail.cost)}</dd>
							</div>
							<div>
								<dt>Ответственный</dt>
								<dd>{detail.responsible || '—'}</dd>
							</div>
							<div>
								<dt>Категория</dt>
								<dd>{detail.category}</dd>
							</div>
							<div>
								<dt>Серийный номер</dt>
								<dd>{detail.serial || '—'}</dd>
							</div>
							<div>
								<dt>Поступление</dt>
								<dd>{detail.acquired ? day(detail.acquired) : '—'}</dd>
							</div>
							{Object.entries(detail.fields || {})
								.filter(([, v]) => v !== '' && v !== null && v !== undefined)
								.map(([k, v]) => (
									<div key={k}>
										<dt>{k}</dt>
										<dd>{typeof v === 'boolean' ? (v ? 'Да' : 'Нет') : String(v)}</dd>
									</div>
								))}
							{detail.notes && (
								<div className='wide'>
									<dt>Примечание</dt>
									<dd style={{ fontWeight: 400, whiteSpace: 'pre-wrap' }}>{detail.notes}</dd>
								</div>
							)}
						</dl>
						{write &&
							data.stocktakes
								.filter(
									(s: any) =>
										s.status === 'OPEN' &&
										s.snapshot.some((x: any) => x.id === detail.id),
								)
								.map((s: any) => (
									<div className='card stocktake-quick' key={s.id}>
										<b>Инвентаризация «{s.name}»</b>
										<p className='muted'>
											{s.results[detail.id]
												? 'Уже отмечен: ' +
													(s.results[detail.id].status === 'MISSING'
														? 'не найдено'
														: loc(s.results[detail.id].locationId))
												: 'Ещё не проверен'}
										</p>
										<div className='toolbar' style={{ marginBottom: 0 }}>
											<button
												disabled={busy}
												onClick={() =>
													fire('check', {
														id: s.id,
														assetId: detail.id,
														locationId: detail.locationId,
													})
												}
											>
												<Icon name='check' size={18} /> На месте ({loc(detail.locationId)})
											</button>
											<button
												className='secondary'
												onClick={() =>
													edit('check', {
														id: s.id,
														assetId: detail.id,
														locationId: detail.locationId,
													})
												}
											>
												В другом помещении…
											</button>
										</div>
									</div>
								))}
						<div className='action-row'>
							<button
								onClick={() => {
									setDetailId('')
									setScan({ mode: 'open' })
								}}
							>
								<Icon name='scan' size={18} /> Сканировать следующий
							</button>
							{write && detail.status === 'ACTIVE' && (
								<>
									<button
										className='secondary'
										onClick={() =>
											edit('asset', { ...detail, acquired: detail.acquired.slice(0, 10) })
										}
									>
										<Icon name='edit' size={17} /> Изменить
									</button>
									<button
										className='secondary'
										onClick={() =>
											edit('move', {
												id: detail.id,
												locationId: detail.locationId,
												responsible: detail.responsible,
											})
										}
									>
										<Icon name='move' size={17} /> Переместить
									</button>
								</>
							)}
							<a className='button secondary' target='_blank' href={`/labels/${detail.id}`}>
								<Icon name='qr' size={17} /> QR-этикетка
							</a>
							{write && (
								<button
									className='ghost'
									onClick={() =>
										confirm(
											'Перевыпустить QR? Старая наклейка перестанет работать, нужно будет напечатать новую.',
										) && fire('reissueQr', { ids: [detail.id] })
									}
								>
									Перевыпустить QR
								</button>
							)}
						</div>
						<Attachments type='asset' id={detail.id} write={write} />
						<h3>История</h3>
						<div className='timeline'>
							{data.audit
								.filter((a: any) => a.entityId === detail.id || a.details?.assetId === detail.id)
								.map((a: any) => (
									<details key={a.id}>
										<summary>
											{actionLabel(a.action)}
											<small>
												{date(a.createdAt)} · {person(a.userId)}
											</small>
										</summary>
										<pre>{JSON.stringify(a.details, null, 2)}</pre>
									</details>
								))}
							{!data.audit.some(
								(a: any) => a.entityId === detail.id || a.details?.assetId === detail.id,
							) && <p className='muted'>Нет событий в последних 300 записях журнала</p>}
						</div>
					</section>
				</div>
			)}
			{scan && (
				<Scanner
					onResult={onScan}
					onClose={() => setScan(null)}
					continuous={scan.mode === 'stocktake'}
				>
					{scan.mode === 'stocktake' &&
						(() => {
							const s = data.stocktakes.find((x: any) => x.id === scan.id)
							if (!s) return null
							const c = stStats(s)
							return (
								<div className='stocktake-bar'>
									<div className='card-head' style={{ marginBottom: 0 }}>
										<b>{s.name}</b>
										<span className='muted'>
											{c.done} / {c.total}
										</span>
									</div>
									<div className='progress' style={{ margin: '8px 0 4px' }}>
										<span className='ok' style={{ width: pct(c.ok, c.total) }} />
										<span className='warn' style={{ width: pct(c.moved, c.total) }} />
										<span className='bad' style={{ width: pct(c.missing, c.total) }} />
									</div>
									<label>
										Я нахожусь в помещении
										<select value={scanRoom} onChange={(e) => setScanRoom(e.target.value)}>
											{roomOptions.map((o) => (
												<option key={o.value} value={o.value}>
													{o.label}
												</option>
											))}
										</select>
									</label>
								</div>
							)
						})()}
				</Scanner>
			)}
			<div className='toasts' aria-live='polite'>
				{toasts.map((t) => (
					<div
						key={t.id}
						className={'toast' + (t.kind === 'error' ? ' error' : '')}
						role={t.kind === 'error' ? 'alert' : 'status'}
					>
						<Icon name={t.kind === 'error' ? 'alert' : 'check'} size={18} />
						<span>{t.text}</span>
						<button
							aria-label='Скрыть'
							onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
						>
							<Icon name='x' size={16} />
						</button>
					</div>
				))}
			</div>
		</div>
	)
}
