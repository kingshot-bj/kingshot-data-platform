const D1_TRANSIENT_RETRY_MAX = 3;
const D1_TRANSIENT_BASE_DELAY_MS = 150;

export function isD1TransientError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return code === "D1_ERROR" && (
    message.includes("network connection lost") ||
    message.includes("connection reset") ||
    message.includes("connection closed") ||
    message.includes("temporarily unavailable") ||
    message.includes("service unavailable")
  );
}

export async function withD1TransientRetry(operation, {
  retries = D1_TRANSIENT_RETRY_MAX,
  baseDelayMs = D1_TRANSIENT_BASE_DELAY_MS,
  onRetry = null
} = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isD1TransientError(error) || attempt >= retries) throw error;
      attempt++;
      const jitter = Math.floor(Math.random() * 100);
      const delay = Math.min(2000, baseDelayMs * (2 ** (attempt - 1)) + jitter);
      if (typeof onRetry === "function") {
        await Promise.resolve(onRetry({ attempt, delay, error })).catch(() => {});
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
