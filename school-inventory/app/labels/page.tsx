import PrintButton from '@/components/PrintButton'
import { requireUser, scopeWhere } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureQrCodes, qrPayload } from '@/lib/qr'
import { redirect } from 'next/navigation'
import QRCode from 'qrcode'
export const dynamic = 'force-dynamic'
export default async function Labels({
	searchParams,
}: {
	searchParams: Promise<{ ids?: string }>
}) {
	const u = await requireUser().catch(() => redirect('/'))
	const p = await searchParams,
		ids = [...new Set((p.ids || '').split(',').filter(Boolean))]
	if (ids.length > 100) return <p>Не более 100 этикеток за один раз.</p>
	const assets = await ensureQrCodes(
		await db.asset.findMany({
			where: { id: { in: ids }, schoolId: u.schoolId, ...scopeWhere(u) },
		}),
	)
	const items = await Promise.all(
		assets.map(async (a) => ({
			...a,
			qr: await QRCode.toDataURL(qrPayload(a.qrCode), {
				width: 180,
				margin: 1,
				errorCorrectionLevel: 'M',
			}),
		})),
	)
	return (
		<article className='printdoc'>
			<PrintButton />
			<div className='labels-grid'>
				{items.map((a) => (
					<section className='label-item' key={a.id}>
						<img src={a.qr} width={130} height={130} alt='QR' />
						<strong>{a.inventory}</strong>
						<span>{a.name}</span>
					</section>
				))}
			</div>
		</article>
	)
}
