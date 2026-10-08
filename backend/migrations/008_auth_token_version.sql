-- Logout and credential changes end a user's sessions by bumping their token_version; every request compares
-- the token's `ver` claim against this value (see src/session.ts).
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;
