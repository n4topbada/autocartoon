import assert from "node:assert/strict";
import test from "node:test";
import { isDisposableKakaoPlaceholderAccount } from "../src/lib/kakao-account-linking";

const welcome = {
  action: "grant",
  source: "welcome",
  units: 30,
  balanceAfter: 30,
};

test("accepts a pristine Kakao placeholder account", () => {
  assert.equal(
    isDisposableKakaoPlaceholderAccount({ credits: 30, hasUserData: false, ledgers: [welcome] }),
    true,
  );
});

test("accepts a placeholder used only for a disposable chat smoke test", () => {
  assert.equal(
    isDisposableKakaoPlaceholderAccount({
      credits: 29,
      hasUserData: false,
      ledgers: [
        welcome,
        { action: "charge", source: "chat", units: 1, balanceAfter: 29 },
      ],
    }),
    true,
  );
});

test("rejects accounts with user data or non-chat credit activity", () => {
  assert.equal(
    isDisposableKakaoPlaceholderAccount({ credits: 30, hasUserData: true, ledgers: [welcome] }),
    false,
  );
  assert.equal(
    isDisposableKakaoPlaceholderAccount({
      credits: 20,
      hasUserData: false,
      ledgers: [
        welcome,
        { action: "charge", source: "character", units: 10, balanceAfter: 20 },
      ],
    }),
    false,
  );
});

test("rejects a ledger whose calculated balance does not match the user", () => {
  assert.equal(
    isDisposableKakaoPlaceholderAccount({
      credits: 30,
      hasUserData: false,
      ledgers: [
        welcome,
        { action: "charge", source: "chat", units: 1, balanceAfter: 29 },
      ],
    }),
    false,
  );
});
