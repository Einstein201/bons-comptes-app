-- Les emails sont désormais enregistrés en minuscules et sans espaces autour.
-- La migration s'arrête explicitement si deux comptes ne diffèrent que par la casse ou les espaces,
-- afin de ne jamais fusionner ni écraser des comptes sans décision humaine.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    GROUP BY lower(btrim("email"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Des comptes User ont le même email après normalisation (casse ou espaces autour) : résoudre les doublons avant de migrer';
  END IF;
END $$;

UPDATE "User"
SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));
