interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipStore = new Map<string, RateLimitEntry>();
const sessionStore = new Map<string, RateLimitEntry>();
let globalCount = 0;
let globalResetAt = Date.now() + 60_000;

const LIMITS = {
  ip:      { max: 15,  windowMs: 60_000 },
  session: { max: 8,   windowMs: 60_000 },
  global:  { max: 300, windowMs: 60_000 },
};

function checkAndIncrement(
  store: Map<string, RateLimitEntry>,
  key: string,
  max: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

export function checkRateLimit(
  
  ip: string,
  sessionId: string
): { allowed: boolean; reason?: string } {


  // Add at the very top of checkRateLimit()
if (process.env.NODE_ENV !== 'production' && ip === 'eval-bypass') {
  return { allowed: true };
}

  const now = Date.now();

  // Global circuit breaker
  if (now > globalResetAt) {
    globalCount = 0;
    globalResetAt = now + LIMITS.global.windowMs;
  }
  if (globalCount >= LIMITS.global.max) {
    return {
      allowed: false,
      reason: 'Service temporarily busy. Please try again in a moment.',
    };
  }

  // IP limit
  if (!checkAndIncrement(ipStore, ip, LIMITS.ip.max, LIMITS.ip.windowMs)) {
    return {
      allowed: false,
      reason: 'Too many requests from your network. Please wait a moment.',
    };
  }

  // Session limit
  if (
    sessionId &&
    !checkAndIncrement(
      sessionStore, sessionId,
      LIMITS.session.max, LIMITS.session.windowMs
    )
  ) {
    return {
      allowed: false,
      reason: "You've generated several estimates recently. Please wait a moment.",
    };
  }

  globalCount++;
  return { allowed: true };
}
