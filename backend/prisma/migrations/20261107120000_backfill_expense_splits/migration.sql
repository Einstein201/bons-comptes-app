-- Crée les parts des dépenses antérieures à la répartition par ExpenseSplit.
-- L'historique des adhésions n'existant pas, chaque dépense est répartie entre les
-- membres actuels, comme le faisait le bilan. Le montant cumulé du porte-monnaie
-- sert de base : chaque part reste égale à un centime près et le total de chaque
-- membre correspond exactement à sa part dans l'ancien bilan, ce qui préserve les
-- remboursements déjà déclarés.
WITH "legacyExpense" AS (
    SELECT
        e."id",
        e."walletId",
        e."amount",
        SUM(e."amount") OVER (
            PARTITION BY e."walletId"
            ORDER BY e."createdAt", e."id"
        ) AS "cumulative"
    FROM "Expense" e
    WHERE NOT EXISTS (
        SELECT 1 FROM "ExpenseSplit" s WHERE s."expenseId" = e."id"
    )
),
"rankedMember" AS (
    SELECT
        m."walletId",
        m."userId",
        ROW_NUMBER() OVER (
            PARTITION BY m."walletId"
            ORDER BY m."userId" COLLATE "C"
        ) - 1 AS "rank",
        COUNT(*) OVER (PARTITION BY m."walletId") AS "memberCount"
    FROM "WalletMember" m
    WHERE m."status" = 'MEMBER'
)
INSERT INTO "ExpenseSplit" ("id", "expenseId", "userId", "amount")
SELECT
    gen_random_uuid()::text,
    e."id",
    m."userId",
    (
        e."cumulative" / m."memberCount"
        + CASE WHEN m."rank" < e."cumulative" % m."memberCount" THEN 1 ELSE 0 END
        - (e."cumulative" - e."amount") / m."memberCount"
        - CASE WHEN m."rank" < (e."cumulative" - e."amount") % m."memberCount" THEN 1 ELSE 0 END
    )::integer
FROM "legacyExpense" e
JOIN "rankedMember" m ON m."walletId" = e."walletId";

-- Annule la migration plutôt que de laisser une dépense sans parts complètes :
-- le bilan du porte-monnaie concerné serait déséquilibré.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Expense" e
        LEFT JOIN "ExpenseSplit" s ON s."expenseId" = e."id"
        GROUP BY e."id", e."amount"
        HAVING COALESCE(SUM(s."amount"), 0) <> e."amount"
    ) THEN
        RAISE EXCEPTION 'La somme des parts doit être égale au montant de chaque dépense.';
    END IF;
END $$;
