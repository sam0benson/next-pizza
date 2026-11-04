import PrintButton from '@/components/PrintButton'
import { requireUser, scopeWhere } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureQrCodes, qrPayload } from '@/lib/qr'
import { notFound, redirect } from 'next/navigation'
import QRCode from 'qrcode'
export const dynamic = 'force-dynamic'
export default async function Label({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const u = await requireUser().catch(() => redirect('/')),
		{ id } = await params
	const found = await db.asset.findFirst({
		where: { id, schoolId: u.schoolId, ...scopeWhere(u) },
	})
	if (!found) notFound()
	const [a] = await ensureQrCodes([found])
	const qr = await QRCode.toDataURL(qrPayload(a.qrCode), {
		width: 200,
		margin: 1,
		errorCorrectionLevel: 'M',
	})
	return (
		<article className='printdoc'>
			<PrintButton />
			<section
				style={{
					border: '1px dashed #999',
					width: 280,
					padding: 15,
					textAlign: 'center',
					marginTop: 20,
				}}
			>
				<img src={qr} alt='QR-код карточки' width={160} height={160} />
				<h2>{a.inventory}</h2>
				<p>{a.name}</p>
			</section>
			<p className='muted no-print'>
				Код читается только сканером внутри приложения «Школьный инвентарь».
				Обычная камера покажет лишь служебный текст.
			</p>
		</article>
	)
}
