-- Record the one-time grant that the preceding migration applied to existing users.
INSERT INTO "CreditLedger" (
  "id",
  "userId",
  "jobId",
  "referenceKey",
  "action",
  "source",
  "units",
  "balanceAfter",
  "note",
  "createdAt"
)
SELECT
  'welcome_' || md5("User"."id"),
  "User"."id",
  NULL,
  'welcome:' || "User"."id" || ':grant',
  'grant',
  'welcome',
  30,
  "User"."credits",
  '기존 회원 웰컴 크레딧',
  COALESCE("User"."welcomeCreditsGrantedAt", CURRENT_TIMESTAMP)
FROM "User"
WHERE
  "User"."welcomeCreditsGrantedAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "CreditLedger"
    WHERE "CreditLedger"."referenceKey" = 'welcome:' || "User"."id" || ':grant'
  );
