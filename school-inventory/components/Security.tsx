'use client'
import { useState } from 'react'
import InstallButton from './InstallButton'
import { PasskeyCard } from './Passkey'
/** Раздел «Безопасность»: двухфакторная аутентификация текущего пользователя. */
export default function Security({
	user,
	reload,
}: {
	user: { email: string; totpEnabled: boolean; role: string }
	reload: () => Promise<void>
}) {
	const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(
			null,
		),
		[code, setCode] = useState(''),
		[msg, setMsg] = useState(''),
		[err, setErr] = useState('')
	async function call(step: string) {
		setErr('')
		setMsg('')
		const r = await fetch('/api/totp', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ step, code }),
		})
		const j = await r.json()
		if (!r.ok) throw new Error(j.error)
		return j
	}
	return (
		<div className='cards'>
			<PasskeyCard />
			<div className='card'>
				<h2>Двухфакторная аутентификация</h2>
				<p>
					Статус:{' '}
					<b>{user.totpEnabled ? 'включена' : 'выключена'}</b>
					{!user.totpEnabled && user.role === 'ADMIN' && (
						<span className='warn'> — администратору рекомендуется включить</span>
					)}
				</p>
				<p className='muted'>
					При входе дополнительно запрашивается 6-значный код из приложения
					Яндекс Ключ, Google Authenticator, Aegis, 2FAS и т.п.
				</p>
				{!user.totpEnabled && !setup && (
					<button
						onClick={() => call('start').then(setSetup).catch((e) => setErr(e.message))}
					>
						Включить 2FA
					</button>
				)}
				{setup && (
					<>
						<p>1. Отсканируйте QR в приложении-аутентификаторе:</p>
						<img src={setup.qr} width={200} height={200} alt='QR для 2FA' />
						<p className='muted'>
							Или введите ключ вручную: <code>{setup.secret}</code>
						</p>
						<p>2. Введите код из приложения:</p>
					</>
				)}
				{(setup || user.totpEnabled) && (
					<form
						className='toolbar'
						onSubmit={async (e) => {
							e.preventDefault()
							try {
								await call(setup ? 'confirm' : 'disable')
								setSetup(null)
								setCode('')
								setMsg(setup ? '2FA включена' : '2FA отключена')
								await reload()
							} catch (e: any) {
								setErr(e.message)
							}
						}}
					>
						<input
							value={code}
							onChange={(e) => setCode(e.target.value)}
							inputMode='numeric'
							autoComplete='one-time-code'
							placeholder='123456'
							maxLength={7}
							required
						/>
						<button className={setup ? '' : 'secondary'}>
							{setup ? 'Подтвердить' : 'Отключить 2FA'}
						</button>
					</form>
				)}
				{msg && <p>{msg}</p>}
				{err && <p className='error'>{err}</p>}
			</div>
			<div className='card'>
				<h2>Это устройство</h2>
				<p className='muted'>
					Вход разрешён только с устройств, подтверждённых администратором.
					Если устройство потеряно — попросите администратора отключить его в
					разделе «Устройства».
				</p>
				<InstallButton />
			</div>
		</div>
	)
}
