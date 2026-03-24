'use client';

import { useState, useMemo } from 'react';
import { EstimateResult, JobFormData } from '@/lib/types';
import { generatePDF } from '@/lib/pdf';

interface Props {
  estimate: EstimateResult;
  formData: JobFormData;
  loading: boolean;
  onLocationChange: (newLocation: string) => void;
  onSendToClient: () => void;
  onReset: () => void;
  onBackToSurvey: () => void;
}

export default function EstimateDisplay({
  estimate,
  formData,
  loading,
  onLocationChange,
  onSendToClient,
  onReset,
  onBackToSurvey,
}: Props) {
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  // Location editing
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState(formData.location);

  // Track which material rows are excluded (by index)
  const [excludedItems, setExcludedItems] = useState<Set<number>>(new Set());

  // Employee count derived from estimate (locked in survey, not adjustable here)
  const employeeCount = estimate.employee_cost_breakdown ? 1 : 0;

  // Pricing view: hourly vs flat rate
  const [showFlatRate, setShowFlatRate] = useState(false);

  // Custom price for PDF invoice
  const [customPrice, setCustomPrice] = useState('');

  // Per-employee burden rate: use breakdown if available, else derive
  const ecb = estimate.employee_cost_breakdown;
  const burdenPerHourLow = ecb
    ? ecb.total_burden_low
    : estimate.provider_labor_cost_low > 0
      ? estimate.provider_labor_cost_low / Math.max(estimate.labor_hours_low, 1)
      : estimate.hourly_rate_low * 0.4;
  const burdenPerHourHigh = ecb
    ? ecb.total_burden_high
    : estimate.provider_labor_cost_high > 0
      ? estimate.provider_labor_cost_high / Math.max(estimate.labor_hours_high, 1)
      : estimate.hourly_rate_high * 0.4;

  const toggleItem = (index: number) => {
    setExcludedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Recalculate everything based on exclusions and employee count
  const calc = useMemo(() => {
    let materialTotalLow = 0;
    let materialTotalHigh = 0;
    for (let i = 0; i < estimate.materials.length; i++) {
      if (excludedItems.has(i)) continue;
      const m = estimate.materials[i];
      materialTotalLow += m.quantity * m.unit_cost_low;
      materialTotalHigh += m.quantity * m.unit_cost_high;
    }

    const laborTotalLow = estimate.labor_hours_low * estimate.hourly_rate_low;
    const laborTotalHigh = estimate.labor_hours_high * estimate.hourly_rate_high;

    const clientTotalLow = materialTotalLow + laborTotalLow;
    const clientTotalHigh = materialTotalHigh + laborTotalHigh;

    // Provider material cost scales proportionally to excluded items
    const origMaterialTotalLow = estimate.materials.reduce((sum, m) => sum + m.quantity * m.unit_cost_low, 0);
    const origMaterialTotalHigh = estimate.materials.reduce((sum, m) => sum + m.quantity * m.unit_cost_high, 0);

    const materialRatioLow = origMaterialTotalLow > 0 ? materialTotalLow / origMaterialTotalLow : 0;
    const materialRatioHigh = origMaterialTotalHigh > 0 ? materialTotalHigh / origMaterialTotalHigh : 0;

    const providerMaterialLow = estimate.provider_material_cost_low * materialRatioLow;
    const providerMaterialHigh = estimate.provider_material_cost_high * materialRatioHigh;

    // Provider labor cost: burden rate × hours × employees
    const providerLaborLow = employeeCount > 0
      ? burdenPerHourLow * estimate.labor_hours_low * employeeCount
      : 0;
    const providerLaborHigh = employeeCount > 0
      ? burdenPerHourHigh * estimate.labor_hours_high * employeeCount
      : 0;

    const providerTotalLow = providerMaterialLow + providerLaborLow;
    const providerTotalHigh = providerMaterialHigh + providerLaborHigh;

    const profitLow = clientTotalLow - providerTotalHigh;
    const profitHigh = clientTotalHigh - providerTotalLow;

    return {
      materialTotalLow, materialTotalHigh,
      clientTotalLow, clientTotalHigh,
      providerMaterialLow, providerMaterialHigh,
      providerLaborLow, providerLaborHigh,
      providerTotalLow, providerTotalHigh,
      profitLow, profitHigh,
    };
  }, [estimate, excludedItems, employeeCount, burdenPerHourLow, burdenPerHourHigh]);

  const isSolo = employeeCount === 0;

  // Project-based = no labor hours (pastry orders, catering, etc.)
  const isProjectBased = estimate.labor_hours_low === 0 && estimate.labor_hours_high === 0;

  // Derive flat rate client-side
  // Flat rates assume a clean job with no complications — tighter, more optimistic range
  // Project jobs: flat rate = client total as-is
  // Duration jobs: anchor to low estimate (best case), tight range up to ~10% above
  const flatRate = useMemo(() => {
    const fr = estimate.flat_rate;
    const unit = fr?.unit || 'per project';
    const quantity = fr?.quantity || 1;

    let flatTotalLow: number;
    let flatTotalHigh: number;

    if (isProjectBased) {
      flatTotalLow = calc.clientTotalLow;
      flatTotalHigh = calc.clientTotalHigh;
    } else {
      // Optimistic: low end is the best-case hourly total, high end is ~10% above that
      flatTotalLow = calc.clientTotalLow;
      flatTotalHigh = calc.clientTotalLow * 1.10;
    }

    return {
      unit,
      quantity,
      rate_low: Math.round((flatTotalLow / quantity) * 4) / 4,
      rate_high: Math.round((flatTotalHigh / quantity) * 4) / 4,
      total_low: Math.round(flatTotalLow * 100) / 100,
      total_high: Math.round(flatTotalHigh * 100) / 100,
    };
  }, [calc.clientTotalLow, calc.clientTotalHigh, estimate.flat_rate, isProjectBased]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg p-8 space-y-6">
        {/* Header */}
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {formData.businessName}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-gray-500">{estimate.trade} &middot;</span>
            {editingLocation ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={locationDraft}
                  onChange={(e) => setLocationDraft(e.target.value)}
                  className="border border-blue-300 rounded px-2 py-1 text-sm text-gray-900 focus:ring-2 focus:ring-blue-200 outline-none w-48"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && locationDraft.trim() && locationDraft !== formData.location) {
                      setEditingLocation(false);
                      onLocationChange(locationDraft.trim());
                    } else if (e.key === 'Escape') {
                      setLocationDraft(formData.location);
                      setEditingLocation(false);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (locationDraft.trim() && locationDraft !== formData.location) {
                      setEditingLocation(false);
                      onLocationChange(locationDraft.trim());
                    } else {
                      setLocationDraft(formData.location);
                      setEditingLocation(false);
                    }
                  }}
                  disabled={loading}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer disabled:opacity-50"
                >
                  {locationDraft !== formData.location ? 'Update' : 'Cancel'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingLocation(true)}
                className="text-gray-500 hover:text-blue-600 transition group flex items-center gap-1 cursor-pointer"
              >
                <span>{formData.location}</span>
                <span className="text-xs text-gray-400 group-hover:text-blue-500">(change)</span>
              </button>
            )}
            {estimate.location_adjustment && estimate.location_adjustment !== 1 && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                {estimate.location_adjustment}x regional adj.
              </span>
            )}
          </div>
          {loading && (
            <p className="text-sm text-blue-600 mt-2 animate-pulse">
              Recalculating estimate for new location...
            </p>
          )}
        </div>

        {/* Job Summary */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Job Summary
          </h2>
          <p className="text-gray-600">{estimate.job_summary}</p>
        </section>

        {/* Materials Table */}
        {estimate.materials.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-gray-800">
                Materials &amp; Services
              </h2>
              {excludedItems.size > 0 && (
                <span className="text-xs text-gray-400">
                  {excludedItems.size} item{excludedItems.size > 1 ? 's' : ''} excluded
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-600">
                    <th className="pl-4 pr-2 py-3 font-medium w-8"></th>
                    <th className="px-3 py-3 font-medium">Item</th>
                    <th className="px-3 py-3 font-medium text-center">Qty</th>
                    <th className="px-3 py-3 font-medium text-right">Unit Cost</th>
                    <th className="px-3 py-3 font-medium text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {estimate.materials.map((m, i) => {
                    const excluded = excludedItems.has(i);
                    return (
                      <tr key={i} className={excluded ? 'opacity-40' : ''}>
                        <td className="pl-4 pr-2 py-3">
                          <button
                            onClick={() => toggleItem(i)}
                            className={`w-6 h-6 rounded border text-xs font-bold transition cursor-pointer flex items-center justify-center ${
                              excluded
                                ? 'border-gray-300 bg-gray-100 text-gray-400 hover:bg-gray-200'
                                : 'border-red-300 bg-red-50 text-red-500 hover:bg-red-100'
                            }`}
                            title={excluded ? 'Add back to estimate' : 'Already have this \u2014 remove from estimate'}
                          >
                            {excluded ? '+' : '\u2212'}
                          </button>
                        </td>
                        <td className={`px-3 py-3 ${excluded ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {m.item}
                        </td>
                        <td className={`px-3 py-3 text-center ${excluded ? 'text-gray-400' : 'text-gray-600'}`}>
                          {m.quantity}
                        </td>
                        <td className={`px-3 py-3 text-right ${excluded ? 'text-gray-400' : 'text-gray-900'}`}>
                          {fmt(m.unit_cost_low)} &ndash; {fmt(m.unit_cost_high)}
                        </td>
                        <td className={`px-3 py-3 text-right font-medium ${excluded ? 'text-gray-400' : 'text-gray-900'}`}>
                          {fmt(m.quantity * m.unit_cost_low)} &ndash; {fmt(m.quantity * m.unit_cost_high)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Labor + Crew Adjuster */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Labor</h2>

          {/* Hourly vs Flat Rate toggle */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setShowFlatRate(false)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                !showFlatRate ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Hourly Rate
            </button>
            <button
              onClick={() => setShowFlatRate(true)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                showFlatRate ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Flat Rate ({flatRate.unit})
            </button>
          </div>

          {showFlatRate ? (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rate per {flatRate.unit}</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {fmt(flatRate.rate_low)} &ndash; {fmt(flatRate.rate_high)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Quantity</p>
                  <p className="text-lg font-semibold text-gray-900">{flatRate.quantity} {flatRate.unit}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Flat Total</p>
                  <p className="text-lg font-bold text-blue-700">
                    {fmt(flatRate.total_low)} &ndash; {fmt(flatRate.total_high)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">Flat rate assumes a straightforward job with no additional services</p>
            </div>
          ) : (
            <p className="text-gray-600 mb-4">
              {estimate.labor_hours_low}&ndash;{estimate.labor_hours_high} hrs
              &times; {fmt(estimate.hourly_rate_low)}&ndash;
              {fmt(estimate.hourly_rate_high)}/hr
            </p>
          )}

          {/* Crew info (read-only, set in survey) */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Crew Size</p>
                <p className="text-xs text-gray-500">
                  {isSolo
                    ? 'Solo — just you, no employees'
                    : `You + employees`}
                </p>
              </div>
              <button
                onClick={onBackToSurvey}
                className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer font-medium"
              >
                Change in survey
              </button>
            </div>
          </div>
        </section>

        {/* Provider Cost */}
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">
            Your Cost to Complete This Job
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            {isSolo
              ? 'Material costs only \u2014 solo job, your labor is paid through profit'
              : 'What you\u2019ll spend on materials & fully-burdened crew wages'}
          </p>
          <div className={`grid grid-cols-1 ${!isSolo ? 'sm:grid-cols-2' : ''} gap-4 mb-4`}>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Material Cost (Wholesale)</p>
              <p className="text-lg font-bold text-amber-800">
                {fmt(calc.providerMaterialLow)} &ndash; {fmt(calc.providerMaterialHigh)}
              </p>
            </div>
            {!isSolo && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Crew Cost ({employeeCount} employee{employeeCount > 1 ? 's' : ''})
                </p>
                <p className="text-lg font-bold text-amber-800">
                  {fmt(calc.providerLaborLow)} &ndash; {fmt(calc.providerLaborHigh)}
                </p>
                {/* Employee cost breakdown */}
                {ecb && (
                  <div className="mt-2 text-xs text-amber-700 space-y-0.5">
                    <p>Base wage: {fmt(ecb.base_wage_low)}&ndash;{fmt(ecb.base_wage_high)}/hr</p>
                    <p>Payroll tax: +{fmt(ecb.payroll_tax)}/hr</p>
                    <p>Workers comp: +{fmt(ecb.workers_comp)}/hr</p>
                    <p>Insurance: +{fmt(ecb.insurance)}/hr</p>
                    <p className="font-semibold pt-1 border-t border-amber-200">
                      Fully burdened: {fmt(ecb.total_burden_low)}&ndash;{fmt(ecb.total_burden_high)}/hr per employee
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="border-t border-amber-200 pt-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Out-of-Pocket</p>
            <p className="text-2xl font-bold text-amber-900">
              {fmt(calc.providerTotalLow)} &ndash; {fmt(calc.providerTotalHigh)}
            </p>
          </div>
        </section>

        {/* Client Price */}
        <section className="bg-blue-50 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">
            Estimated Client Price
          </h2>
          <p className="text-sm text-gray-500 mb-2">
            {showFlatRate ? 'Flat rate quote to the client' : 'Total price quoted to the client (materials + labor + markup)'}
          </p>
          <p className="text-3xl font-bold text-blue-700">
            {showFlatRate
              ? <>{fmt(flatRate.total_low)} &ndash; {fmt(flatRate.total_high)}</>
              : <>{fmt(calc.clientTotalLow)} &ndash; {fmt(calc.clientTotalHigh)}</>
            }
          </p>
          <p className="text-sm text-green-700 mt-2 font-medium">
            Est. gross profit: {fmt(
              (showFlatRate ? flatRate.total_low : calc.clientTotalLow) - calc.providerTotalHigh
            )} &ndash; {fmt(
              (showFlatRate ? flatRate.total_high : calc.clientTotalHigh) - calc.providerTotalLow
            )}
          </p>
        </section>

        {/* Notes */}
        {estimate.notes && (
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Notes</h2>
            <p className="text-gray-500 text-sm italic">{estimate.notes}</p>
          </section>
        )}

        {/* Invoice Price + Actions */}
        <section className="pt-4 border-t border-gray-200 space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-800 block mb-1">
              Your price for the invoice
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-lg">$</span>
              <input
                type="number"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder={showFlatRate
                  ? ((flatRate.total_low + flatRate.total_high) / 2).toFixed(2)
                  : ((calc.clientTotalLow + calc.clientTotalHigh) / 2).toFixed(2)
                }
                min="0"
                step="0.01"
                className="w-40 rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
              />
              <p className="text-xs text-gray-400">This is the single price shown on the PDF</p>
            </div>
          </div>
        </section>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              const price = customPrice
                ? parseFloat(customPrice)
                : showFlatRate
                  ? (flatRate.total_low + flatRate.total_high) / 2
                  : (calc.clientTotalLow + calc.clientTotalHigh) / 2;
              generatePDF(estimate, formData, price);
            }}
            className="flex-1 rounded-lg border border-gray-300 px-6 py-3 text-gray-700 font-semibold hover:bg-gray-50 transition cursor-pointer"
          >
            Download PDF Invoice
          </button>
          <button
            onClick={onSendToClient}
            className="flex-1 rounded-lg bg-blue-600 px-6 py-3 text-white font-semibold hover:bg-blue-700 transition cursor-pointer"
          >
            Send to Client →
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
