import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";

export const MAX_NEW_ACCOUNTS_PER_IP = 2;

export class SignupLimitError extends Error {
  constructor(message = "이 네트워크에서는 새 계정을 최대 2개까지만 만들 수 있습니다.") {
    super(message);
    this.name = "SignupLimitError";
  }
}

function isIpAddress(value: string) {
  // IPv4 and IPv6 literals only. This is deliberately narrow because this
  // value becomes a privacy-preserving HMAC input, not a client identifier.
  return /^[0-9a-fA-F:.]+$/.test(value);
}

export function getClientIp(
  headers: Headers,
  isProduction = process.env.NODE_ENV === "production",
): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const addresses = forwarded
      .split(",")
      .map((value) => value.trim())
      .filter((value) => isIpAddress(value));
    // Google frontends append trusted client and load-balancer addresses. A
    // caller can forge only earlier X-Forwarded-For values, so use the
    // second-to-last address when that pair is present.
    const clientIp = addresses.length >= 2 ? addresses.at(-2) : addresses[0];
    if (clientIp) return clientIp.toLowerCase();
  }

  // X-Real-IP is not a Cloud Run trust boundary. It remains useful for local
  // reverse-proxy smoke tests, but production accepts only GFE's XFF chain.
  if (!isProduction) {
    const realIp = headers.get("x-real-ip")?.trim();
    if (realIp && isIpAddress(realIp)) return realIp.toLowerCase();
  }

  // Cloud Run provides X-Forwarded-For in production. Keeping local OAuth
  // smoke tests usable does not weaken the deployed path.
  return isProduction ? null : "127.0.0.1";
}

export function hashRegistrationIp(ip: string, secret = getSignupHashSecret()) {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

function getSignupHashSecret() {
  const secret = process.env.SIGNUP_IP_HASH_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("A 32+ character SIGNUP_IP_HASH_SECRET or SESSION_SECRET is required.");
  }
  return secret;
}

export async function reserveNewAccountSlot(
  tx: Prisma.TransactionClient,
  headers: Headers,
) {
  const clientIp = getClientIp(headers);
  if (!clientIp) {
    throw new SignupLimitError("가입 요청의 네트워크 정보를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }

  const ipHash = hashRegistrationIp(clientIp);
  const reserved = await tx.$queryRaw<Array<{ ipHash: string }>>`
    INSERT INTO "RegistrationIp" ("ipHash", "accountCount", "createdAt", "updatedAt")
    VALUES (${ipHash}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("ipHash") DO UPDATE
    SET
      "accountCount" = "RegistrationIp"."accountCount" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "RegistrationIp"."accountCount" < ${MAX_NEW_ACCOUNTS_PER_IP}
    RETURNING "ipHash"
  `;

  if (reserved.length === 0) throw new SignupLimitError();
}
