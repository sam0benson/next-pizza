'use client'
import { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import InstallButton from './InstallButton'
import { bio, passkeyLogin, passkeyStatus } from './Passkey'
export default function Login() {
	const [error, setError] = useState(''),
		[needCode, setNeedCode] = useState(false),
		[pending, setPending] = useState(''),
		[busy, setBusy] = useState(false),
		[show, setShow] = useState(false),
		[pk, setPk] = useState(false),
		[pkBusy, setPkBusy] = useState(false)
	const b = bio()
	useEffect(() => {
		if (typeof window !== 'undefined' && window.PublicKeyCredential)
			passkeyStatus().then(setPk)
	}, [])
	async function faceLogin() {
		setPkBusy(true)
		setError('')
		try {
			await passkeyLogin()
			location.reload()
		} catch (e: any) {
			setError(e.message)
			setPkBusy(false)
		}
	}
	// Предложить включить Face ID после обычного входа
	const markOffer = () => {
		try {
			localStorage.setItem('pk-offer', '1')
		} catch {}
	}
	const creds = useRef<Record<string, string>>({})
	useEffect(() => {
		if (!pending) return
		const t = setInterval(async () => {
			try {
				const r = await fetch('/api/device', { method: 'POST' })
				const j = await r.json()
				if (j.ok) {
					markOffer()
					location.reload()
				} else if (!j.pending) {
					setPending('')
					setError(j.error || 'Время ожидания истекло, войдите заново')
				}
			} catch {}
		}, 4000)
		return () => clearInterval(t)
	}, [pending])
	if (pending)
		return (
			<main className='login'>
				<div className='card'>
					<div className='brand'>ШИ</div>
					<h1>Новое устройство</h1>
					<p className='muted'>
						Пароль верный, но это устройство ещё не доверенное. Сообщите
						администратору код ниже — он подтвердит устройство в разделе
						«Устройства». Вход завершится автоматически.
					</p>
					<p className='device-code'>{pending}</p>
					<p className='muted'>
						Не сообщайте код посторонним. Если вы не пытались войти — смените
						пароль.
					</p>
					<button className='secondary' onClick={() => setPending('')}>
						Назад
					</button>
				</div>
			</main>
		)
	return (
		<main className='login'>
			<form
				className='card'
				onSubmit={async (e) => {
					e.preventDefault()
					const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<
						string,
						string
					>
					creds.current = { ...creds.current, ...f }
					setBusy(true)
					try {
						const r = await fetch('/api/login', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(creds.current),
						})
						const j = await r.json()
						if (j.ok) {
							markOffer()
							location.reload()
						}
						else if (j.pending) {
							creds.current = {}
							setPending(j.code)
							setError('')
						} else {
							if (j.needCode) setNeedCode(true)
							setError(j.error)
						}
					} catch {
						setError('Нет соединения с сервером')
					} finally {
						setBusy(false)
					}
				}}
			>
				<div className='brand'>ШИ</div>
				<h1>Школьный инвентарь</h1>
				<p className='muted'>
					Имущество, материалы и помещения — в одной системе.
				</p>
				{pk && !needCode && (
					<>
						<button
							type='button'
							className='pk-login'
							disabled={pkBusy}
							onClick={faceLogin}
						>
							<Icon name={b.icon} size={24} />
							{pkBusy ? 'Проверка…' : `Войти ${b.by}`}
						</button>
						<div className='login-or'>или по паролю</div>
					</>
				)}
				{!needCode ? (
					<>
						<label>
							Email
							<input
								name='email'
								type='email'
								autoComplete='username'
								required
							/>
						</label>
						<label>
							Пароль
							<span style={{ position: 'relative', display: 'block' }}>
								<input
									name='password'
									type={show ? 'text' : 'password'}
									autoComplete='current-password'
									required
									style={{ paddingRight: 48 }}
								/>
								<button
									type='button'
									className='ghost icon-btn'
									aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
									onClick={() => setShow(!show)}
									style={{
										position: 'absolute',
										right: 2,
										top: 8,
										width: 40,
										minHeight: 38,
										margin: 0,
									}}
								>
									<Icon name={show ? 'eyeOff' : 'eye'} size={19} />
								</button>
							</span>
						</label>
					</>
				) : (
					<label>
						Код из приложения-аутентификатора
						<input
							name='code'
							inputMode='numeric'
							autoComplete='one-time-code'
							pattern='[0-9 ]{6,7}'
							maxLength={7}
							autoFocus
							required
						/>
					</label>
				)}
				{error && <p className='error'>{error}</p>}
				<button disabled={busy} className={pk && !needCode ? 'secondary' : ''}>
					{needCode ? 'Подтвердить' : 'Войти'}
				</button>
				{needCode && (
					<button
						type='button'
						className='secondary'
						onClick={() => {
							setNeedCode(false)
							creds.current = {}
							setError('')
						}}
					>
						Назад
					</button>
				)}
				<InstallButton />
				<p className='muted' style={{ fontSize: 12, textAlign: 'center', marginTop: 18 }}>
					Вход только для сотрудников школы. Новое устройство подтверждает
					администратор.
				</p>
			</form>
		</main>
	)
}
