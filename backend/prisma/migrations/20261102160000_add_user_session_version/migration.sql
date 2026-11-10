-- Add a per-user version used to revoke refresh tokens after a password change.
ALTER TABLE "User"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
