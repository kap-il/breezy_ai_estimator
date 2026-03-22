# Breezy AI Job Estimator — Core Functionality Roadmap

## What We're Building

A Next.js lead magnet for Breezy AI that lets any service business owner
describe a job in plain English and instantly receive a professional,
client-ready estimate. The tool demonstrates Breezy's AI capabilities
directly — no promises, just proof.

**The funnel:**
```
Provider describes job
  → AI generates estimate
    → Provider previews client-facing quote
      → CTA: "Sign up for Breezy to send this in one click"
```

---

## App Flow (see FigJam diagram)

The app runs as a single-page state machine with three distinct states:

```
STATE 1: Job Form
  ↓ (submit)
API: POST /api/estimate → Claude Sonnet → Structured JSON
  ↓ (success)
STATE 2: Estimate Display
  ↓ (send to client →)
STATE 3: Send Preview + CTA
```

PDF generation is triggered from State 2 as a client-side action.
It runs independently of the state machine.

---

## Project Structure

```
breezy-estimator/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                  # Renders EstimatorApp
│   ├── globals.css
│   └── api/
│       └── estimate/
│           └── route.ts          # Claude API route handler
├── components/
│   ├── EstimatorApp.tsx          # Root state manager
│   ├── JobForm.tsx               # State 1
│   ├── EstimateDisplay.tsx       # State 2
│   ├── SendPreview.tsx           # State 3
│   └── InvoicePDF.tsx            # PDF preview component
├── lib/
│   ├── types.ts                  # Shared TypeScript interfaces
│   └── pdf.ts                    # jsPDF helper functions
├── public/
│   └── breezy-logo.png
├── .env.local
├── package.json
└── next.config.js
```

---

## Dependencies

```bash
npx create-next-app@latest breezy-estimator --typescript --tailwind --app
npm install @anthropic-ai/sdk jspdf jspdf-autotable
```

---

## TypeScript Interfaces

**`lib/types.ts`**

```typescript
export interface JobFormData {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  tradeType: string;
  jobDescription: string;
  location: string;
}

export interface MaterialLine {
  item: string;
  quantity: string;
  unit_cost_low: number;
  unit_cost_high: number;
}

export interface EstimateResult {
  trade: string;
  job_summary: string;
  materials: MaterialLine[];
  labor_hours_low: number;
  labor_hours_high: number;
  hourly_rate_low: number;
  hourly_rate_high: number;
  total_low: number;
  total_high: number;
  notes: string;
}

export interface ClientInfo {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
}

export type AppState = 'form' | 'estimate' | 'preview';
```

---

## API Layer — Claude Integration

**`app/api/estimate/route.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { JobFormData } from '@/lib/types';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert estimator for service businesses 
of all types — plumbing, HVAC, electrical, roofing, landscaping, catering, 
hair styling, personal training, cleaning, carpentry, painting, and more.

Given a job description, trade type, and location, return a detailed 
estimate as a single valid JSON object. NO markdown. NO explanation. 
NO code fences. Only raw JSON.

JSON shape:
{
  "trade": "string",
  "job_summary": "string — 1-2 sentence plain English summary",
  "materials": [
    {
      "item": "string",
      "quantity": "string",
      "unit_cost_low": number,
      "unit_cost_high": number
    }
  ],
  "labor_hours_low": number,
  "labor_hours_high": number,
  "hourly_rate_low": number,
  "hourly_rate_high": number,
  "total_low": number,
  "total_high": number,
  "notes": "string"
}

Rules:
- Always use realistic cost RANGES, never single point estimates
- Use BLS wage data as reference for labor rates by trade and region
- If location affects pricing, factor it in
- If materials are not applicable (e.g. haircut), return empty array []
- Be conservative and realistic — these estimates will be sent to real clients
- total_low and total_high must equal materials total + labor total`;

export async function POST(req: NextRequest) {
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

    return NextResponse.json({ success: true, estimate });
  } catch (error) {
    console.error('Estimate API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate estimate' },
      { status: 500 }
    );
  }
}
```

---

## Root State Manager

**`components/EstimatorApp.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { AppState, JobFormData, EstimateResult } from '@/lib/types';
import JobForm from './JobForm';
import EstimateDisplay from './EstimateDisplay';
import SendPreview from './SendPreview';

export default function EstimatorApp() {
  const [appState, setAppState] = useState<AppState>('form');
  const [formData, setFormData] = useState<JobFormData | null>(null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFormSubmit = async (data: JobFormData) => {
    setLoading(true);
    setError(null);
    setFormData(data);

    try {
      const res = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setEstimate(json.estimate);
      setAppState('estimate');
    } catch {
      setError('Something went wrong generating your estimate. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setAppState('form');
    setFormData(null);
    setEstimate(null);
    setError(null);
  };

  return (
    <main>
      {appState === 'form' && (
        <JobForm
          onSubmit={handleFormSubmit}
          loading={loading}
          error={error}
        />
      )}
      {appState === 'estimate' && estimate && formData && (
        <EstimateDisplay
          estimate={estimate}
          formData={formData}
          onSendToClient={() => setAppState('preview')}
          onReset={handleReset}
        />
      )}
      {appState === 'preview' && estimate && formData && (
        <SendPreview
          estimate={estimate}
          formData={formData}
          onReset={handleReset}
        />
      )}
    </main>
  );
}
```

---

## State 1 — Job Form

**`components/JobForm.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { JobFormData } from '@/lib/types';

interface Props {
  onSubmit: (data: JobFormData) => void;
  loading: boolean;
  error: string | null;
}

export default function JobForm({ onSubmit, loading, error }: Props) {
  const [form, setForm] = useState<JobFormData>({
    businessName: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    tradeType: '',
    jobDescription: '',
    location: '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm({ ...form, [e.target.name]: e.target.value });

  const isValid =
    form.businessName &&
    form.ownerName &&
    form.tradeType &&
    form.jobDescription &&
    form.location;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>

      <h1>Get Your Job Estimate</h1>
      <p>Describe any job. Get a professional estimate in seconds.</p>

      {/* Provider Info */}
      <section>
        <h2>Your Business</h2>
        <input name="businessName" placeholder="Business name *"
          value={form.businessName} onChange={handleChange} required />
        <input name="ownerName" placeholder="Your name *"
          value={form.ownerName} onChange={handleChange} required />
        <input name="ownerEmail" placeholder="Your email"
          type="email" value={form.ownerEmail} onChange={handleChange} />
        <input name="ownerPhone" placeholder="Your phone"
          type="tel" value={form.ownerPhone} onChange={handleChange} />
      </section>

      {/* Job Info */}
      <section>
        <h2>The Job</h2>
        <input name="tradeType"
          placeholder="Type of work (e.g. Plumbing, HVAC, Catering...) *"
          value={form.tradeType} onChange={handleChange} required />
        <textarea name="jobDescription"
          placeholder="Describe the job in detail. The more you tell us, the better the estimate. *"
          value={form.jobDescription} onChange={handleChange}
          rows={4} required />
        <input name="location" placeholder="City or zip code *"
          value={form.location} onChange={handleChange} required />
      </section>

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={!isValid || loading}>
        {loading ? 'Generating estimate...' : 'Generate Estimate →'}
      </button>

    </form>
  );
}
```

---

## State 2 — Estimate Display

**`components/EstimateDisplay.tsx`**

```typescript
'use client';

import { EstimateResult, JobFormData } from '@/lib/types';
import { generatePDF } from '@/lib/pdf';

interface Props {
  estimate: EstimateResult;
  formData: JobFormData;
  onSendToClient: () => void;
  onReset: () => void;
}

export default function EstimateDisplay({
  estimate, formData, onSendToClient, onReset
}: Props) {
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div>

      {/* Header */}
      <div>
        <h1>{formData.businessName}</h1>
        <p>{estimate.trade} · {formData.location}</p>
      </div>

      {/* Job Summary */}
      <section>
        <h2>Job Summary</h2>
        <p>{estimate.job_summary}</p>
      </section>

      {/* Materials Table */}
      {estimate.materials.length > 0 && (
        <section>
          <h2>Materials</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit Cost</th>
              </tr>
            </thead>
            <tbody>
              {estimate.materials.map((m, i) => (
                <tr key={i}>
                  <td>{m.item}</td>
                  <td>{m.quantity}</td>
                  <td>{fmt(m.unit_cost_low)} – {fmt(m.unit_cost_high)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Labor */}
      <section>
        <h2>Labor</h2>
        <p>
          {estimate.labor_hours_low}–{estimate.labor_hours_high} hrs ×{' '}
          {fmt(estimate.hourly_rate_low)}–{fmt(estimate.hourly_rate_high)}/hr
        </p>
      </section>

      {/* Total */}
      <section>
        <h2>Estimated Total</h2>
        <p>{fmt(estimate.total_low)} – {fmt(estimate.total_high)}</p>
      </section>

      {/* Notes */}
      {estimate.notes && (
        <section>
          <h2>Notes</h2>
          <p>{estimate.notes}</p>
        </section>
      )}

      {/* Actions */}
      <div>
        <button onClick={() => generatePDF(estimate, formData)}>
          Download PDF Invoice
        </button>
        <button onClick={onSendToClient}>
          Send to Client →
        </button>
        <button onClick={onReset}>
          New Estimate
        </button>
      </div>

    </div>
  );
}
```

---

## State 3 — Send Preview + CTA

**`components/SendPreview.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { EstimateResult, JobFormData, ClientInfo } from '@/lib/types';

interface Props {
  estimate: EstimateResult;
  formData: JobFormData;
  onReset: () => void;
}

export default function SendPreview({ estimate, formData, onReset }: Props) {
  const [client, setClient] = useState<ClientInfo>({
    clientName: '',
    clientPhone: '',
    clientEmail: '',
  });

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setClient({ ...client, [e.target.name]: e.target.value });

  const name = client.clientName || '[Client Name]';
  const email = client.clientEmail || '[client@email.com]';

  const smsText = `Hi ${name}, ${formData.businessName} sent you an estimate for: ${estimate.job_summary}. Total: ${fmt(estimate.total_low)}–${fmt(estimate.total_high)}. Reply to discuss or book.`;

  const emailBody = `Hi ${name},

Thank you for reaching out. Please find your estimate below.

Job: ${estimate.job_summary}
Estimated Total: ${fmt(estimate.total_low)} – ${fmt(estimate.total_high)}

A detailed invoice is attached to this email.

To book or ask questions, just reply to this message.

Best,
${formData.ownerName}
${formData.businessName}
${formData.ownerPhone || ''}`;

  return (
    <div>

      {/* Client Info */}
      <section>
        <h2>Who are you sending this to?</h2>
        <input name="clientName" placeholder="Client name"
          value={client.clientName} onChange={handleChange} />
        <input name="clientPhone" placeholder="Client phone"
          type="tel" value={client.clientPhone} onChange={handleChange} />
        <input name="clientEmail" placeholder="Client email"
          type="email" value={client.clientEmail} onChange={handleChange} />
      </section>

      {/* SMS Preview */}
      <section>
        <h2>SMS Preview</h2>
        <div className="sms-bubble">
          <p>{smsText}</p>
        </div>
      </section>

      {/* Email Preview */}
      <section>
        <h2>Email Preview</h2>
        <div className="email-preview">
          <div><span>From:</span> {formData.ownerName} · {formData.businessName}</div>
          <div><span>To:</span> {email}</div>
          <div><span>Subject:</span> Your estimate from {formData.businessName}</div>
          <pre>{emailBody}</pre>
          <div>📎 {formData.businessName.replace(/\s+/g, '_')}_Estimate.pdf</div>
        </div>
      </section>

      {/* Breezy CTA */}
      <section>
        <h2>Ready to send this in one click?</h2>
        <p>
          Breezy handles your estimates, follow-ups, and bookings automatically.
          Never chase a client again.
        </p>
        <a
          href="https://getbreezy.app/fast_questions?pro_onboarding=true"
          target="_blank"
          rel="noopener noreferrer"
        >
          Start Free Trial — 7 Days Free →
        </a>
        <button onClick={onReset}>Generate Another Estimate</button>
      </section>

    </div>
  );
}
```

---

## PDF Generation

**`lib/pdf.ts`**

```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EstimateResult, JobFormData } from './types';

export function generatePDF(estimate: EstimateResult, formData: JobFormData) {
  const doc = new jsPDF();
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const estimateNumber = `EST-${Date.now().toString().slice(-6)}`;
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(formData.businessName, 20, 25);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  if (formData.ownerPhone) doc.text(formData.ownerPhone, 20, 32);
  if (formData.ownerEmail) doc.text(formData.ownerEmail, 20, 38);

  doc.setTextColor(0);
  doc.text(`Estimate #: ${estimateNumber}`, 140, 25);
  doc.text(`Date: ${today}`, 140, 32);

  // Divider
  doc.setDrawColor(200);
  doc.line(20, 45, 190, 45);

  // Job Summary
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Job Summary', 20, 55);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const summaryLines = doc.splitTextToSize(estimate.job_summary, 170);
  doc.text(summaryLines, 20, 63);

  let y = 63 + summaryLines.length * 6 + 10;

  // Materials Table
  if (estimate.materials.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Materials', 20, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Item', 'Qty', 'Cost (Low)', 'Cost (High)']],
      body: estimate.materials.map((m) => [
        m.item, m.quantity, fmt(m.unit_cost_low), fmt(m.unit_cost_high),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 30, 30] },
      margin: { left: 20, right: 20 },
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Labor
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Labor', 20, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${estimate.labor_hours_low}–${estimate.labor_hours_high} hrs × ${fmt(estimate.hourly_rate_low)}–${fmt(estimate.hourly_rate_high)}/hr`,
    20, y
  );
  y += 14;

  // Total
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Estimated Total', 20, y);
  doc.text(`${fmt(estimate.total_low)} – ${fmt(estimate.total_high)}`, 130, y);
  y += 14;

  // Notes
  if (estimate.notes) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100);
    const noteLines = doc.splitTextToSize(`Note: ${estimate.notes}`, 170);
    doc.text(noteLines, 20, y);
  }

  // Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150);
  doc.text('Powered by Breezy · getbreezy.app', 20, 285);
  doc.text('This estimate is valid for 30 days from the date issued.', 20, 290);

  doc.save(
    `${formData.businessName.replace(/\s+/g, '_')}_Estimate_${estimateNumber}.pdf`
  );
}
```

---

## Environment Setup

**`.env.local`**
```
ANTHROPIC_API_KEY=your_key_here
```

Also add `ANTHROPIC_API_KEY` to your Vercel project environment variables before deploying.

---

## Build Order

Follow this sequence exactly — don't skip ahead:

```
1.  npx create-next-app@latest breezy-estimator --typescript --tailwind --app
2.  npm install @anthropic-ai/sdk jspdf jspdf-autotable
3.  Create .env.local
4.  Build lib/types.ts
5.  Build app/api/estimate/route.ts
6.  Test API with curl:
    curl -X POST http://localhost:3000/api/estimate \
      -H "Content-Type: application/json" \
      -d '{"tradeType":"Plumbing","jobDescription":"Fix leaky faucet","location":"Austin TX","businessName":"Test Co","ownerName":"John","ownerEmail":"","ownerPhone":""}'
7.  Build lib/pdf.ts
8.  Build components/JobForm.tsx
9.  Build components/EstimateDisplay.tsx
10. Build components/SendPreview.tsx
11. Build components/EstimatorApp.tsx
12. Wire into app/page.tsx
13. Basic Tailwind styling pass
14. vercel --prod
```

---

## Test Cases

Run all of these before submitting:

| Trade | Description |
|---|---|
| Plumbing | Fix a leaky kitchen faucet, replace shutoff valve, Austin TX |
| HVAC | Full AC unit replacement, 2000 sq ft home, Phoenix AZ |
| Catering | Wedding reception for 150 people, 3 course meal, Chicago IL |
| Landscaping | Weekly lawn maintenance for 1 acre property, Nashville TN |
| Hair stylist | Color treatment, cut and style, highlights, NYC |
| Edge case | Vague one-word input — must not crash |
| Edge case | Very large complex job — verify totals add up |

---

## Deployment Checklist

- [ ] `ANTHROPIC_API_KEY` set in Vercel env vars
- [ ] PDF downloads correctly in Chrome and Safari
- [ ] Mobile responsive at 375px width
- [ ] Error state handles API failure gracefully
- [ ] CTA link points to correct Breezy onboarding URL
- [ ] GitHub repo is public with a clean README
- [ ] Vercel deployment URL is live and accessible

---

*Powered by Breezy · getbreezy.app*
