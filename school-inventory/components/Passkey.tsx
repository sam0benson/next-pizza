'use client'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { useEffect, useState } from 'react'
import Icon from './Icons'

/** Как называется биометрия на этом устройстве (для подписей). */
export function bio() {
	if (typeof navigator === 'undefined')
		return { name: 'Face ID', by: 'по Face ID', icon: 'faceId' }
	const ua = navigator.userAgent
	const ios =
		/iPhone|iPad|iPod/.test(ua) ||
		(/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
	if (ios) return { name: 'Face ID', by: 'по Face ID', icon: 'faceId' }
	if (/Macintosh/.test(ua))
		return { name: 'Touch ID', by: 'по Touch ID', icon: 'fingerprint' }
	if (/Android/.test(ua))
		return { name: 'отпечаток', by: 'по отпечатку', icon: 'fingerprint' }
	if (/Windows/.test(ua))
		return { name: 'Windows Hello', by: 'через Windows Hello', icon: 'faceId' }
	return { name: 'биометрия', by: 'по биометрии', icon: 'fingerprint' }
}

/** Есть ли встроенный сканер лица/отпечатка, пригодный для WebAuthn. */
export async function platformAvailable() {
	try {
		return (
			typeof window !== 'undefined' &&
			!!window.PublicKeyCredential &&
			(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
		)
	} catch {
		return false
	}
}

async function api(body: any) {
	const r = await fetch('/api/passkey', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})
	const j = await r.json().catch(() => ({}))
	if (!r.ok) throw new Error(j.error || 'Ошибка')
	return j
}
function friendly(e: any) {
	if (e?.name === 'NotAllowedError' || e?.name === 'AbortError')
		return 'Отменено или время ожидания истекло'
	if (e?.name === 'InvalidStateError')
		return 'На этом устройстве уже включено'
	return e?.message || 'Ошибка'
}

export async function passkeyStatus() {
	try {
		return !!(await api({ step: 'status' })).available
	} catch {
		return false
	}
}
export async function passkeyLogin() {
	try {
		const optionsJSON = await api({ step: 'login-options' })
		const response = await startAuthentication({ optionsJSON })
		await api({ step: 'login', response })
	} catch (e) {
		throw new Error(friendly(e))
	}
}
export async function passkeyEnable() {
	try {
		const optionsJSON = await api({ step: 'register-options' })
		const response = await startRegistration({ optionsJSON })
		await api({ step: 'register', response })
		try {
			localStorage.removeItem('pk-offer')
		} catch {}
	} catch (e) {
		throw new Error(friendly(e))
	}
}

type Key = {
	id: string
	name: string
	createdAt: string
	lastUsed: string | null
	thisDevice: boolean
}
function useKeys() {
	const [state, set] = useState<{ thisDevice: boolean; keys: Key[] } | null>(
		null,
	)
	const load = () =>
		api({ step: 'list' })
			.then(set)
			.catch(() => set({ thisDevice: false, keys: [] }))
	useEffect(() => {
		load()
	}, [])
	return [state, load] as const
}

/** Предложение включить вход по Face ID сразу после входа по паролю (телефон/планшет). */
export function PasskeyOffer({
	notify,
}: {
	notify: (t: string, k?: 'ok' | 'error') => void
}) {
	const [show, setShow] = useState(false),
		[busy, setBusy] = useState(false)
	const b = bio()
	useEffect(() => {
		;(async () => {
			try {
				if (localStorage.getItem('pk-offer') !== '1') return
				const touch = matchMedia('(pointer: coarse)').matches
				if (!touch || !(await platformAvailable())) return
				const j = await api({ step: 'list' })
				if (!j.thisDevice) setShow(true)
				else localStorage.removeItem('pk-offer')
			} catch {}
		})()
	}, [])
	if (!show) return null
	const close = () => {
		try {
			localStorage.removeItem('pk-offer')
		} catch {}
		setShow(false)
	}
	return (
		<div className='card pk-offer'>
			<div className='pk-offer-icon'>
				<Icon name={b.icon} size={26} />
			</div>
			<div style={{ flex: 1, minWidth: 0 }}>
				<h3 style={{ margin: '0 0 4px' }}>Входить {b.by}?</h3>
				<p className='muted' style={{ margin: 0 }}>
					Без пароля и кода из приложения — только на этом устройстве.
				</p>
				<div className='toolbar' style={{ marginTop: 12 }}>
					<button
						disabled={busy}
						onClick={async () => {
							setBusy(true)
							try {
								await passkeyEnable()
								notify(`Вход ${b.by} включён`)
								close()
							} catch (e: any) {
								notify(e.message, 'error')
							} finally {
								setBusy(false)
							}
						}}
					>
						Включить
					</button>
					<button className='secondary' onClick={close}>
						Не сейчас
					</button>
				</div>
			</div>
		</div>
	)
}

/** Карточка в разделе «Безопасность». */
export function PasskeyCard() {
	const [state, load] = useKeys(),
		[avail, setAvail] = useState<boolean | null>(null),
		[busy, setBusy] = useState(false),
		[msg, setMsg] = useState(''),
		[err, setErr] = useState('')
	const b = bio()
	useEffect(() => {
		platformAvailable().then(setAvail)
	}, [])
	const run = async (f: () => Promise<any>, ok: string) => {
		setBusy(true)
		setErr('')
		setMsg('')
		try {
			await f()
			setMsg(ok)
			await load()
		} catch (e: any) {
			setErr(e.message)
		} finally {
			setBusy(false)
		}
	}
	const mine = state?.keys.find((k) => k.thisDevice)
	return (
		<div className='card'>
			<h2>Вход {b.by}</h2>
			<p className='muted'>
				Вход одним взглядом или касанием — без пароля и кода из приложения.
				Работает только на доверенном устройстве, где его включили. На
				остальных устройствах вход по-прежнему по паролю и коду.
			</p>
			<p>
				Это устройство:{' '}
				<b>
					{state === null
						? '…'
						: mine
							? 'включено'
							: avail === false
								? 'не поддерживается'
								: 'выключено'}
				</b>
			</p>
			{state && !mine && avail && (
				<button
					disabled={busy}
					onClick={() => run(passkeyEnable, `Вход ${b.by} включён`)}
				>
					<Icon name={b.icon} size={18} /> Включить вход {b.by}
				</button>
			)}
			{state && !mine && avail === false && (
				<p className='muted'>
					В этом браузере нет Face ID, Touch ID, отпечатка или Windows Hello —
					входите по паролю и коду.
				</p>
			)}
			{!!state?.keys.length && (
				<div className='pk-list'>
					{state.keys.map((k) => (
						<div className='pk-row' key={k.id}>
							<Icon name='phone' size={18} />
							<div style={{ flex: 1, minWidth: 0 }}>
								<b>{k.name || 'Устройство'}</b>
								{k.thisDevice && <span className='badge ok'>это устройство</span>}
								<div className='muted' style={{ fontSize: 13 }}>
									Добавлено {new Date(k.createdAt).toLocaleDateString('ru-RU')}
									{k.lastUsed &&
										` · вход ${new Date(k.lastUsed).toLocaleString('ru-RU')}`}
								</div>
							</div>
							<button
								className='ghost icon-btn'
								aria-label='Отключить'
								title='Отключить'
								disabled={busy}
								onClick={() =>
									confirm(`Отключить вход без пароля на устройстве «${k.name || 'Устройство'}»?`) &&
									run(() => api({ step: 'delete', id: k.id }), 'Отключено')
								}
							>
								<Icon name='trash' size={18} />
							</button>
						</div>
					))}
				</div>
			)}
			{msg && <p className='notice'>{msg}</p>}
			{err && <p className='error'>{err}</p>}
		</div>
	)
}
