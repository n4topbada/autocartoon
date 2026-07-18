const DEFAULT_DELAYS_MS = [10_000, 25_000, 45_000] as const;

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function isTransientAIError(error: unknown) {
  return /\b429\b|RESOURCE_EXHAUSTED|\b50[0234]\b|UNAVAILABLE|DEADLINE_EXCEEDED|ECONNRESET|ETIMEDOUT|rate.?limit|temporar(?:y|ily)/i.test(
    errorText(error)
  );
}

interface TransientAIRetryOptions {
  delaysMs?: readonly number[];
  sleep?: (delayMs: number) => Promise<void>;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export async function withTransientAIRetry<T>(
  operation: () => Promise<T>,
  options: TransientAIRetryOptions = {}
): Promise<T> {
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  }));

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = delays[attempt];
      if (delayMs === undefined || !isTransientAIError(error)) throw error;
      options.onRetry?.(error, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }
}
