import Anthropic from '@anthropic-ai/sdk';
import { JobFormData, SurveySuggestion } from '@/lib/types';

const client = new Anthropic();

const SURVEY_PROMPT = `You are an expert estimator for service businesses.
Given a job description, trade type, and location, suggest:
1. A list of materials, supplies, and services needed for THIS SPECIFIC JOB
2. A recommended crew size

Return a single valid JSON object. NO markdown. NO code fences. Only raw JSON.

JSON shape:
{
  "job_type": "duration" | "project",
  "materials": [
    {
      "item": "string — descriptive name",
      "quantity": number,
      "unit": "string — e.g. 'gallons', 'rolls', 'each', 'sq ft', 'bags', 'dozen'"
    }
  ],
  "suggested_crew_size": number (0 = solo owner, 1+ = owner + N employees),
  "crew_rationale": "string — brief explanation of why this crew size"
}

FIRST — determine the job type:
- "duration": labor-intensive jobs billed by time (painting, plumbing, HVAC, electrical, roofing, landscaping, cleaning, carpentry). These need tools, equipment, PPE, permits, etc.
- "project": deliverable-based jobs billed per unit or per project (pastry/baking orders, catering, floral arrangements, custom goods, alterations). These focus on ingredients/materials for the deliverable itself.

RULES FOR ALL JOBS:
- Only suggest items that are DIRECTLY required by what the job description says
- If the description doesn't mention something, don't assume it's needed
- The provider will review and can add anything we missed — don't pad the list
- quantity must be a number, not a string
- Be specific about items — "Interior latex paint (eggshell)" not just "paint"
- For crew size: unless the description explicitly mentions a team, default to 0 (solo)

RULES FOR DURATION JOBS (painting, plumbing, etc.):
- Include materials, consumables, and equipment the job requires
- Include permits, disposal, travel only if the job scope implies them
- Think about what THIS specific job needs, not everything the trade could ever need

RULES FOR PROJECT JOBS (pastry orders, catering, floral, custom goods, etc.):
- Focus on the INGREDIENTS and MATERIALS for the deliverable
- Only include ancillary items (packaging, transport, equipment rental) if the description mentions delivery, setup, or similar
- Do NOT include general kitchen equipment, tools, or supplies the provider obviously already owns (ovens, mixers, pans, knives, etc.)
- Do NOT include PPE, permits, or disposal unless specifically relevant
- If the job is "60 cupcakes" — list flour, sugar, butter, frosting ingredients, cupcake liners, boxes. NOT: oven, mixer, spatulas, apron`;

export async function POST(req: Request) {
  try {
    const body: JobFormData = await req.json();

    const userMessage = `
Trade type: ${body.tradeType}
Job description: ${body.jobDescription}
Location: ${body.location}
    `.trim();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0,
      system: SURVEY_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawText =
      response.content[0].type === 'text' ? response.content[0].text : '';

    const cleaned = rawText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const suggestion: SurveySuggestion = JSON.parse(cleaned);

    // Ensure all materials default to included
    suggestion.materials = suggestion.materials.map((m) => ({
      ...m,
      included: true,
    }));

    return Response.json({ success: true, suggestion });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Survey API error:', message, error);
    return Response.json(
      { success: false, error: `Failed to generate material suggestions: ${message}` },
      { status: 500 }
    );
  }
}
