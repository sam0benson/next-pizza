'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const MIN_ZOOM = 1
const MAX_ZOOM = 5

type Point = [number, number]

type Region = {
	locationId: string
	kind?: 'polygon' | 'marker'
	points: Point[]
}

type Mode = 'polygon' | 'rectangle' | 'marker'

type Props = {
	data: any
	act: (action: string, data: any) => Promise<any>
	reload: () => Promise<void>
	openRoom: (id: string) => void
}

export default function MapEditor({ data, act, reload, openRoom }: Props) {
	const [planId, setPlanId] = useState('')
	const [editing, setEditing] = useState(false)
	const [mode, setMode] = useState<Mode>('polygon')

	const [roomId, setRoomId] = useState('')
	const [points, setPoints] = useState<Point[]>([])
	const [draft, setDraft] = useState<Region[] | null>(null)
	const [draftName, setDraftName] = useState<string | null>(null)

	const [zoom, setZoom] = useState(1)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')

	// Масштаб карты: кнопки, щипок двумя пальцами, ctrl/⌘ + колесо (трекпад)
	const viewport = useRef<HTMLDivElement>(null)
	const zoomRef = useRef(1)
	zoomRef.current = zoom
	const anchor = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null)
	const pinching = useRef(false)
	const pendingTouch = useRef<{ id: number; point: Point; x: number; y: number } | null>(null)
	function zoomTo(value: number, clientX?: number, clientY?: number) {
		const next = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)) * 100) / 100
		const el = viewport.current
		if (el) {
			const r = el.getBoundingClientRect()
			const cx = (clientX ?? r.left + r.width / 2) - r.left,
				cy = (clientY ?? r.top + r.height / 2) - r.top
			anchor.current = {
				fx: (el.scrollLeft + cx) / el.scrollWidth,
				fy: (el.scrollTop + cy) / el.scrollHeight,
				cx,
				cy,
			}
		}
		setZoom(next)
	}
	useLayoutEffect(() => {
		const a = anchor.current,
			el = viewport.current
		if (!a || !el) return
		el.scrollLeft = a.fx * el.scrollWidth - a.cx
		el.scrollTop = a.fy * el.scrollHeight - a.cy
		anchor.current = null
	}, [zoom])

	const drag = useRef<{
		regionIndex: number
		pointIndex: number
	} | null>(null)

	const plan = data.plans.find((p: any) => p.id === planId) ?? data.plans[0]

	useEffect(() => {
		const el = viewport.current
		if (!el) return
		let start: { d: number; z: number } | null = null
		const dist = (t: TouchList) =>
			Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
		const onStart = (e: TouchEvent) => {
			if (e.touches.length === 2) {
				start = { d: dist(e.touches) || 1, z: zoomRef.current }
				pinching.current = true
				pendingTouch.current = null
			}
		}
		const onMove = (e: TouchEvent) => {
			if (!start || e.touches.length !== 2) return
			e.preventDefault()
			const t = e.touches
			zoomTo(
				(start.z * dist(t)) / start.d,
				(t[0].clientX + t[1].clientX) / 2,
				(t[0].clientY + t[1].clientY) / 2,
			)
		}
		const onEnd = (e: TouchEvent) => {
			if (e.touches.length < 2) start = null
			if (e.touches.length === 0) setTimeout(() => (pinching.current = false), 80)
		}
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey && !e.metaKey) return
			e.preventDefault()
			zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
		}
		el.addEventListener('touchstart', onStart, { passive: true })
		el.addEventListener('touchmove', onMove, { passive: false })
		el.addEventListener('touchend', onEnd)
		el.addEventListener('touchcancel', onEnd)
		el.addEventListener('wheel', onWheel, { passive: false })
		return () => {
			el.removeEventListener('touchstart', onStart)
			el.removeEventListener('touchmove', onMove)
			el.removeEventListener('touchend', onEnd)
			el.removeEventListener('touchcancel', onEnd)
			el.removeEventListener('wheel', onWheel)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [plan?.id])

	const regions: Region[] = draft ?? plan?.regions ?? []
	const dirty = draft !== null || draftName !== null
	const admin = data.user.role === 'ADMIN'

	function roomName(id: string) {
		return (
			data.locations.find((location: any) => location.id === id)?.name ??
			'Помещение'
		)
	}

	function eventPoint(event: React.PointerEvent<SVGSVGElement>): Point {
		const bounds = event.currentTarget.getBoundingClientRect()

		return [
			Math.max(
				0,
				Math.min(1000, ((event.clientX - bounds.left) / bounds.width) * 1000),
			),
			Math.max(
				0,
				Math.min(1000, ((event.clientY - bounds.top) / bounds.height) * 1000),
			),
		]
	}

	function addRegion(
		newPoints: Point[],
		kind: 'polygon' | 'marker' = 'polygon',
	) {
		setDraft([
			...regions.filter((region) => region.locationId !== roomId),
			{
				locationId: roomId,
				kind,
				points: newPoints,
			},
		])

		setPoints([])
	}

	function changePlan(id: string) {
		if (
			(dirty || points.length > 0) &&
			!confirm('Отменить несохранённые изменения карты?')
		) {
			return
		}

		setPlanId(id)
		setDraft(null)
		setDraftName(null)
		setPoints([])
		setRoomId('')
		setZoom(1)
		setError('')
	}

	async function save() {
		if (!plan) return

		setBusy(true)
		setError('')

		try {
			await act('plan', {
				id: plan.id,
				name: draftName ?? plan.name,
				regions,
			})

			setDraft(null)
			setDraftName(null)
		} catch (error: any) {
			setError(error.message ?? 'Не удалось сохранить карту')
		} finally {
			setBusy(false)
		}
	}

	async function upload(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()

		const form = event.currentTarget
		const body = new FormData(form)

		setBusy(true)
		setError('')

		try {
			const response = await fetch('/api/plans', {
				method: 'POST',
				body,
			})

			const result = await response.json()

			if (!response.ok) {
				throw new Error(result.error ?? 'Ошибка загрузки')
			}

			await reload()

			setPlanId(result.id)
			setDraft(null)
			setDraftName(null)
			setPoints([])
			setRoomId('')
			setZoom(1)

			form.reset()
		} catch (error: any) {
			setError(error.message ?? 'Не удалось загрузить план')
		} finally {
			setBusy(false)
		}
	}

	function pointerDown(event: React.PointerEvent<SVGSVGElement>) {
		if (!editing || !roomId || drag.current || busy) return
		if (!event.isPrimary || pinching.current) {
			pendingTouch.current = null
			return
		}

		const point = eventPoint(event)
		// Касание пальцем ставит точку только при отпускании — чтобы щипок не добавлял лишних точек
		if (event.pointerType === 'touch') {
			pendingTouch.current = {
				id: event.pointerId,
				point,
				x: event.clientX,
				y: event.clientY,
			}
			return
		}
		applyPoint(point)
	}

	function pointerUp(event: React.PointerEvent<SVGSVGElement>) {
		const p = pendingTouch.current
		pendingTouch.current = null
		if (
			p &&
			p.id === event.pointerId &&
			!pinching.current &&
			Math.hypot(event.clientX - p.x, event.clientY - p.y) < 12
		)
			applyPoint(p.point)
		finishDrag(event)
	}

	function applyPoint(point: Point) {

		if (mode === 'marker') {
			addRegion([point], 'marker')
			return
		}

		if (mode === 'rectangle' && points.length === 1) {
			const first = points[0]

			if (
				Math.abs(first[0] - point[0]) < 2 ||
				Math.abs(first[1] - point[1]) < 2
			) {
				setError('Прямоугольник слишком маленький')
				return
			}

			addRegion([first, [point[0], first[1]], point, [first[0], point[1]]])

			setError('')
			return
		}

		if (points.length >= 100) {
			setError('В одной области допускается до 100 точек')
			return
		}

		setPoints((previous) => [...previous, point])
	}

	function pointerMove(event: React.PointerEvent<SVGSVGElement>) {
		const currentDrag = drag.current
		if (!currentDrag) return

		const point = eventPoint(event)

		setDraft((previous) => {
			const source: Region[] = previous ?? plan?.regions ?? []

			return source.map((region, regionIndex) => {
				if (regionIndex !== currentDrag.regionIndex) {
					return region
				}

				return {
					...region,
					points: region.points.map((oldPoint, pointIndex) =>
						pointIndex === currentDrag.pointIndex ? point : oldPoint,
					),
				}
			})
		})
	}

	function finishDrag(event: React.PointerEvent<SVGSVGElement>) {
		drag.current = null

		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId)
		}
	}

	return (
		<>
			<div className='map-toolbar'>
				<select
					aria-label='План этажа'
					value={plan?.id ?? ''}
					disabled={busy}
					onChange={(event) => changePlan(event.target.value)}
				>
					{!data.plans.length && (
						<option value=''>Нет загруженных планов</option>
					)}

					{data.plans.map((item: any) => (
						<option key={item.id} value={item.id}>
							{item.name}
						</option>
					))}
				</select>

				{admin && plan && (
					<button
						className='secondary'
						disabled={busy}
						onClick={() => {
							if (
								points.length &&
								!confirm('Сбросить незавершённую область?')
							) {
								return
							}

							setEditing(!editing)
							setPoints([])
						}}
					>
						{editing ? 'Просмотр' : 'Редактор карты'}
					</button>
				)}

				<div className='map-actions'>
					<button
						className='secondary'
						aria-label='Уменьшить масштаб'
						disabled={zoom <= MIN_ZOOM}
						onClick={() => zoomTo(zoom / 1.25)}
					>
						−
					</button>

					<span>{Math.round(zoom * 100)}%</span>

					<button
						className='secondary'
						aria-label='Увеличить масштаб'
						disabled={zoom >= MAX_ZOOM}
						onClick={() => zoomTo(zoom * 1.25)}
					>
						+
					</button>

					<button className='secondary' disabled={zoom === 1} onClick={() => setZoom(1)}>
						Сброс
					</button>
				</div>
			</div>

			{admin && (
				<details className='card'>
					<summary>Загрузить новый план этажа</summary>

					<form className='map-upload' onSubmit={upload}>
						<label>
							Название
							<input
								name='name'
								placeholder='Первый этаж'
								maxLength={200}
								required
							/>
						</label>

						<label>
							План PNG / JPEG
							<input
								name='file'
								type='file'
								accept='image/png,image/jpeg'
								required
							/>
						</label>

						<button disabled={busy || dirty || points.length > 0}>
							Загрузить
						</button>
					</form>
				</details>
			)}

			{error && (
				<p className='error' role='alert'>
					{error}
				</p>
			)}

			{!plan ? (
				<div className='empty'>
					Загрузите изображение плана или используйте список помещений.
				</div>
			) : (
				<>
					{editing && (
						<div className='card'>
							<fieldset
								disabled={busy}
								style={{ border: 0, padding: 0, margin: 0 }}
							>
								<div className='formgrid'>
									<label>
										Название плана
										<input
											value={draftName ?? plan.name}
											maxLength={200}
											onChange={(event) => setDraftName(event.target.value)}
										/>
									</label>

									<label>
										Помещение
										<select
											value={roomId}
											onChange={(event) => {
												setRoomId(event.target.value)
												setPoints([])
											}}
										>
											<option value=''>Выберите помещение</option>

											{data.locations.map((location: any) => (
												<option key={location.id} value={location.id}>
													{location.name} · {location.floor} этаж
												</option>
											))}
										</select>
									</label>
								</div>

								<div className='map-actions'>
									{(
										[
											['polygon', 'По произвольным точкам'],
											['rectangle', 'Прямоугольник'],
											['marker', 'Маркер'],
										] as [Mode, string][]
									).map(([value, label]) => (
										<button
											key={value}
											className={mode === value ? '' : 'secondary'}
											aria-pressed={mode === value}
											onClick={() => {
												setMode(value)
												setPoints([])
												setError('')
											}}
										>
											{label}
										</button>
									))}
								</div>

								<p className='muted map-help'>
									{mode === 'polygon' &&
										'Выберите помещение, расставьте точки по контуру и нажмите «Закончить область».'}
									{mode === 'rectangle' &&
										'Выберите помещение и нажмите на два противоположных угла прямоугольника.'}
									{mode === 'marker' &&
										'Выберите помещение и нажмите на нужное место плана.'}{' '}
									Вершины выбранной области или маркер можно перетаскивать.
									Новая область заменяет старую область этого помещения на
									текущем плане.
								</p>

								<div className='map-actions'>
									{mode === 'polygon' && (
										<button
											disabled={!roomId || points.length < 3}
											onClick={() => addRegion(points)}
										>
											Закончить область
										</button>
									)}

									<button
										className='secondary'
										disabled={!points.length}
										onClick={() =>
											setPoints((previous) => previous.slice(0, -1))
										}
									>
										Отменить точку
									</button>

									<button
										className='secondary'
										disabled={!points.length}
										onClick={() => setPoints([])}
									>
										Сбросить точки
									</button>

									<button
										disabled={
											!dirty ||
											points.length > 0 ||
											!(draftName ?? plan.name).trim()
										}
										onClick={save}
									>
										{busy ? 'Сохранение…' : 'Сохранить карту'}
									</button>

									<button
										className='secondary'
										disabled={!dirty && !points.length}
										onClick={() => {
											if (!confirm('Отменить изменения карты?')) {
												return
											}

											setDraft(null)
											setDraftName(null)
											setPoints([])
											setError('')
										}}
									>
										Отменить изменения
									</button>
								</div>

								<div className='chips'>
									{regions.map((region) => (
										<button
											key={region.locationId}
											className='secondary'
											onClick={() => {
												if (
													!confirm(
														`Удалить обозначение «${roomName(
															region.locationId,
														)}»?`,
													)
												) {
													return
												}

												setDraft(
													regions.filter(
														(item) => item.locationId !== region.locationId,
													),
												)
											}}
										>
											× {roomName(region.locationId)}
										</button>
									))}
								</div>
							</fieldset>
						</div>
					)}

					<div className='map-viewport' ref={viewport}>
						<div className='map' style={{ width: `${zoom * 100}%` }}>
							<img
								src={`/api/plans/${plan.id}`}
								alt={plan.name}
								draggable={false}
							/>

							<svg
								viewBox='0 0 1000 1000'
								preserveAspectRatio='none'
								style={{
									touchAction: editing ? 'none' : 'pan-x pan-y',
								}}
								onPointerDown={pointerDown}
								onPointerMove={pointerMove}
								onPointerUp={pointerUp}
								onPointerCancel={(event) => {
									pendingTouch.current = null
									finishDrag(event)
								}}
								onLostPointerCapture={() => {
									drag.current = null
								}}
							>
								{regions.map((region, regionIndex) => {
									const marker = region.kind === 'marker'

									const centerX =
										region.points.reduce((sum, point) => sum + point[0], 0) /
										region.points.length

									const centerY =
										region.points.reduce((sum, point) => sum + point[1], 0) /
										region.points.length

									return (
										<g
											key={region.locationId}
											onClick={() => {
												if (!editing) {
													openRoom(region.locationId)
												}
											}}
											style={{
												cursor: editing ? 'crosshair' : 'pointer',
											}}
										>
											<title>{roomName(region.locationId)}</title>

											{marker ? (
												<circle
													cx={centerX}
													cy={centerY}
													r={10}
													fill='#245ce3'
													stroke='white'
													strokeWidth={2}
												/>
											) : (
												<polygon
													points={region.points
														.map((point) => point.join(','))
														.join(' ')}
												/>
											)}

											<text
												x={centerX}
												y={centerY + (marker ? 24 : 0)}
												textAnchor='middle'
												dominantBaseline='middle'
												className='map-label'
											>
												{roomName(region.locationId)}
											</text>

											{editing &&
												!busy &&
												roomId === region.locationId &&
												region.points.map((point, pointIndex) => (
													<circle
														key={pointIndex}
														cx={point[0]}
														cy={point[1]}
														r={7}
														fill='white'
														stroke='#dc2626'
														strokeWidth={2}
														style={{ cursor: 'grab' }}
														onPointerDown={(event) => {
															event.stopPropagation()

															drag.current = {
																regionIndex,
																pointIndex,
															}

															event.currentTarget.ownerSVGElement?.setPointerCapture(
																event.pointerId,
															)
														}}
													/>
												))}
										</g>
									)
								})}

								{points.length > 0 && (
									<polyline
										points={points.map((point) => point.join(',')).join(' ')}
										fill='none'
										stroke='#dc2626'
										strokeWidth={3}
										pointerEvents='none'
									/>
								)}

								{points.map((point, index) => (
									<circle
										key={index}
										cx={point[0]}
										cy={point[1]}
										r={5}
										fill='#dc2626'
										pointerEvents='none'
									/>
								))}
							</svg>
						</div>
					</div>
					<p className='muted' style={{ fontSize: 12, marginTop: 8 }}>
						Масштаб: щипок двумя пальцами, Ctrl + колесо мыши или кнопки «−» и «+».
					</p>
				</>
			)}
		</>
	)
}
