// server/lib/dbRetry.ts
//
// MongoDB aborts concurrent writes that touch the SAME document with a transient
// WriteConflict, which Prisma surfaces as error code P2034. Our atomic guards
// (credit decrement on a Location, the per-hour SlotCounter increment) are
// intentionally single-document updates, so under burst contention — e.g. many
// customers joining one location's queue at once, or booking the same hour — some
// of those writes will hit P2034. The operation is correct; it just needs to be
// retried. Prisma does not auto-retry, so we do it here with small jittered
// backoff. This is what makes the atomic guards safe under real concurrency.
const RETRYABLE_CODES = new Set(["P2034"]);
function isRetryable(err) {
    return !!err && RETRYABLE_CODES.has(err.code);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Run a DB write, retrying on transient MongoDB write conflicts (P2034) with
 * exponential backoff + jitter. Non-conflict errors propagate immediately.
 */
export async function withWriteRetry(fn, attempts = 6) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        }
        catch (err) {
            if (!isRetryable(err))
                throw err;
            lastErr = err;
            // 5ms, 10ms, 20ms, ... capped, plus up to 10ms jitter.
            const backoff = Math.min(5 * 2 ** i, 200) + Math.random() * 10;
            await sleep(backoff);
        }
    }
    throw lastErr;
}
