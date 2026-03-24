import Anthropic from '@anthropic-ai/sdk';
import { JobFormData, SurveyConfirmedData } from '@/lib/types';
import { fetchBLSWages, updateLogWithEstimate } from '@/lib/bls';

const client = new Anthropic();

const VALIDATION_PROMPT = `You validate materials lists for service business job estimates.

Given a trade type, job description, and a list of materials, check if every item is a legitimate material/supply/service for that trade and job.

Return ONLY a JSON object. NO markdown. NO code fences.

If ALL items are valid:
{"valid": true}

If ANY item is nonsensical, offensive, made-up, or completely unrelated to the trade type and job:
{"valid": false, "invalid_items": ["item name 1", "item name 2"], "reason": "short explanation"}

RULES:
- Only flag items that are CLEARLY absurd or unrelated (e.g. "poop machine" for electrical, "unicorn tears" for plumbing, offensive/joke items)
- Unusual but plausibly trade-related items should pass (e.g. "fish tape" for electrical is valid even though it sounds odd)
- Be strict about nonsense but lenient about legitimate niche items`;

const SYSTEM_PROMPT = `You are an expert estimator for service businesses.

You will be given:
1. A job description with trade type and location
2. A CONFIRMED list of materials and quantities (already approved by the provider)
3. A CONFIRMED crew size
4. BLS wage data (if available)

Your job is to PRICE the confirmed materials and calculate labor costs. Do NOT add, remove, or change the material list — the provider has already reviewed it.

Return a single valid JSON object. NO markdown. NO code fences. Only raw JSON.

JSON shape:
{
  "trade": "string",
  "job_summary": "string — 1-2 sentence summary including crew size",
  "materials": [
    {
      "item": "string — use the EXACT item name provided",
      "quantity": number — use the EXACT quantity provided,
      "unit_cost_low": number,
      "unit_cost_high": number
    }
  ],
  "labor_hours_low": number,
  "labor_hours_high": number,
  "hourly_rate_low": number,
  "hourly_rate_high": number,
  "provider_material_cost_low": number,
  "provider_material_cost_high": number,
  "employee_cost_breakdown": {
    "base_wage_low": number,
    "base_wage_high": number,
    "payroll_tax": number,
    "workers_comp": number,
    "insurance": number,
    "total_burden_low": number,
    "total_burden_high": number
  } | null,
  "provider_labor_cost_low": number,
  "provider_labor_cost_high": number,
  "total_low": number,
  "total_high": number,
  "location_adjustment": number,
  "notes": "string"
}

CRITICAL: MATERIAL LIST IS LOCKED
- Use the EXACT items and quantities provided — do not add, remove, rename, or reorder
- Your only job is to assign unit_cost_low and unit_cost_high to each item
- unit_cost_low/high are retail prices the CLIENT pays (Home Depot/Lowe's tier for trades, restaurant supply for catering, etc.)
- provider_material_cost_low/high = wholesale/trade pricing (typically 30-50% below retail total)

CREW SIZE IS LOCKED
- crew_size = 0 means SOLO (just the owner, no employees) — set employee_cost_breakdown to null
- crew_size >= 1 means owner + N employees — provide employee_cost_breakdown

HOURLY RATE (client billing rate):
- If BLS data is provided:
  - hourly_rate_low = BLS 10th percentile × 2.0 × location_adjustment
  - hourly_rate_high = BLS 90th percentile × 2.0 × location_adjustment
- If NO BLS data: state in notes, use documented industry rates

EMPLOYEE COST BREAKDOWN (when crew_size >= 1):
- base_wage_low/high: BLS 10th/90th percentile × location_adjustment
- payroll_tax: ~10-14% of mean wage as $/hr
- workers_comp: varies by trade risk ($0.50-$25/hr)
- insurance: $1-$4/hr
- total_burden = base_wage + payroll_tax + workers_comp + insurance
- provider_labor_cost = total_burden × hours × number_of_employees

LOCATION ADJUSTMENT:
- NYC/SF/LA/Boston/Seattle/DC: 1.3-1.5
- Chicago/Miami/Denver/Austin/Portland: 1.1-1.2
- Suburban/mid-size: 1.0-1.1
- Rural/low-cost: 0.8-0.9

PROJECT vs DURATION JOBS:
- Duration jobs (painting, plumbing, HVAC, etc.): price with labor_hours + hourly_rate as usual
- Project/deliverable jobs (pastry orders, catering, floral, custom goods): labor is baked into the per-unit price, NOT billed hourly
  - For project jobs: set labor_hours_low/high = 0, hourly_rate_low/high = 0
  - total_low/high = just the sum of materials (which includes the provider's labor markup)
  - unit_cost_low/high should reflect the CLIENT-FACING price per item (ingredients + labor + markup)
  - provider_material_cost = raw ingredient/material cost (no labor markup)
  - The difference between client price and provider cost IS the provider's labor + profit

PRICING MATH:
- total_low = sum(quantity × unit_cost_low) + (labor_hours_low × hourly_rate_low)
- total_high = sum(quantity × unit_cost_high) + (labor_hours_high × hourly_rate_high)
- VERIFY your arithmetic before responding

LABOR HOURS (duration jobs only):
- labor_hours_low and labor_hours_high should differ by no more than 25%
- Base on standard production rates for the trade`;

interface EstimateRequestBody {
  formData: JobFormData;
  confirmed: SurveyConfirmedData;
}

export async function POST(req: Request) {
  try {
    const { formData: body, confirmed }: EstimateRequestBody = await req.json();

    // Step 1: Validate materials before pricing
    const validationMessage = `Trade type: ${body.tradeType}
Job description: ${body.jobDescription}

Materials to validate:
${confirmed.materials.map((m) => `- ${m.item}`).join('\n')}`;

    const valResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      temperature: 0,
      system: VALIDATION_PROMPT,
      messages: [{ role: 'user', content: validationMessage }],
    });

    const valRaw = valResponse.content[0].type === 'text' ? valResponse.content[0].text : '';
    const valCleaned = valRaw.replace(/```json/g, '').replace(/```/g, '').trim();
    const validation = JSON.parse(valCleaned);

    if (!validation.valid) {
      const items = (validation.invalid_items || []).join(', ');
      return Response.json(
        { success: false, error: `Invalid material(s): ${items}. ${validation.reason || 'Please remove items that are not related to this job.'}` },
        { status: 400 }
      );
    }

    // Step 2: Fetch real BLS OEWS wage data for the trade
    const blsWages = await fetchBLSWages(body.tradeType, body.location);

    let blsContext = '';
    if (blsWages) {
      const parts: string[] = [
        ``,
        `BLS OEWS WAGE DATA (SOC ${blsWages.soc_code}, national baseline — YOU MUST USE THESE):`,
      ];
      if (blsWages.percentile_10 !== null) parts.push(`  10th percentile employee wage: $${blsWages.percentile_10}/hr`);
      if (blsWages.mean_hourly !== null) parts.push(`  Mean employee wage: $${blsWages.mean_hourly}/hr`);
      if (blsWages.percentile_90 !== null) parts.push(`  90th percentile employee wage: $${blsWages.percentile_90}/hr`);
      parts.push(`  → Client billing rate = above wages × 2.0 multiplier × location_adjustment`);
      parts.push(`  → employee base_wage = above wages × location_adjustment (no 2.0x)`);
      parts.push(`  → provider_labor_cost = total_burden × hours × employees`);
      blsContext = '\n\n' + parts.join('\n');
    } else {
      blsContext = '\n\nNO BLS DATA AVAILABLE — flag this in notes and use only well-documented industry standard rates.';
    }

    // Build confirmed materials list for Claude to price
    const materialsList = confirmed.materials
      .map((m) => `- ${m.item}: ${m.quantity} ${m.unit}`)
      .join('\n');

    const crewLabel = confirmed.crew_size === 0
      ? 'SOLO (owner only, no employees)'
      : `Owner + ${confirmed.crew_size} employee${confirmed.crew_size > 1 ? 's' : ''}`;

    const userMessage = `
Trade type: ${body.tradeType}
Job description: ${body.jobDescription}
Location: ${body.location}

CONFIRMED CREW SIZE: ${crewLabel}

CONFIRMED MATERIALS (DO NOT modify this list — price each item exactly as listed):
${materialsList}${blsContext}
    `.trim();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawText =
      response.content[0].type === 'text' ? response.content[0].text : '';

    const cleaned = rawText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const estimate = JSON.parse(cleaned);

    // Update the BLS log with Claude's final estimate
    await updateLogWithEstimate(estimate);

    return Response.json({ success: true, estimate });
  } catch (error) {
    console.error('Estimate API error:', error);
    return Response.json(
      { success: false, error: 'Failed to generate estimate' },
      { status: 500 }
    );
  }
}
