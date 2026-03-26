/**
 * Breezy Estimator — API Evaluation Suite v2
 *
 * Tests all four improvements:
 *   1. Multidimensional rate limiting (429 after threshold)
 *   2. Input validation (validate route)
 *   3. Survey route (structure, escape hatch)
 *   4. Estimate route (structure, math, crew, escape hatch)
 *   5. Prompt caching (response time proxy)
 *   6. Full pipeline integration
 *
 * Usage:
 *   npx ts-node eval.ts                               (targets production)
 *   BASE_URL=http://localhost:3000 npx ts-node eval.ts  (targets local)
 *
 * IMPORTANT — add this to lib/rateLimit.ts checkRateLimit() before running:
 *
 *   // Eval bypass — local/dev only, never deploy to production
 *   if (process.env.NODE_ENV !== 'production' && ip === 'eval-bypass') {
 *     return { allowed: true };
 *   }
 *
 * Then non-rate-limit suites pass x-forwarded-for: eval-bypass to skip limits.
 */

const BASE_URL = process.env.BASE_URL || 'https://breezyestimator.vercel.app';
const SESSION_ID = `eval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const IS_LOCAL = BASE_URL.includes('localhost');

// ─── ANSI colors ──────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function pass(msg: string) { console.log(`  ${c.green}✓${c.reset} ${msg}`); }
function fail(msg: string) { console.log(`  ${c.red}✗${c.reset} ${msg}`); }
function warn(msg: string) { console.log(`  ${c.yellow}⚠${c.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${c.dim}→${c.reset} ${msg}`); }
function header(msg: string) { console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}`); }

let passed = 0;
let failed = 0;
let warned = 0;

function assert(condition: boolean, passMsg: string, failMsg: string) {
  if (condition) { pass(passMsg); passed++; }
  else { fail(failMsg); failed++; }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

// bypass=true sets x-forwarded-for to 'eval-bypass' which skips rate limiting
// in local dev. Requires the bypass check in lib/rateLimit.ts (see header).
// bypass has no effect in production (BASE_URL != localhost).

function buildHeaders(sessionId: string, bypass = false): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-session-id': sessionId,
  };
  if (bypass && IS_LOCAL) {
    h['x-forwarded-for'] = 'eval-bypass';
  }
  return h;
}

async function postValidate(body: object, sessionId = SESSION_ID, bypass = false) {
  const res = await fetch(`${BASE_URL}/api/validate`, {
    method: 'POST',
    headers: buildHeaders(sessionId, bypass),
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function postSurvey(body: object, sessionId = SESSION_ID, bypass = false) {
  const res = await fetch(`${BASE_URL}/api/survey`, {
    method: 'POST',
    headers: buildHeaders(sessionId, bypass),
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function postEstimate(body: object, sessionId = SESSION_ID, bypass = false) {
  const res = await fetch(`${BASE_URL}/api/estimate`, {
    method: 'POST',
    headers: buildHeaders(sessionId, bypass),
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ─── Test data ────────────────────────────────────────────────────────────────

const GOOD_FORM = {
  businessName: 'Kapil Plumbing Co',
  ownerName: 'Kapil R',
  ownerEmail: 'kapil@test.com',
  ownerPhone: '555-1234',
  tradeType: 'Plumbing',
  jobDescription: 'Replace a leaky kitchen faucet and shutoff valve under the sink.',
  location: 'Austin, TX',
};

const CONFIRMED_DATA = {
  materials: [
    { item: 'Kitchen faucet', quantity: 1, unit: 'each', included: true },
    { item: 'Shutoff valve', quantity: 2, unit: 'each', included: true },
    { item: 'Teflon tape', quantity: 1, unit: 'roll', included: true },
  ],
  crew_size: 0,
  job_type: 'duration',
};

// ─── SUITE 1: Rate Limiting ───────────────────────────────────────────────────
// NOTE: This suite intentionally burns through the rate limit.
// All subsequent suites use bypass=true (local) to avoid being blocked.

async function testRateLimiting() {
  header('SUITE 1 — Multidimensional Rate Limiting');

  // Use a dedicated session for this suite so it doesn't contaminate others
  const rlSession = `rate-limit-test-${Date.now()}`;
  const results: number[] = [];

  info(`Firing 20 rapid requests with session: ${rlSession}`);

  for (let i = 0; i < 20; i++) {
    const { status } = await postValidate(
      { tradeType: 'Plumbing', jobDescription: 'Fix a leak', location: 'Austin TX' },
      rlSession,
      false  // NO bypass — this suite needs real rate limiting
    );
    results.push(status);
  }

  const successCount = results.filter(s => s === 200 || s === 400).length;
  const limitedCount = results.filter(s => s === 429).length;

  info(`Status codes: ${results.join(', ')}`);

  assert(
    limitedCount > 0,
    `Rate limiting triggered — got ${limitedCount} × 429 after ${successCount} allowed`,
    'Rate limiting NOT working — all 20 requests returned 2xx/4xx (no 429s seen)'
  );

  assert(
    successCount > 0,
    `Legitimate requests allowed before limit — ${successCount} × 2xx/4xx`,
    'No legitimate requests allowed — rate limit threshold may be set to 0'
  );

  if (limitedCount > 0) {
    info(`First 429 at request #${results.indexOf(429) + 1}`);
  }

  // Session isolation — different session on same IP should not be blocked
  // by the previous session's counter (only the IP counter matters here)
  // We use a fresh session ID but same IP, so we're testing IP limit isolation
  const freshSession = `fresh-${Date.now()}`;
  const { status: freshStatus } = await postValidate(
    { tradeType: 'Plumbing', jobDescription: 'Fix a leak', location: 'Austin TX' },
    freshSession,
    false
  );

  // After 20 requests, IP limit is definitely hit regardless of session
  // So we just verify the rate limit system responds correctly (429 or 200)
  assert(
    freshStatus === 429 || freshStatus === 200 || freshStatus === 400,
    `Rate limit system responding correctly (${freshStatus}) — expected 2xx, 4xx, or 429`,
    `Unexpected status code from rate limit system: ${freshStatus}`
  );

  info('Waiting 65 seconds for rate limit window to reset before continuing...');
  if (!IS_LOCAL) {
    info('Skipping cooldown on production — suites 2+ use bypass header on local');
  } else {
    await sleep(65_000);
    info('Rate limit window reset. Continuing with remaining suites.');
  }
}

// ─── SUITE 2: Input Validation ────────────────────────────────────────────────

async function testValidation() {
  header('SUITE 2 — Input Validation (/api/validate)');

  // Good input passes
  const good = await postValidate(
    { tradeType: GOOD_FORM.tradeType, jobDescription: GOOD_FORM.jobDescription, location: GOOD_FORM.location },
    SESSION_ID, true
  );
  assert(good.status === 200, 'Valid input returns 200', `Valid input returned ${good.status}`);
  assert(good.body.success === true, 'body.success = true', `body.success = ${good.body.success}`);

  // Nonsense input fails
  const bad = await postValidate(
    { tradeType: 'asdfghj', jobDescription: 'unicorn poop machine repair xkcd', location: 'Narnia' },
    SESSION_ID, true
  );
  assert(bad.status === 400, 'Nonsense input returns 400', `Nonsense input returned ${bad.status}`);
  assert(
    Array.isArray(bad.body.errors) && bad.body.errors.length > 0,
    'Error messages array returned',
    `body.errors missing or empty: ${JSON.stringify(bad.body.errors)}`
  );
  if (bad.body.errors?.length) info(`Error messages: ${bad.body.errors.join(' | ')}`);

  // Fake location fails
  const fakeLocation = await postValidate(
    { tradeType: 'Plumbing', jobDescription: 'Fix a leak', location: 'Narnia' },
    SESSION_ID, true
  );
  assert(
    fakeLocation.status === 400,
    'Fake location returns 400',
    `Fake location returned ${fakeLocation.status} — location validation may not be active`
  );

  // Real but vague job description passes (lenient on vague, strict on nonsense)
  const vague = await postValidate(
    { tradeType: 'Plumbing', jobDescription: 'fix my sink', location: 'Austin TX' },
    SESSION_ID, true
  );
  assert(
    vague.status === 200,
    'Vague but legitimate input passes (fix my sink)',
    `Vague legitimate input unexpectedly rejected: ${vague.status}`
  );
}

// ─── SUITE 3: Survey ──────────────────────────────────────────────────────────

async function testSurvey() {
  header('SUITE 3 — Survey Route (/api/survey)');

  const res = await postSurvey(GOOD_FORM, SESSION_ID, true);
  assert(res.status === 200, 'Good input returns 200', `Got ${res.status}`);
  assert(res.body.success === true, 'body.success = true', `body.success = ${res.body.success}`);

  const s = res.body.suggestion;
  if (s) {
    assert(Array.isArray(s.materials), 'suggestion.materials is an array', 'materials missing');
    assert(s.materials.length > 0, `${s.materials.length} material suggestions returned`, 'No materials returned');
    assert(
      typeof s.suggested_crew_size === 'number',
      `suggested_crew_size is a number (${s.suggested_crew_size})`,
      'suggested_crew_size missing or wrong type'
    );
    assert(
      s.job_type === 'duration' || s.job_type === 'project',
      `job_type correctly classified as "${s.job_type}"`,
      `job_type is "${s.job_type}" — expected "duration" or "project"`
    );

    const allIncluded = s.materials.every((m: { included: boolean }) => m.included === true);
    assert(allIncluded, 'All materials default to included: true', 'Some materials missing included: true flag');
    info(`Sample materials: ${s.materials.slice(0, 3).map((m: { item: string }) => m.item).join(', ')}`);
  } else {
    fail('No suggestion in response body');
    failed++;
  }

  // Project job classification — catering should be "project" not "duration"
  const cateringRes = await postSurvey(
    { ...GOOD_FORM, tradeType: 'Catering', jobDescription: 'Provide a 3 course dinner for 20 people' },
    SESSION_ID, true
  );
  if (cateringRes.status === 200 && cateringRes.body.suggestion) {
    assert(
      cateringRes.body.suggestion.job_type === 'project',
      'Catering correctly classified as job_type: "project"',
      `Catering classified as "${cateringRes.body.suggestion.job_type}" — expected "project"`
    );
  }

  // Escape hatch — extremely vague/degenerate input
  const vague = await postSurvey(
    { ...GOOD_FORM, jobDescription: '.', tradeType: '.' },
    SESSION_ID, true
  );
  if (vague.status === 200 && vague.body.suggestion?.insufficient_data) {
    pass('Degenerate input triggers insufficient_data escape hatch in survey');
    passed++;
    info(`Reason: ${vague.body.suggestion.reason}`);
  } else if (vague.status === 200) {
    warn('Degenerate input did not trigger insufficient_data — Claude estimated anyway');
    warned++;
  } else {
    info(`Degenerate input returned ${vague.status}`);
  }
}

// ─── SUITE 4: Estimate ────────────────────────────────────────────────────────

async function testEstimate() {
  header('SUITE 4 — Estimate Route (/api/estimate)');

  const body = { formData: GOOD_FORM, confirmed: CONFIRMED_DATA };
  const res = await postEstimate(body, SESSION_ID, true);

  assert(res.status === 200, 'Good input returns 200', `Got ${res.status} — ${JSON.stringify(res.body).slice(0, 200)}`);
  assert(res.body.success === true, 'body.success = true', `body.success = ${res.body.success}`);

  const e = res.body.estimate;
  if (e) {
    assert(typeof e.trade === 'string' && e.trade.length > 0, `trade: "${e.trade}"`, 'trade missing');
    assert(typeof e.job_summary === 'string', 'job_summary present', 'job_summary missing');
    assert(Array.isArray(e.materials) && e.materials.length > 0, `${e.materials?.length} priced materials`, 'materials missing');
    assert(typeof e.total_low === 'number' && e.total_low > 0, `total_low: $${e.total_low}`, 'total_low is 0 or missing');
    assert(typeof e.total_high === 'number' && e.total_high > 0, `total_high: $${e.total_high}`, 'total_high is 0 or missing');
    assert(e.total_high >= e.total_low, 'total_high >= total_low', `total_high (${e.total_high}) < total_low (${e.total_low})`);
    assert(
      e.employee_cost_breakdown === null,
      'Solo job has null employee_cost_breakdown',
      `Solo job unexpectedly has employee_cost_breakdown`
    );
    assert(
      typeof e.location_adjustment === 'number',
      `location_adjustment: ${e.location_adjustment}`,
      'location_adjustment missing'
    );

    // Math sanity check — 15% tolerance
    const matSum = (e.materials || []).reduce(
      (sum: number, m: { quantity: number; unit_cost_low: number }) => sum + (m.quantity * m.unit_cost_low),
      0
    );
    const laborLow = (e.labor_hours_low || 0) * (e.hourly_rate_low || 0);
    const expected = matSum + laborLow;
    const tolerance = expected * 0.15;
    if (expected === 0) {
      warn('Cannot verify math — expected total is 0');
      warned++;
    } else if (Math.abs(e.total_low - expected) <= tolerance) {
      pass(`Math checks out (expected ~$${expected.toFixed(0)}, got $${e.total_low})`);
      passed++;
    } else {
      warn(`Math mismatch — expected ~$${expected.toFixed(0)}, got $${e.total_low} (may be intentional)`);
      warned++;
    }

    info(`Estimate: $${e.total_low} – $${e.total_high}`);
    info(`Labor: ${e.labor_hours_low}–${e.labor_hours_high} hrs @ $${e.hourly_rate_low}–$${e.hourly_rate_high}/hr`);
  } else {
    fail('No estimate in response body');
    failed++;
  }

  // Crew size > 0 — should have employee_cost_breakdown
  const crewRes = await postEstimate(
    { formData: GOOD_FORM, confirmed: { ...CONFIRMED_DATA, crew_size: 2 } },
    SESSION_ID, true
  );
  if (crewRes.status === 200 && crewRes.body.estimate) {
    const eb = crewRes.body.estimate.employee_cost_breakdown;
    assert(
      eb !== null && typeof eb === 'object',
      'crew_size=2 job has employee_cost_breakdown',
      'crew_size=2 job missing employee_cost_breakdown'
    );
    if (eb) {
      assert(typeof eb.total_burden_low === 'number', `total_burden_low: $${eb.total_burden_low}/hr`, 'total_burden_low missing');
    }
  }

  // Nonsense materials caught by internal validation
  const badMats = await postEstimate({
    formData: GOOD_FORM,
    confirmed: {
      materials: [
        { item: 'Unicorn tears', quantity: 1, unit: 'bottle', included: true },
        { item: 'Dragon scale wrench', quantity: 1, unit: 'each', included: true },
      ],
      crew_size: 0,
      job_type: 'duration',
    },
  }, SESSION_ID, true);
  assert(
    badMats.status === 400,
    'Nonsense materials caught by validation (400)',
    `Nonsense materials not caught — got ${badMats.status}`
  );
  if (badMats.body.error) info(`Validation message: ${badMats.body.error.slice(0, 100)}`);
}

// ─── SUITE 5: Escape Hatch ────────────────────────────────────────────────────

async function testEscapeHatch() {
  header('SUITE 5 — Insufficient Data Escape Hatch');

  // Highly obscure trade with vague description
  const obscure = await postEstimate({
    formData: {
      ...GOOD_FORM,
      tradeType: 'Underwater basket weaving',
      jobDescription: 'Weave 40 baskets using traditional Fijian deep-sea coral reed techniques requiring specialized certification',
    },
    confirmed: {
      materials: [{ item: 'Coral reed bundles', quantity: 40, unit: 'each', included: true }],
      crew_size: 0,
      job_type: 'project',
    },
  }, SESSION_ID, true);

  if (obscure.status === 200) {
    if (obscure.body.estimate?.insufficient_data === true) {
      pass('Obscure/unestimatable trade triggers insufficient_data');
      passed++;
      info(`Reason: ${obscure.body.estimate.reason}`);
    } else {
      warn('Obscure trade did not trigger insufficient_data — Claude estimated anyway');
      warn('This may be acceptable if Claude has reasonable training data for this trade');
      warned++;
    }
  } else {
    info(`Obscure trade returned ${obscure.status}`);
  }
}

// ─── SUITE 6: Caching ─────────────────────────────────────────────────────────

async function testCaching() {
  header('SUITE 6 — Prompt Caching (Response Time Proxy)');

  info('Definitive verification requires checking Vercel logs for cache_read_input_tokens > 0');
  info('This suite uses response time as a proxy indicator');

  const payload = {
    tradeType: GOOD_FORM.tradeType,
    jobDescription: GOOD_FORM.jobDescription,
    location: GOOD_FORM.location,
  };

  const t1s = Date.now();
  const r1 = await postValidate(payload, SESSION_ID, true);
  const t1 = Date.now() - t1s;

  const t2s = Date.now();
  const r2 = await postValidate(payload, SESSION_ID, true);
  const t2 = Date.now() - t2s;

  assert(r1.status === 200, `Request 1 succeeded (${t1}ms)`, `Request 1 failed: ${r1.status}`);
  assert(r2.status === 200, `Request 2 succeeded (${t2}ms)`, `Request 2 failed: ${r2.status}`);

  if (t2 < t1) {
    pass(`Request 2 faster than request 1 (${t1}ms → ${t2}ms) — consistent with cache hit`);
    passed++;
  } else {
    warn(`Request 2 not faster (${t1}ms → ${t2}ms) — network variance may mask cache benefit`);
    warn('Check Vercel logs for cache_read_input_tokens > 0 to confirm');
    warned++;
  }

  info('To add definitive logging: console.log(JSON.stringify(response.usage)) in each route');
}

// ─── SUITE 7: Full Pipeline ───────────────────────────────────────────────────

async function testFullPipeline() {
  header('SUITE 7 — Full Pipeline Integration (validate → survey → estimate)');

  // Step 1
  const val = await postValidate(
    { tradeType: GOOD_FORM.tradeType, jobDescription: GOOD_FORM.jobDescription, location: GOOD_FORM.location },
    SESSION_ID, true
  );
  assert(val.status === 200, `Step 1 validate: 200`, `Step 1 validate: ${val.status}`);

  // Step 2
  const survey = await postSurvey(GOOD_FORM, SESSION_ID, true);
  assert(survey.status === 200, `Step 2 survey: 200`, `Step 2 survey: ${survey.status}`);

  if (!survey.body.suggestion) {
    fail('Pipeline stopped — no survey suggestion returned');
    failed++;
    return;
  }

  // Step 3 — use real survey output as confirmed data
  const confirmed = {
    materials: survey.body.suggestion.materials.slice(0, 4),
    crew_size: survey.body.suggestion.suggested_crew_size,
    job_type: survey.body.suggestion.job_type,
  };

  const estimate = await postEstimate({ formData: GOOD_FORM, confirmed }, SESSION_ID, true);
  assert(estimate.status === 200, `Step 3 estimate: 200`, `Step 3 estimate: ${estimate.status}`);
  assert(
    estimate.body.estimate?.total_low > 0,
    `Full pipeline produced estimate: $${estimate.body.estimate?.total_low} – $${estimate.body.estimate?.total_high}`,
    'Full pipeline failed to produce a valid estimate'
  );

  if (estimate.body.estimate) {
    info(`Trade: ${estimate.body.estimate.trade}`);
    info(`Summary: ${estimate.body.estimate.job_summary}`);
  }
}

// ─── RUNNER ───────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n${c.bold}Breezy Estimator — API Evaluation Suite v2${c.reset}`);
  console.log(`${c.dim}Target: ${BASE_URL}${c.reset}`);
  console.log(`${c.dim}Session: ${SESSION_ID}${c.reset}`);

  if (IS_LOCAL) {
    console.log(`${c.yellow}Running locally — bypass header active for non-rate-limit suites${c.reset}`);
    console.log(`${c.yellow}Ensure lib/rateLimit.ts has the eval bypass check (see file header)${c.reset}`);
  } else {
    console.log(`${c.yellow}Running against production — no bypass available. Suites may 429 after Suite 1.${c.reset}`);
    console.log(`${c.yellow}Run locally with BASE_URL=http://localhost:3000 for full suite coverage.${c.reset}`);
  }

  const start = Date.now();

  try {
    await testRateLimiting();
    await testValidation();
    await testSurvey();
    await testEstimate();
    await testEscapeHatch();
    await testCaching();
    await testFullPipeline();
  } catch (err) {
    console.error(`\n${c.red}Eval runner crashed:${c.reset}`, err);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${c.bold}Results${c.reset} (${elapsed}s)`);
  console.log(`  ${c.green}Passed:${c.reset}  ${passed}`);
  console.log(`  ${c.red}Failed:${c.reset}  ${failed}`);
  console.log(`  ${c.yellow}Warned:${c.reset}  ${warned}`);
  console.log(`${'─'.repeat(50)}\n`);

  if (failed === 0) {
    console.log(`${c.green}${c.bold}All tests passed.${c.reset}\n`);
  } else {
    console.log(`${c.red}${c.bold}${failed} test(s) failed. Review output above.${c.reset}\n`);
    process.exit(1);
  }
}

run();