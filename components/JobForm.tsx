'use client';

import { useState } from 'react';
import { JobFormData } from '@/lib/types';

interface Props {
  onSubmit: (data: JobFormData) => void;
  loading: boolean;
  error: string | null;
  initialData?: JobFormData | null;
}

export default function JobForm({ onSubmit, loading, error, initialData }: Props) {
  const [form, setForm] = useState<JobFormData>(initialData || {
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

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    let formatted = digits;
    if (digits.length > 6) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    else if (digits.length > 3) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    else if (digits.length > 0) formatted = `(${digits}`;
    setForm({ ...form, ownerPhone: formatted });
  };

  const isValid =
    form.businessName &&
    form.ownerName &&
    form.tradeType &&
    form.jobDescription &&
    form.location;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(form);
        }}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8 space-y-8"
      >
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">
            Get Your Job Estimate
          </h1>
          <p className="text-gray-500">
            Describe any job. Get a professional estimate in seconds.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Your Business</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              name="businessName"
              placeholder="Business name *"
              value={form.businessName}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
            />
            <input
              name="ownerName"
              placeholder="Your name *"
              value={form.ownerName}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
            />
            <input
              name="ownerEmail"
              placeholder="Your email"
              type="email"
              value={form.ownerEmail}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
            />
            <input
              name="ownerPhone"
              placeholder="(555) 123-4567"
              type="tel"
              value={form.ownerPhone}
              onChange={handlePhoneChange}
              maxLength={14}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">The Job</h2>
          <textarea
            name="jobDescription"
            placeholder={"e.g. Interior painting of a 3-bedroom apartment — 10 walls (~9ft x 15ft each), 2 coats of eggshell paint, solo job, includes prep and cleanup. About 2–3 days of work.\n\nInclude: what's being done, scope/size, # of workers (or solo), estimated duration, and any special requirements."}
            value={form.jobDescription}
            onChange={handleChange}
            rows={5}
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition resize-none"
          />
          <input
            name="tradeType"
            placeholder="Type of work (e.g. Plumbing, HVAC, Catering...) *"
            value={form.tradeType}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
          />
          <input
            name="location"
            placeholder="City + State or Zip Code (e.g. Austin, TX or 78701) *"
            value={form.location}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
          />
        </section>

        {error && (
          <p className="text-red-600 bg-red-50 rounded-lg px-4 py-3 text-sm">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!isValid || loading}
          className="w-full rounded-lg bg-blue-600 px-6 py-3.5 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
        >
          {loading ? 'Generating estimate...' : 'Generate Estimate →'}
        </button>
      </form>
    </div>
  );
}
