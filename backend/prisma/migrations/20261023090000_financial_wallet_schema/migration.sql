DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Wallet")
       OR EXISTS (SELECT 1 FROM "Expense")
       OR EXISTS (SELECT 1 FROM "ExpenseSplit") THEN
        RAISE EXCEPTION
            'IF-3 migration requires Wallet, Expense and ExpenseSplit to be empty: existing wallet/expense creator and expense date data has no unambiguous legacy source.';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Expense"
        WHERE CASE
            WHEN "amount"::text IN ('NaN', 'Infinity', '-Infinity') THEN TRUE
            ELSE ROUND("amount"::numeric * 100) < -2147483648
              OR ROUND("amount"::numeric * 100) > 2147483647
        END
    ) OR EXISTS (
        SELECT 1
        FROM "ExpenseSplit"
        WHERE CASE
            WHEN "amount"::text IN ('NaN', 'Infinity', '-Infinity') THEN TRUE
            ELSE ROUND("amount"::numeric * 100) < -2147483648
              OR ROUND("amount"::numeric * 100) > 2147483647
        END
    ) THEN
        RAISE EXCEPTION
            'IF-3 migration cannot convert a non-finite or out-of-range amount to integer cents without data loss.';
    END IF;
END $$;

CREATE TYPE "WalletStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "WalletMemberStatus" AS ENUM ('INVITED', 'MEMBER');
CREATE TYPE "RepaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

ALTER TABLE "Wallet"
    ADD COLUMN "status" "WalletStatus" NOT NULL DEFAULT 'OPEN',
    ADD COLUMN "createdById" TEXT NOT NULL,
    ADD COLUMN "closedAt" TIMESTAMP(3);

ALTER TABLE "WalletMember"
    RENAME COLUMN "joinedAt" TO "acceptedAt";
ALTER TABLE "WalletMember"
    ADD COLUMN "status" "WalletMemberStatus" NOT NULL DEFAULT 'MEMBER',
    ADD COLUMN "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "WalletMember"
    ALTER COLUMN "acceptedAt" DROP NOT NULL,
    ALTER COLUMN "acceptedAt" DROP DEFAULT,
    ALTER COLUMN "status" SET DEFAULT 'INVITED';

DROP INDEX "WalletMember_userId_walletId_key";
CREATE UNIQUE INDEX "WalletMember_walletId_userId_key"
    ON "WalletMember"("walletId", "userId");

ALTER TABLE "Expense"
    ADD COLUMN "date" DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN "createdById" TEXT NOT NULL,
    ALTER COLUMN "amount" TYPE INTEGER
        USING ROUND("amount"::numeric * 100)::INTEGER;
ALTER TABLE "Expense"
    ALTER COLUMN "date" DROP DEFAULT;

ALTER TABLE "ExpenseSplit"
    ALTER COLUMN "amount" TYPE INTEGER
        USING ROUND("amount"::numeric * 100)::INTEGER;

ALTER TABLE "WalletMember"
    DROP CONSTRAINT "WalletMember_userId_fkey",
    ADD CONSTRAINT "WalletMember_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Wallet"
    ADD CONSTRAINT "Wallet_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Repayment" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "RepaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Repayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Repayment_not_self_check" CHECK ("fromUserId" <> "toUserId")
);

CREATE INDEX "Repayment_walletId_status_idx"
    ON "Repayment"("walletId", "status");

ALTER TABLE "Repayment"
    ADD CONSTRAINT "Repayment_walletId_fkey"
        FOREIGN KEY ("walletId") REFERENCES "Wallet"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "Repayment_fromUserId_fkey"
        FOREIGN KEY ("fromUserId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Repayment_toUserId_fkey"
        FOREIGN KEY ("toUserId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
