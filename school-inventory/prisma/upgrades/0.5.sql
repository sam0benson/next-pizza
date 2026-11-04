-- v0.5: вход по Face ID / Touch ID (WebAuthn). Безопасно выполнять повторно.
-- Приложение само выполняет эти команды при первом обращении к входу по Face ID.
CREATE TABLE IF NOT EXISTS "Passkey" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsed" TIMESTAMP(3),
    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "AuthChallenge" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "userId" TEXT,
    "tokenHash" TEXT,
    "expires" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Passkey_userId_idx" ON "Passkey"("userId");
CREATE INDEX IF NOT EXISTS "Passkey_deviceId_idx" ON "Passkey"("deviceId");
CREATE INDEX IF NOT EXISTS "AuthChallenge_expires_idx" ON "AuthChallenge"("expires");
