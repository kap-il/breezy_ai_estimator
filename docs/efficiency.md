# Breezy Estimator — API Improvements v2

Four targeted upgrades across all three API routes:
`app/api/estimate/route.ts`
`app/api/survey/route.ts`
`app/api/validate/route.ts`

All implementations sourced directly from Anthropic docs.

---

## IMPORTANT: Model String

Update the model string in all three routes before anything else:

```typescript
// WRONG — deprecated string
model: 'claude-sonnet-4-20250514'

// CORRECT — current model identifier
model: 'claude-sonnet-4-6'
```

---

## 1. Ephemeral Prompt Caching

**What it does:** Stores the system prompt in Anthropic's KV cache so
subsequent requests reuse it instead of reprocessing from scratch.

**Cost impact on Sonnet 4.6:**
- Base input tokens: $3.00/MTok
- Cache write (5min): $3.75/MTok (1.25x — one-time cost)
- Cache read: $0.30/MTok (0.10x — every subsequent hit)
- Cache hits do NOT count against your rate limit

**Critical constraint:** Minimum cacheable length on Sonnet 4.6 is
**2048 tokens**. If your system prompt is shorter than this, caching
is silently skipped. Check token counts before assuming caching works.

**Two ways to implement — choose one:**

### Option A: Automatic Caching (simpler, recommended)

Add `cache_control` at the top level of the request. The system
automatically applies the cache breakpoint to the last cacheable block.

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  cache_control: { type: 'ephemeral' },  // top-level, automatic
  system: SYSTEM_PROMPT,                  // system stays as a string
  messages: [{ role: 'user', content: userMessage }],
});
```

Best for single-turn requests like ours where the system prompt is
static and the user message changes every time.

### Option B: Explicit Block-Level Caching (more control)

Place `cache_control` directly on the system content block. Use this
if you need to cache different sections at different frequencies.

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ],
  messages: [{ role: 'user', content: userMessage }],
});
```

**CRITICAL — place `cache_control` on the last STATIC block:**
The system prompt is our static content. The user message changes
every request. If you accidentally put `cache_control` on the user
message block, the hash changes every request and you never get a
cache hit. System prompt is the correct target.

**Apply Option A to all three routes.** It's the simplest approach
and handles our use case correctly — static system prompt, variable
user input.

**Verify caching is working** by checking the response usage fields:
```typescript
console.log(response.usage);
// cache_creation_input_tokens: N  (first request — writes cache)
// cache_read_input_tokens: N      (subsequent requests — reads cache)
// input_tokens: N                 (tokens after cache breakpoint)
```

If `cache_read_input_tokens` is always 0, your system prompt is below
the 2048 token minimum. Solution: the system prompts are already long
enough based on what's in the repo, but verify after deploying.

---

## 2. Adaptive Thinking on Estimate Route Only

**What it does:** Lets Claude dynamically decide whether and how much
to reason based on request complexity. Simple jobs get fast responses.
Complex multi-trade jobs with regional pricing get deeper reasoning.

**Only apply to `estimate/route.ts`.** Survey is list generation.
Validate is classification. Neither benefits enough from thinking to
justify added latency and token cost.

**Important model notes from docs:**
- `thinking.type: "enabled"` with `budget_tokens` is **deprecated**
  on Sonnet 4.6. Use `thinking.type: "adaptive"` instead.
- Adaptive thinking is ONLY supported on Sonnet 4.6 and Opus 4.6.
- Adaptive thinking automatically enables interleaved thinking.
- No beta header required.

**Implementation for `estimate/route.ts`:**

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 8000,              // MUST be high — thinking consumes tokens
  cache_control: { type: 'ephemeral' },
  thinking: {
    type: 'adaptive',
    display: 'omitted',          // don't return thinking content to client
  },
  output_config: {
    effort: 'medium',            // thinks on complex jobs, skips on simple
  },
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userMessage }],
});
```

**Why each setting:**

`max_tokens: 8000` — Thinking tokens consume from the max_tokens
budget. If Claude runs out mid-response you get truncated JSON that
fails to parse. The docs explicitly warn: if you see
`stop_reason: "max_tokens"` in responses, increase max_tokens.
8000 gives ample room for thinking + full estimate JSON.

`display: 'omitted'` — We don't surface thinking to users.
Omitting it reduces time-to-first-text-token because the server
skips streaming thinking tokens entirely. You're still billed for
thinking tokens but latency improves. From the docs: "The server
skips streaming thinking tokens entirely and delivers only the
signature, so the final text response begins streaming sooner."
Note: `display` is not yet in TypeScript SDK type definitions —
use a type assertion:
```typescript
thinking: {
  type: 'adaptive',
  display: 'omitted',
} as { type: 'adaptive'; display: 'omitted' },
```

`effort: 'medium'` — From the docs:
- `high` (default): Claude always thinks
- `medium`: Claude uses moderate thinking, may skip for simple queries
- `low`: Claude minimizes thinking, skips for simple tasks

Medium is right for our estimator — we want reasoning on a
"commercial kitchen renovation with 3 subcontractors in Austin TX"
but not on "touch up paint on one wall."

**Caching + adaptive thinking interaction (from docs):**
Consecutive requests using adaptive thinking preserve prompt cache
breakpoints. However, switching between adaptive and
enabled/disabled thinking modes breaks cache breakpoints for
messages. System prompts remain cached regardless of mode changes.
Since we only use adaptive on estimate and disabled on the other
two routes, system prompt caching is safe across all routes.

**Handle thinking blocks in the response:**
With `display: 'omitted'`, thinking blocks come back with an empty
`thinking` field but a populated `signature` field. Your existing
response parsing (extracting `content[0].text`) is unaffected —
just ignore the thinking block if it appears.

---

## 3. Allow Claude to Say "I Don't Know"

**What it does:** Explicitly permits Claude to return an uncertainty
signal instead of fabricating numbers for obscure jobs or edge cases.

**Why it matters:** From the Anthropic docs: "Allow Claude to say
'I don't know': Explicitly give Claude permission to admit
uncertainty. This simple technique can drastically reduce false
information." A fabricated estimate sent to a real client damages
trust far more than an honest "I can't reliably estimate this."

**Add to the end of SYSTEM_PROMPT in `estimate/route.ts`:**

```
UNCERTAINTY RULE:
If you cannot generate a reliable estimate for this job — for example,
the job description is too vague, the trade is highly specialized with
limited pricing data, or you have low confidence in the numbers —
return this JSON instead of fabricating figures:

{
  "trade": "detected trade type or 'Unknown'",
  "job_summary": "brief description of what was requested",
  "insufficient_data": true,
  "reason": "one sentence explaining why you cannot estimate reliably",
  "materials": [],
  "labor_hours_low": 0,
  "labor_hours_high": 0,
  "hourly_rate_low": 0,
  "hourly_rate_high": 0,
  "total_low": 0,
  "total_high": 0,
  "notes": ""
}

Only use this for genuine uncertainty. For all common trades and
well-described jobs, always generate a full estimate.
```

**Add to the end of SURVEY_PROMPT in `survey/route.ts`:**

```
UNCERTAINTY RULE:
If the job description is too vague to generate a reliable materials
list, return:
{
  "job_type": "duration",
  "insufficient_data": true,
  "reason": "one sentence explanation",
  "materials": [],
  "suggested_crew_size": 0,
  "crew_rationale": ""
}
```

**Add `insufficient_data` to your TypeScript types in `lib/types.ts`:**

```typescript
export interface EstimateResult {
  trade: string;
  job_summary: string;
  insufficient_data?: boolean;   // add this
  reason?: string;               // add this
  materials: MaterialLine[];
  labor_hours_low: number;
  labor_hours_high: number;
  hourly_rate_low: number;
  hourly_rate_high: number;
  total_low: number;
  total_high: number;
  notes: string;
}
```

**Handle it in the estimate display component:**

```typescript
// At the top of EstimateDisplay render
if (estimate.insufficient_data) {
  return (
    <div>
      <h2>We need more information</h2>
      <p>{estimate.reason}</p>
      <p>Try adding more detail to your job description — 
         scope, materials, location, and scale help us 
         generate an accurate estimate.</p>
      <button onClick={onReset}>Try Again</button>
    </div>
  );
}
// ... rest of normal render
```

---

## 4. Multidimensional Rate Limiting

**What it does:** Three independent rate limit layers — per IP,
per session, and a global circuit breaker.

**Why three layers:**
- IP only: a single user on a shared network (office, university)
  can exhaust the limit for everyone on that IP
- Session only: no protection against distributed scraping
- Global only: one bad actor can throttle all legitimate users

**Create `lib/rateLimit.ts`:**

```typescript
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipStore = new Map<string, RateLimitEntry>();
const sessionStore = new Map<string, RateLimitEntry>();
let globalCount = 0;
let globalResetAt = Date.now() + 60_000;

// Tune these based on observed usage
const LIMITS = {
  ip:      { max: 15,  windowMs: 60_000 },   // 15 req/min per IP
  session: { max: 8,   windowMs: 60_000 },   // 8 req/min per session
  global:  { max: 300, windowMs: 60_000 },   // 300 req/min total
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
```

**Add to the top of each route's POST handler:**

```typescript
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const sessionId = req.headers.get('x-session-id') || '';

  const { allowed, reason } = checkRateLimit(ip, sessionId);
  if (!allowed) {
    return Response.json(
      { success: false, error: reason },
      { status: 429 }
    );
  }

  // ... rest of existing handler unchanged
}
```

**Generate and pass session ID from the frontend (`EstimatorApp.tsx`):**

```typescript
import { useRef } from 'react';

// Inside EstimatorApp component
const sessionId = useRef<string>('');

useEffect(() => {
  if (typeof window !== 'undefined') {
    let id = sessionStorage.getItem('breezy-session');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('breezy-session', id);
    }
    sessionId.current = id;
  }
}, []);

// Pass as header on ALL three API calls (estimate, survey, validate)
const res = await fetch('/api/estimate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-session-id': sessionId.current,
  },
  body: JSON.stringify(data),
});
```

---

## Implementation Order

Follow this sequence exactly:

```
1. Fix model string in all three routes (claude-sonnet-4-6)
2. Add automatic caching (cache_control at top level) to all three routes
3. Verify caching works — check response.usage for cache_read_input_tokens > 0
4. Create lib/rateLimit.ts
5. Add rate limiting to all three routes + session ID generation in frontend
6. Add "I don't know" escape hatch to estimate + survey system prompts
7. Add insufficient_data handling to EstimateDisplay component
8. Add adaptive thinking to estimate/route.ts only
9. Increase estimate max_tokens to 8000
10. Run all test cases — watch for stop_reason: "max_tokens" in logs
11. git add . && git commit -m "feat: caching, adaptive thinking, rate limiting, hallucination reduction"
12. git push (auto deploys to Vercel)
```

---

## Monitoring After Deploy

Check these in Anthropic dashboard + Vercel logs:

- `cache_read_input_tokens > 0` in API responses → caching is working
- `stop_reason: "max_tokens"` → increase estimate max_tokens further
- `insufficient_data: true` responses → if frequent on common trades,
  tighten the escape hatch wording
- HTTP 429 responses in Vercel logs → rate limiting is catching abuse
- Cache hit rate should be >50% within minutes of going live if multiple
  users are hitting it in bursts

---

*Sources:*
- *Prompt caching: platform.claude.com/docs/en/build-with-claude/prompt-caching*
- *Adaptive thinking: platform.claude.com/docs/en/build-with-claude/adaptive-thinking*
- *Reduce hallucinations: platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations*
- *Reduce latency: platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency*
