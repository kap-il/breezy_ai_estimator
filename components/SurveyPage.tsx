'use client';

import { useState } from 'react';
import { SurveySuggestion, SurveyMaterial, SurveyConfirmedData, JobFormData } from '@/lib/types';

interface Props {
  suggestion: SurveySuggestion;
  formData: JobFormData;
  error: string | null;
  onConfirm: (confirmed: SurveyConfirmedData) => void;
  onBack: () => void;
}

export default function SurveyPage({ suggestion, formData, error, onConfirm, onBack }: Props) {
  const [materials, setMaterials] = useState<SurveyMaterial[]>(suggestion.materials);
  const [crewSize, setCrewSize] = useState(suggestion.suggested_crew_size);

  // Track which quantity fields have been confirmed (autofill or manual edit)
  const [confirmedQty, setConfirmedQty] = useState<Set<number>>(new Set());

  // New item form
  const [addingItem, setAddingItem] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newUnit, setNewUnit] = useState('each');

  // Autofill
  const [autofilling, setAutofilling] = useState(false);

  const handleAutofill = async () => {
    if (autofilling) return;
    setAutofilling(true);
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success && json.suggestion) {
        const newSuggestion = json.suggestion as SurveySuggestion;
        // Build lookup of suggested items by name
        const suggestedByName = new Map<string, SurveyMaterial>();
        for (const m of newSuggestion.materials) {
          suggestedByName.set(m.item.toLowerCase(), m);
        }
        // Update existing items: fill in quantity if currently 0
        const existingNames = new Set<string>();
        const updated = materials.map((m) => {
          const key = m.item.toLowerCase();
          existingNames.add(key);
          const suggested = suggestedByName.get(key);
          if (suggested && m.quantity === 0) {
            return { ...m, quantity: suggested.quantity };
          }
          return m;
        });
        // Add new items not already in the list
        const newItems = newSuggestion.materials.filter(
          (m: SurveyMaterial) => !existingNames.has(m.item.toLowerCase())
        );
        const merged = [...updated, ...newItems];
        setMaterials(merged);
        // Mark all quantities as confirmed after autofill
        setConfirmedQty(new Set(merged.map((_, i) => i)));
      }
    } catch {
      // silent — autofill is a convenience
    } finally {
      setAutofilling(false);
    }
  };

  const toggleMaterial = (index: number) => {
    setMaterials((prev) =>
      prev.map((m, i) => (i === index ? { ...m, included: !m.included } : m))
    );
  };

  const updateQuantity = (index: number, value: string) => {
    const qty = parseFloat(value);
    if (isNaN(qty) || qty < 0) return;
    setMaterials((prev) =>
      prev.map((m, i) => (i === index ? { ...m, quantity: qty } : m))
    );
    setConfirmedQty((prev) => new Set(prev).add(index));
  };

  const addCustomItem = () => {
    if (!newItem.trim()) return;
    const qty = parseFloat(newQty);
    if (isNaN(qty) || qty <= 0) return;

    setMaterials((prev) => {
      const updated = [
        ...prev,
        { item: newItem.trim(), quantity: qty, unit: newUnit.trim() || 'each', included: true },
      ];
      setConfirmedQty((p) => new Set(p).add(updated.length - 1));
      return updated;
    });
    setNewItem('');
    setNewQty('1');
    setNewUnit('each');
    setAddingItem(false);
  };

  const removeItem = (index: number) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  const includedCount = materials.filter((m) => m.included).length;

  const handleConfirm = () => {
    onConfirm({
      materials: materials.filter((m) => m.included),
      crew_size: crewSize,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg p-8 space-y-6">
        {/* Header */}
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Review Materials & Crew</h1>
          <p className="text-sm text-gray-500 mt-1">
            {formData.tradeType} &middot; {formData.location}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            We&apos;ve suggested materials for this job. Remove items you already have, adjust quantities, or add anything we missed.
          </p>
        </div>

        {/* Materials List */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">
              Materials & Supplies
            </h2>
            <span className="text-xs text-gray-400">
              {includedCount} of {materials.length} included
            </span>
          </div>

          <div className="space-y-2">
            {materials.map((m, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-lg border transition ${
                  m.included
                    ? 'border-gray-200 bg-white'
                    : 'border-gray-100 bg-gray-50 opacity-50'
                }`}
              >
                {/* Toggle */}
                <button
                  onClick={() => toggleMaterial(i)}
                  className={`w-6 h-6 rounded border text-xs font-bold transition cursor-pointer flex items-center justify-center flex-shrink-0 ${
                    m.included
                      ? 'border-green-400 bg-green-50 text-green-600 hover:bg-green-100'
                      : 'border-gray-300 bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}
                  title={m.included ? 'Remove from estimate' : 'Add back'}
                >
                  {m.included ? '✓' : '+'}
                </button>

                {/* Item name */}
                <span className={`flex-1 text-sm ${m.included ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                  {m.item}
                </span>

                {/* Quantity */}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={m.quantity}
                    onChange={(e) => updateQuantity(i, e.target.value)}
                    className={`w-16 text-right text-sm border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-200 outline-none ${
                      confirmedQty.has(i) ? 'text-gray-900' : 'text-gray-400'
                    }`}
                    min="0"
                    step="any"
                    disabled={!m.included}
                  />
                  <span className="text-xs text-gray-500 w-12">{m.unit}</span>
                </div>

                {/* Remove */}
                <button
                  onClick={() => removeItem(i)}
                  className="text-gray-300 hover:text-red-400 transition cursor-pointer text-sm"
                  title="Delete item"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Add custom item */}
          {addingItem ? (
            <div className="mt-3 p-3 rounded-lg border border-blue-200 bg-blue-50 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  placeholder="Item name"
                  className="flex-1 text-sm text-gray-900 border border-gray-200 rounded px-3 py-2 focus:ring-2 focus:ring-blue-200 outline-none"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && addCustomItem()}
                />
                <input
                  type="number"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="w-16 text-sm text-gray-900 border border-gray-200 rounded px-2 py-2 text-right focus:ring-2 focus:ring-blue-200 outline-none"
                  min="1"
                />
                <input
                  type="text"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="unit"
                  className="w-20 text-sm text-gray-900 border border-gray-200 rounded px-2 py-2 focus:ring-2 focus:ring-blue-200 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addCustomItem}
                  disabled={!newItem.trim()}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add Item
                </button>
                <button
                  onClick={() => setAddingItem(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => setAddingItem(true)}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                + Add custom item
              </button>
              <button
                onClick={handleAutofill}
                disabled={autofilling}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
              >
                {autofilling ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    Autofilling...
                  </>
                ) : (
                  'Autofill'
                )}
              </button>
            </div>
          )}
        </section>

        {/* Crew Size */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Crew Size</h2>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {crewSize === 0
                    ? 'Solo — just you, no employees'
                    : `You + ${crewSize} employee${crewSize > 1 ? 's' : ''}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCrewSize(Math.max(0, crewSize - 1))}
                  disabled={crewSize === 0}
                  className="w-8 h-8 rounded-full border border-gray-300 text-gray-600 font-bold hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer flex items-center justify-center"
                >
                  −
                </button>
                <span className="text-lg font-semibold text-gray-900 w-8 text-center">
                  {crewSize}
                </span>
                <button
                  onClick={() => setCrewSize(crewSize + 1)}
                  className="w-8 h-8 rounded-full border border-gray-300 text-gray-600 font-bold hover:bg-gray-100 transition cursor-pointer flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={onBack}
            className="flex-1 rounded-lg border border-gray-300 px-6 py-3 text-gray-700 font-semibold hover:bg-gray-50 transition cursor-pointer"
          >
            Back
          </button>
          <button
            onClick={handleConfirm}
            disabled={includedCount === 0}
            className="flex-2 rounded-lg bg-blue-600 px-6 py-3 text-white font-semibold hover:bg-blue-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Get Estimate ({includedCount} item{includedCount !== 1 ? 's' : ''})
          </button>
        </div>
      </div>
    </div>
  );
}
