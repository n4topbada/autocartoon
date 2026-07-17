import { WELCOME_CREDITS } from "./credit-products";

export type KakaoPlaceholderLedger = {
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
  if (hasUserData || credits < 0 || credits > WELCOME_CREDITS || ledgers.length === 0) {
    return false;
  }

  const welcomeGrants = ledgers.filter(
    (ledger) =>
      ledger.action === "grant" &&
      ledger.source === "welcome" &&
      ledger.units === WELCOME_CREDITS,
  );
  if (welcomeGrants.length !== 1) return false;

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
