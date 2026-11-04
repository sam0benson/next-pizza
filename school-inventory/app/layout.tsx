import PwaRegister from '@/components/PwaRegister'
import type { Metadata, Viewport } from 'next'
import './globals.css'
export const metadata: Metadata = {
	title: 'Школьный инвентарь',
	description: 'Учёт имущества школы',
	applicationName: 'Школьный инвентарь',
	appleWebApp: {
		capable: true,
		title: 'Инвентарь',
		statusBarStyle: 'default',
	},
	icons: {
		icon: '/icons/favicon-32.png',
		apple: '/icons/apple-touch-icon.png',
	},
	robots: { index: false, follow: false },
	formatDetection: { telephone: false },
}
// Масштабирование страницы отключено: приложение ведёт себя как нативное.
// Карта школы масштабируется собственными жестами (MapEditor).
export const viewport: Viewport = {
	themeColor: [
		{ media: '(prefers-color-scheme: light)', color: '#f5f7fb' },
		{ media: '(prefers-color-scheme: dark)', color: '#0b1120' },
	],
	width: 'device-width',
	initialScale: 1,
	maximumScale: 1,
	userScalable: false,
	viewportFit: 'cover',
	interactiveWidget: 'resizes-content',
}
// Тема применяется до отрисовки, чтобы не было «вспышки» светлой темы.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`
export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang='ru' suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
			</head>
			<body>
				{children}
				<PwaRegister />
			</body>
		</html>
	)
}
