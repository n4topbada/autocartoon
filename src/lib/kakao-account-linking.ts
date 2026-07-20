import { WELCOME_CREDITS } from "./credit-products";

const LEGACY_WELCOME_CREDITS = 30;
const SUPPORTED_WELCOME_GRANTS = new Set([
  LEGACY_WELCOME_CREDITS,
  WELCOME_CREDITS,
]);

type KakaoPlaceholderLedger = {
  action: string;
  source: string;
  units: number;
  balanceAfter: number | null;
};

type DisposableKakaoAccountInput = {
  credits: number;
  hasUserData: boolean;
  ledgers: KakaoPlaceholderLedger[];
};

export function isDisposableKakaoPlaceholderAccount({
  credits,
  hasUserData,
  ledgers,
}: DisposableKakaoAccountInput) {
  if (hasUserData || credits < 0 || ledgers.length === 0) {
    return false;
  }

  const welcomeGrants = ledgers.filter(
    (ledger) =>
      ledger.action === "grant" &&
      ledger.source === "welcome" &&
      SUPPORTED_WELCOME_GRANTS.has(ledger.units),
  );
  if (welcomeGrants.length !== 1) return false;
  if (credits > welcomeGrants[0].units) return false;

  if (
    !ledgers.every(
      (ledger) =>
        (ledger.action === "grant" && ledger.source === "welcome") ||
        ((ledger.action === "charge" || ledger.action === "refund") &&
          ledger.source === "chat"),
    )
  ) {
    return false;
  }

  const calculatedBalance = ledgers.reduce((balance, ledger) => {
    if (ledger.action === "charge") return balance - ledger.units;
    return balance + ledger.units;
  }, 0);

  return calculatedBalance === credits;
}
