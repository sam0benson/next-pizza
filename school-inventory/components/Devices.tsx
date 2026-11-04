'use client'
const date = (v: string) => new Date(v).toLocaleString('ru-RU')
const statusName: Record<string, string> = {
	PENDING: 'Ждёт подтверждения',
	APPROVED: 'Доверенное',
	REVOKED: 'Заблокировано',
}
/** Раздел администратора: заявки и доверенные устройства. */
export default function Devices({
	data,
	act,
}: {
	data: any
	act: (action: string, d: any) => Promise<any>
}) {
	const userName = (id: string) => {
		const u = data.users.find((x: any) => x.id === id)
		return u ? `${u.name} (${u.email})` : id
	}
	const run = (action: string, d: any) => act(action, d).catch(() => {})
	const groups = ['PENDING', 'APPROVED', 'REVOKED']
	return (
		<>
			<p className='muted'>
				Вход возможен только с подтверждённых устройств. Подтверждайте заявку,
				только если пользователь лично или по телефону назвал вам тот же код.
			</p>
			{groups.map((g) => {
				const list = data.devices.filter((d: any) => d.status === g)
				if (!list.length) return null
				return (
					<section key={g}>
						<h2>
							{statusName[g]} · {list.length}
						</h2>
						<div className='cards'>
							{list.map((d: any) => (
								<div className='card' key={d.id}>
									<h3>
										{d.name || 'Устройство'}
										{!!d.passkeys?.length && (
											<span className='badge info' style={{ marginLeft: 8 }}>
												вход без пароля
											</span>
										)}
									</h3>
									<p>{userName(d.userId)}</p>
									<p className='muted'>
										IP {d.ip || '—'} · создано {date(d.createdAt)}
										<br />
										Активность: {date(d.lastSeen)}
									</p>
									<details>
										<summary className='muted'>User-Agent</summary>
										<small>{d.userAgent}</small>
									</details>
									{g === 'PENDING' && (
										<form
											className='toolbar'
											onSubmit={(e) => {
												e.preventDefault()
												const code = new FormData(e.currentTarget).get('code')
												run('approveDevice', { id: d.id, code })
											}}
										>
											<input
												name='code'
												placeholder='Код с экрана, XXXX-XXXX'
												autoComplete='off'
												required
											/>
											<button>Подтвердить</button>
										</form>
									)}
									<div className='toolbar'>
										{g !== 'REVOKED' && (
											<button
												className='secondary'
												onClick={() =>
													confirm('Заблокировать устройство и завершить его сессии?') &&
													run('revokeDevice', { id: d.id })
												}
											>
												{g === 'PENDING' ? 'Отклонить' : 'Заблокировать'}
											</button>
										)}
										{g !== 'APPROVED' && (
											<button
												className='secondary'
												onClick={() =>
													confirm('Удалить запись? Устройство сможет подать заявку снова.') &&
													run('deleteDevice', { id: d.id })
												}
											>
												Удалить
											</button>
										)}
									</div>
								</div>
							))}
						</div>
					</section>
				)
			})}
			{!data.devices.length && <p>Устройств пока нет.</p>}
		</>
	)
}
