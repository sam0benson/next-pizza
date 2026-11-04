'use client'
import { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
export type ScanResult = { kind: 'ok' | 'warn' | 'bad'; text: string; close?: boolean }
type Decoder = (src: HTMLVideoElement | HTMLCanvasElement) => Promise<string | null>
async function makeDecoder(canvas: HTMLCanvasElement): Promise<Decoder> {
	const BD = (globalThis as any).BarcodeDetector
	if (BD) {
		try {
			const formats: string[] = await BD.getSupportedFormats()
			if (formats.includes('qr_code')) {
				const det = new BD({ formats: ['qr_code'] })
				return async (src) => (await det.detect(src))[0]?.rawValue ?? null
			}
		} catch {}
	}
	// Запасной путь (iPhone, Firefox): jsQR по кадру с canvas
	const jsQR = (await import('jsqr')).default
	return async (src) => {
		const w0 = src instanceof HTMLVideoElement ? src.videoWidth : src.width,
			h0 = src instanceof HTMLVideoElement ? src.videoHeight : src.height
		if (!w0 || !h0) return null
		const k = Math.min(1, 720 / Math.max(w0, h0))
		const w = Math.round(w0 * k),
			h = Math.round(h0 * k)
		canvas.width = w
		canvas.height = h
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!
		ctx.drawImage(src, 0, 0, w, h)
		const img = ctx.getImageData(0, 0, w, h)
		return jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null
	}
}
export default function Scanner({
	onResult,
	onClose,
	continuous = false,
	children,
}: {
	onResult: (text: string) => Promise<ScanResult>
	onClose: () => void
	/** Режим «сканировать подряд»: окно не закрывается после успешного кода. */
	continuous?: boolean
	children?: React.ReactNode
}) {
	const video = useRef<HTMLVideoElement>(null),
		canvas = useRef<HTMLCanvasElement>(null)
	const [status, setStatus] = useState('Запуск камеры…'),
		[cameraError, setCameraError] = useState(''),
		[result, setResult] = useState<(ScanResult & { at: number }) | null>(null),
		[log, setLog] = useState<ScanResult[]>([]),
		[manual, setManual] = useState(''),
		[torch, setTorch] = useState<null | boolean>(null)
	const busy = useRef(false),
		last = useRef({ text: '', at: 0 }),
		track = useRef<MediaStreamTrack | null>(null)
	async function handle(text: string, fromCamera = true) {
		if (busy.current) return
		// одна и та же этикетка перед камерой не должна отмечаться много раз подряд
		if (
			fromCamera &&
			text === last.current.text &&
			Date.now() - last.current.at < 3500
		)
			return
		busy.current = true
		last.current = { text, at: Date.now() }
		setStatus('Проверка кода…')
		const r: ScanResult = await onResult(text).catch((e) => ({
			kind: 'bad' as const,
			text: String(e?.message || e),
		}))
		if (r.close) return
		setResult({ ...r, at: Date.now() })
		if (continuous && r.kind !== 'bad') setLog((l) => [r, ...l].slice(0, 30))
		if (navigator.vibrate) navigator.vibrate(r.kind === 'ok' ? 60 : [80, 60, 80])
		setStatus('Наведите камеру на QR-этикетку')
		setTimeout(() => (busy.current = false), r.kind === 'bad' ? 1500 : 900)
	}
	useEffect(() => {
		let stream: MediaStream | null = null,
			stop = false,
			timer: any
		;(async () => {
			try {
				if (!window.isSecureContext)
					throw new Error('Камера доступна только по HTTPS')
				stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: { ideal: 'environment' } },
					audio: false,
				})
				if (stop) return
				const v = video.current!
				v.srcObject = stream
				await v.play()
				track.current = stream.getVideoTracks()[0] || null
				try {
					const caps: any = track.current?.getCapabilities?.()
					if (caps?.torch) setTorch(false)
				} catch {}
				const decode = await makeDecoder(canvas.current!)
				setStatus('Наведите камеру на QR-этикетку')
				const tick = async () => {
					if (stop) return
					if (!busy.current && v.readyState >= 2) {
						const text = await decode(v).catch(() => null)
						if (text) await handle(text)
					}
					timer = setTimeout(tick, 200)
				}
				tick()
			} catch (e: any) {
				setStatus('')
				setCameraError(
					e?.name === 'NotAllowedError'
						? 'Нет доступа к камере. Разрешите камеру в настройках браузера или выберите фото.'
						: e?.message || 'Камера недоступна',
				)
			}
		})()
		return () => {
			stop = true
			clearTimeout(timer)
			stream?.getTracks().forEach((t) => t.stop())
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
	// подсветка рамки после результата гаснет сама
	const [flash, setFlash] = useState('')
	useEffect(() => {
		if (!result) return
		setFlash(result.kind === 'bad' ? ' flash-bad' : ' flash-ok')
		const t = setTimeout(() => setFlash(''), 900)
		return () => clearTimeout(t)
	}, [result])
	async function fromFile(file?: File) {
		if (!file) return
		const img = new Image()
		img.src = URL.createObjectURL(file)
		await img.decode()
		const c = document.createElement('canvas')
		c.width = img.naturalWidth
		c.height = img.naturalHeight
		c.getContext('2d')!.drawImage(img, 0, 0)
		URL.revokeObjectURL(img.src)
		const text = await (await makeDecoder(canvas.current!))(c)
		if (text) handle(text, false)
		else setResult({ kind: 'bad', text: 'QR-код на фото не найден', at: Date.now() })
	}
	async function toggleTorch() {
		try {
			await track.current?.applyConstraints({ advanced: [{ torch: !torch } as any] })
			setTorch(!torch)
		} catch {}
	}
	return (
		<div className='overlay' onClick={(e) => e.target === e.currentTarget && onClose()}>
			<section className='dialog scanner' role='dialog' aria-label='Сканер QR'>
				<div className='dialog-head'>
					<h2>{continuous ? 'Инвентаризация' : 'Сканер QR'}</h2>
					{torch !== null && (
						<button
							className={torch ? 'icon-btn' : 'secondary icon-btn'}
							aria-label='Фонарик'
							title='Фонарик'
							onClick={toggleTorch}
						>
							<Icon name='flash' size={18} />
						</button>
					)}
					<button className='ghost icon-btn' aria-label='Закрыть' onClick={onClose}>
						<Icon name='x' />
					</button>
				</div>
				{children}
				<div className={'scanner-view' + flash}>
					<video ref={video} playsInline muted />
					<div className='scanner-frame' />
				</div>
				<canvas ref={canvas} hidden />
				{status && <p className='scan-status'>{status}</p>}
				{cameraError && (
					<p className='error'>
						<Icon name='camera' size={18} /> {cameraError}
					</p>
				)}
				{result && (
					<div
						className={'scan-result ' + result.kind}
						role={result.kind === 'bad' ? 'alert' : 'status'}
					>
						<Icon name={result.kind === 'ok' ? 'check' : 'alert'} size={18} />
						<span>{result.text}</span>
					</div>
				)}
				<form
					className='toolbar'
					style={{ marginTop: 12, flexWrap: 'nowrap' }}
					onSubmit={(e) => {
						e.preventDefault()
						busy.current = false
						if (manual.trim()) handle(manual.trim(), false)
						setManual('')
					}}
				>
					<input
						value={manual}
						onChange={(e) => setManual(e.target.value)}
						placeholder='Инвентарный номер или код SINV1:…'
						autoComplete='off'
						enterKeyHint='search'
						style={{ flex: 1, minWidth: 0 }}
					/>
					<button className='secondary'>Найти</button>
				</form>
				<label className='button secondary file-btn' style={{ width: '100%' }}>
					<Icon name='image' size={18} /> Распознать с фото
					<input
						type='file'
						accept='image/*'
						capture='environment'
						style={{ display: 'none' }}
						onChange={(e) => fromFile(e.target.files?.[0])}
					/>
				</label>
				{continuous && log.length > 0 && (
					<>
						<h3>Отмечено за сеанс: {log.length}</h3>
						<div className='scan-log'>
							{log.map((r, i) => (
								<div key={i}>
									<span>{r.text}</span>
									<span className={r.kind === 'ok' ? 'badge ok' : 'badge warn'}>
										{r.kind === 'ok' ? 'на месте' : 'перемещён'}
									</span>
								</div>
							))}
						</div>
					</>
				)}
			</section>
		</div>
	)
}
