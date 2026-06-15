-- migrate:up
-- Better Auth core + organization + admin plugin tables (matches packages/db
-- schema/auth.ts). camelCase identifiers are quoted to preserve case.

CREATE TABLE IF NOT EXISTS "user" (
  "id"            text PRIMARY KEY,
  "name"          text NOT NULL,
  "email"         text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image"         text,
  "role"          text,
  "banned"        boolean,
  "banReason"     text,
  "banExpires"    timestamp,
  "createdAt"     timestamp NOT NULL DEFAULT now(),
  "updatedAt"     timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"                   text PRIMARY KEY,
  "expiresAt"            timestamp NOT NULL,
  "token"                text NOT NULL UNIQUE,
  "ipAddress"            text,
  "userAgent"            text,
  "userId"               text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "activeOrganizationId" text,
  "impersonatedBy"       text,
  "createdAt"            timestamp NOT NULL DEFAULT now(),
  "updatedAt"            timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                    text PRIMARY KEY,
  "accountId"             text NOT NULL,
  "providerId"            text NOT NULL,
  "userId"                text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamp,
  "refreshTokenExpiresAt" timestamp,
  "scope"                 text,
  "password"              text,
  "createdAt"             timestamp NOT NULL DEFAULT now(),
  "updatedAt"             timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value"      text NOT NULL,
  "expiresAt"  timestamp NOT NULL,
  "createdAt"  timestamp NOT NULL DEFAULT now(),
  "updatedAt"  timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "organization" (
  "id"        text PRIMARY KEY,
  "name"      text NOT NULL,
  "slug"      text UNIQUE,
  "logo"      text,
  "metadata"  text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "member" (
  "id"             text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "userId"         text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role"           text NOT NULL DEFAULT 'member',
  "createdAt"      timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "invitation" (
  "id"             text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "email"          text NOT NULL,
  "role"           text,
  "status"         text NOT NULL DEFAULT 'pending',
  "expiresAt"      timestamp NOT NULL,
  "inviterId"      text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_user ON "session"("userId");
CREATE INDEX IF NOT EXISTS idx_account_user ON "account"("userId");
CREATE INDEX IF NOT EXISTS idx_member_org ON "member"("organizationId");
CREATE INDEX IF NOT EXISTS idx_member_user ON "member"("userId");

-- migrate:down
DROP TABLE IF EXISTS "invitation";
DROP TABLE IF EXISTS "member";
DROP TABLE IF EXISTS "organization";
DROP TABLE IF EXISTS "verification";
DROP TABLE IF EXISTS "account";
DROP TABLE IF EXISTS "session";
DROP TABLE IF EXISTS "user";
