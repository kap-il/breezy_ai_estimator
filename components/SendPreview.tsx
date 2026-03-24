'use client';

import { useState, useEffect, useRef } from 'react';
import { EstimateResult, JobFormData, ClientInfo, ClientPriceInfo } from '@/lib/types';

interface Props {
  estimate: EstimateResult;
  formData: JobFormData;
  clientPrice: ClientPriceInfo;
  onReset: () => void;
  onBackToSurvey: () => void;
}

export default function SendPreview({ estimate, formData, clientPrice, onReset, onBackToSurvey }: Props) {
  const [client, setClient] = useState<ClientInfo>({
    clientName: '',
    clientPhone: '',
    clientEmail: '',
  });

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setClient({ ...client, [e.target.name]: e.target.value });

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    let formatted = digits;
    if (digits.length > 6) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    else if (digits.length > 3) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    else if (digits.length > 0) formatted = `(${digits}`;
    setClient({ ...client, clientPhone: formatted });
  };

  const name = client.clientName || '[Client Name]';
  const email = client.clientEmail || '[client@email.com]';

  const priceDisplay = clientPrice.customPrice
    ? fmt(clientPrice.customPrice)
    : `${fmt(clientPrice.totalLow)} – ${fmt(clientPrice.totalHigh)}`;

  const defaultSms = `Hi ${name}, ${formData.businessName} sent you an estimate for: ${estimate.job_summary}. Total: ${priceDisplay}. Reply to discuss or book.`;

  const defaultEmail = `Hi ${name},

Thank you for reaching out. Please find your estimate below.

Job: ${estimate.job_summary}
Estimated Total: ${priceDisplay}

A detailed invoice is attached to this email.

To book or ask questions, just reply to this message.

Best,
${formData.ownerName}
${formData.businessName}${formData.ownerPhone ? `\n${formData.ownerPhone}` : ''}`;

  const [smsText, setSmsText] = useState(defaultSms);
  const [emailBody, setEmailBody] = useState(defaultEmail);
  const smsEditedRef = useRef(false);
  const emailEditedRef = useRef(false);

  // Re-generate defaults when client name changes, but only if user hasn't manually edited
  useEffect(() => {
    if (!smsEditedRef.current) setSmsText(defaultSms);
    if (!emailEditedRef.current) setEmailBody(defaultEmail);
  }, [defaultSms, defaultEmail]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg p-8 space-y-8">
        {/* Header */}
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Send to Client</h1>
          <p className="text-sm text-gray-500 mt-1">
            Preview what your client will receive, then send it with Breezy.
          </p>
        </div>

        {/* Client Info */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Who are you sending this to?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input
              name="clientName"
              placeholder="Client name"
              value={client.clientName}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
            />
            <input
              name="clientPhone"
              placeholder="(555) 123-4567"
              type="tel"
              value={client.clientPhone}
              onChange={handlePhoneChange}
              maxLength={14}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
            />
            <input
              name="clientEmail"
              placeholder="Client email"
              type="email"
              value={client.clientEmail}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
            />
          </div>
        </section>

        {/* SMS Preview */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">SMS Preview</h2>
          <div className="bg-gray-100 rounded-2xl p-4 max-w-md">
            <textarea
              value={smsText}
              onChange={(e) => {
                setSmsText(e.target.value);
                smsEditedRef.current = true;
              }}
              rows={4}
              className="w-full bg-blue-600 text-white rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed resize-none outline-none border-none focus:ring-2 focus:ring-blue-300"
            />
            <p className="text-xs text-gray-400 mt-2 ml-1">iMessage &middot; Click to edit</p>
          </div>
        </section>

        {/* Email Preview */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">Email Preview</h2>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-5 py-3 space-y-1 border-b border-gray-200 text-sm">
              <div>
                <span className="text-gray-500 font-medium">From:</span>{' '}
                <span className="text-gray-900">{formData.ownerName} &middot; {formData.businessName}</span>
              </div>
              <div>
                <span className="text-gray-500 font-medium">To:</span>{' '}
                <span className="text-gray-900">{email}</span>
              </div>
              <div>
                <span className="text-gray-500 font-medium">Subject:</span>{' '}
                <span className="text-gray-900 font-semibold">Your estimate from {formData.businessName}</span>
              </div>
            </div>
            <div className="px-5 py-4">
              <textarea
                value={emailBody}
                onChange={(e) => {
                  setEmailBody(e.target.value);
                  emailEditedRef.current = true;
                }}
                rows={12}
                className="w-full text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed resize-none outline-none border border-transparent focus:border-blue-300 focus:ring-2 focus:ring-blue-200 rounded-lg px-2 py-1 -mx-2 -my-1"
              />
            </div>
            <div className="border-t border-gray-200 px-5 py-3 bg-gray-50 text-sm text-gray-500 flex items-center gap-2">
              <span>📎</span>
              <span>{formData.businessName.replace(/\s+/g, '_')}_Estimate.pdf</span>
            </div>
          </div>
        </section>

        {/* Breezy CTA */}
        <section className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white space-y-3">
          <h2 className="text-xl font-bold">Ready to send this in one click?</h2>
          <p className="text-blue-100 text-sm">
            Breezy handles your estimates, follow-ups, and bookings automatically.
            Never chase a client again.
          </p>
          <a
            href="https://getbreezy.app/fast_questions?pro_onboarding=true"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-white text-blue-700 px-6 py-3 font-semibold hover:bg-blue-50 transition cursor-pointer"
          >
            Start Free Trial — 7 Days Free →
          </a>
        </section>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={onBackToSurvey}
            className="flex-1 rounded-lg border border-gray-300 px-6 py-3 text-gray-700 font-semibold hover:bg-gray-50 transition cursor-pointer"
          >
            Back to Survey
          </button>
          <button
            onClick={onReset}
            className="flex-1 rounded-lg border border-gray-300 px-6 py-3 text-gray-700 font-semibold hover:bg-gray-50 transition cursor-pointer"
          >
            New Estimate
          </button>
        </div>
      </div>
    </div>
  );
}
