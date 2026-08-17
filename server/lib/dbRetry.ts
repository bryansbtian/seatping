
const RETRYABLE_CODES = new Set(["P2034"]);

function isRetryable(err: any): boolean {
  return !!err && RETRYABLE_CODES.has(err.code);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withWriteRetry<T>(
  fn: () => Promise<T>,
  attempts = 6,
): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err)) {
        throw err;
      }
      lastErr = err;
      const backoff = Math.min(5 * 2 ** i, 200) + Math.random() * 10;
      await sleep(backoff);
    }
  }
  throw lastErr;
}
