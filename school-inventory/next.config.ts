import type { NextConfig } from 'next'
const security = [
	{ key: 'X-Content-Type-Options', value: 'nosniff' },
	{ key: 'X-Frame-Options', value: 'DENY' },
	{ key: 'Referrer-Policy', value: 'same-origin' },
	{
		key: 'Permissions-Policy',
		value: 'camera=(self), microphone=(), geolocation=()',
	},
	{
		key: 'Strict-Transport-Security',
		value: 'max-age=31536000; includeSubDomains',
	},
	{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]
const config: NextConfig = {
	output: 'standalone',
	poweredByHeader: false,
	async headers() {
		return [
			{ source: '/:path*', headers: security },
			{
				source: '/sw.js',
				headers: [
					{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
					{ key: 'Service-Worker-Allowed', value: '/' },
				],
			},
		]
	},
}
export default config
