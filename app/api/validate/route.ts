import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const VALIDATE_PROMPT = `You validate job estimate form submissions for a service business estimator tool.

Given a trade type, job description, and location, check:

1. JOB DESCRIPTION: Is this a real, legitimate service job? It must describe actual work that a service business would perform. Reject nonsense, gibberish, offensive content, jokes, or descriptions that have nothing to do with a real service job.

2. LOCATION: Is this a real US location? It must be either:
   - A valid US zip code (5 digits)
   - A real US city/town + state (e.g. "Austin, TX", "Portland, Oregon")
   - A recognizable US city name (e.g. "Chicago", "Miami")
   Reject fake locations, non-US locations, gibberish, or anything that isn't a verifiable US place.

3. TRADE TYPE: Is this a real trade or service category? (e.g. plumbing, electrical, catering, painting, HVAC, landscaping, baking, etc.) Reject nonsense or fake trades.

Return ONLY a JSON object. NO markdown. NO code fences.

If everything is valid:
{"valid": true}

If anything is invalid:
{"valid": false, "errors": ["clear, user-friendly error message for each issue"]}

RULES:
- Be strict about nonsense/gibberish/offensive content
- Be lenient about spelling mistakes or informal descriptions of real jobs
- A vague but real job description is OK (e.g. "fix my sink" is fine)
- Location must be a real, verifiable US place — not "Narnia" or "asdf"
- If the job description mentions something real but unusual, allow it`;

interface ValidateBody {
  tradeType: string;
  jobDescription: string;
  location: string;
}

export async function POST(req: Request) {
  try {
    const body: ValidateBody = await req.json();

    const userMessage = `Trade type: ${body.tradeType}
Job description: ${body.jobDescription}
Location: ${body.location}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      temperature: 0,
      system: VALIDATE_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleaned);

    if (!result.valid) {
      return Response.json(
        { success: false, errors: result.errors || ['Invalid input. Please check your job details and location.'] },
        { status: 400 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Validate API error:', error);
    return Response.json(
      { success: false, errors: ['Validation check failed. Please try again.'] },
      { status: 500 }
    );
  }
}
