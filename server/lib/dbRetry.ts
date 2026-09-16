const RETRYABLE_CODES = new Set(["P2034"]);

const RETRYABLE_UPSERT_CODES = new Set(["P2034", "P2002"]);

function isRetryable(err: any, codes: Set<string>): boolean {
  return !!err && codes.has(err.code);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retrying<T>(fn: () => Promise<T>, attempts: number, codes: Set<string>): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err, codes)) {
        throw err;
      }
      lastErr = err;
      const backoff = Math.min(5 * 2 ** i, 200) + Math.random() * 10;
      await sleep(backoff);
    }
  }
  throw lastErr;
}

export async function withWriteRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  return retrying(fn, attempts, RETRYABLE_CODES);
}

export async function withUpsertRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  return retrying(fn, attempts, RETRYABLE_UPSERT_CODES);
}
