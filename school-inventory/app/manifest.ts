import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
	return {
		id: '/',
		name: 'Школьный инвентарь',
		short_name: 'Инвентарь',
		description: 'Учёт имущества школы',
		lang: 'ru',
		start_url: '/',
		scope: '/',
		display: 'standalone',
		orientation: 'any',
		background_color: '#f4f6fb',
		theme_color: '#f4f6fb',
		icons: [
			{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
			{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
			{
				src: '/icons/maskable-512.png',
				sizes: '512x512',
				type: 'image/png',
				purpose: 'maskable',
			},
		],
		shortcuts: [
			{ name: 'Сканировать QR', url: '/?scan=1', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
		],
	}
}
