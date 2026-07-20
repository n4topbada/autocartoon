import assert from "node:assert/strict";
import test from "node:test";
import { isDisposableKakaoPlaceholderAccount } from "../src/lib/kakao-account-linking";
import { WELCOME_CREDITS } from "../src/lib/credit-products";

const welcome = {
  action: "grant",
  source: "welcome",
  units: WELCOME_CREDITS,
  balanceAfter: WELCOME_CREDITS,
};

test("accepts a pristine Kakao placeholder account", () => {
  assert.equal(
    isDisposableKakaoPlaceholderAccount({ credits: WELCOME_CREDITS, hasUserData: false, ledgers: [welcome] }),
    true,
  );
});

test("accepts a placeholder used only for a disposable chat smoke test", () => {
  assert.equal(
    isDisposableKakaoPlaceholderAccount({
      credits: WELCOME_CREDITS - 1,
      hasUserData: false,
      ledgers: [
        welcome,
        { action: "charge", source: "chat", units: 1, balanceAfter: WELCOME_CREDITS - 1 },
      ],
    }),
    true,
  );
});

test("rejects accounts with user data or non-chat credit activity", () => {
  assert.equal(
    isDisposableKakaoPlaceholderAccount({ credits: WELCOME_CREDITS, hasUserData: true, ledgers: [welcome] }),
    false,
  );
  assert.equal(
    isDisposableKakaoPlaceholderAccount({
      credits: WELCOME_CREDITS - 10,
      hasUserData: false,
      ledgers: [
        welcome,
        { action: "charge", source: "character", units: 10, balanceAfter: WELCOME_CREDITS - 10 },
      ],
    }),
    false,
  );
});

test("rejects a ledger whose calculated balance does not match the user", () => {
  assert.equal(
    isDisposableKakaoPlaceholderAccount({
      credits: WELCOME_CREDITS,
      hasUserData: false,
      ledgers: [
        welcome,
        { action: "charge", source: "chat", units: 1, balanceAfter: WELCOME_CREDITS - 1 },
      ],
    }),
    false,
  );
});

test("continues to recognize legacy 30-credit placeholder accounts", () => {
  assert.equal(
    isDisposableKakaoPlaceholderAccount({
      credits: 30,
      hasUserData: false,
      ledgers: [{ action: "grant", source: "welcome", units: 30, balanceAfter: 30 }],
    }),
    true,
  );
});
