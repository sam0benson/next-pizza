import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseQr, qrPayload, newQrCode } from '../lib/qr'
import {
	base32,
	decrypt,
	deviceCode,
	encrypt,
	normalizeCode,
	verifyTotp,
} from '../lib/security'

test('TOTP: тестовый вектор RFC 6238 и защита от повтора', () => {
	const secret = base32(Buffer.from('12345678901234567890'))
	assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
	const now = Date.now
	Date.now = () => 59_000
	try {
		assert.equal(verifyTotp(secret, '287082'), 1)
		assert.equal(verifyTotp(secret, '287 082'), 1)
		assert.equal(verifyTotp(secret, '287082', 1), null) // уже использован
		assert.equal(verifyTotp(secret, '000000'), null)
	} finally {
		Date.now = now
	}
})

test('шифрование секретов', () => {
	process.env.APP_SECRET = 'x'.repeat(40)
	const box = encrypt('секрет')
	assert.notEqual(box, 'секрет')
	assert.equal(decrypt(box), 'секрет')
	process.env.APP_SECRET = 'y'.repeat(40)
	assert.throws(() => decrypt(box))
})

test('QR: непрозрачный формат и старые ссылки', () => {
	const c = newQrCode()
	assert.deepEqual(parseQr(qrPayload(c)), { code: c })
	assert.ok(!qrPayload(c).includes('http'))
	assert.deepEqual(parseQr('https://inv.example.org/?asset=cmunpx5zp0000oj7vth1p7lrv'), {
		legacyId: 'cmunpx5zp0000oj7vth1p7lrv',
	})
	assert.deepEqual(parseQr('SINV1:../../etc'), {})
	assert.deepEqual(parseQr('просто текст'), {})
})

test('код устройства', () => {
	const c = deviceCode()
	assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
	assert.equal(normalizeCode(c.toLowerCase().replace('-', ' ')), c.replace('-', ''))
})
