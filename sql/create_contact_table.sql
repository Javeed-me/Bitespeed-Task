CREATE TABLE IF NOT EXISTS "Contact" (
  "id" SERIAL PRIMARY KEY,
  "phoneNumber" VARCHAR(255),
  "email" VARCHAR(255),
  "linkedId" INTEGER REFERENCES "Contact"("id"),
  "linkPrecedence" VARCHAR(16) NOT NULL DEFAULT 'PRIMARY',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ,
  CONSTRAINT link_precedence_check CHECK ("linkPrecedence" IN ('PRIMARY', 'SECONDARY'))
);

CREATE INDEX IF NOT EXISTS "Contact_email_idx" ON "Contact"("email");
CREATE INDEX IF NOT EXISTS "Contact_phoneNumber_idx" ON "Contact"("phoneNumber");
CREATE INDEX IF NOT EXISTS "Contact_linkedId_idx" ON "Contact"("linkedId");

