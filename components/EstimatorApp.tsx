'use client';

import { useState } from 'react';
import { AppState, JobFormData, EstimateResult, SurveySuggestion, SurveyConfirmedData, ClientPriceInfo } from '@/lib/types';
import JobForm from './JobForm';
import SurveyPage from './SurveyPage';
import EstimateDisplay from './EstimateDisplay';
import SendPreview from './SendPreview';

export default function EstimatorApp() {
  const [appState, setAppState] = useState<AppState>('form');
  const [formData, setFormData] = useState<JobFormData | null>(null);
  const [survey, setSurvey] = useState<SurveySuggestion | null>(null);
  const [confirmedData, setConfirmedData] = useState<SurveyConfirmedData | null>(null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [clientPrice, setClientPrice] = useState<ClientPriceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Form submit → validate inputs → fetch survey suggestions
  const handleFormSubmit = async (data: JobFormData) => {
    setFormData(data);
    setLoading(true);
    setError(null);
    setAppState('survey_loading');

    try {
      // Validate job description, trade type, and location first
      const valRes = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeType: data.tradeType,
          jobDescription: data.jobDescription,
          location: data.location,
        }),
      });

      const valJson = await valRes.json();
      if (!valJson.success) {
        const errors: string[] = valJson.errors || ['Invalid input.'];
        throw new Error(errors.join(' '));
      }

      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setSurvey(json.suggestion);
      setAppState('survey');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setAppState('form');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Survey confirm → fetch priced estimate
  const handleSurveyConfirm = async (confirmed: SurveyConfirmedData) => {
    if (!formData) return;
    setConfirmedData(confirmed);
    setLoading(true);
    setError(null);
    setAppState('estimate_loading');

    try {
      const res = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData, confirmed }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setEstimate(json.estimate);
      setAppState('estimate');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong generating your estimate.';
      setError(msg);
      setAppState('survey');
    } finally {
      setLoading(false);
    }
  };

  // Location change from estimate screen → re-price with same confirmed materials
  const handleLocationChange = async (newLocation: string) => {
    if (!formData || !confirmedData) return;
    const updatedFormData = { ...formData, location: newLocation };
    setFormData(updatedFormData);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData: updatedFormData, confirmed: confirmedData }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setEstimate(json.estimate);
    } catch {
      setError('Failed to recalculate for new location.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setAppState('form');
    setFormData(null);
    setSurvey(null);
    setConfirmedData(null);
    setEstimate(null);
    setClientPrice(null);
    setError(null);
  };

  const handleBackToSurvey = () => {
    // Restore survey state from last confirmed data so edits persist
    if (confirmedData && survey) {
      setSurvey({
        ...survey,
        materials: confirmedData.materials,
        suggested_crew_size: confirmedData.crew_size,
      });
    }
    setAppState('survey');
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
          initialData={formData}
        />
      )}

      {appState === 'survey_loading' && (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
            <div className="animate-spin mx-auto w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            <p className="text-gray-600 font-medium">Analyzing your job and suggesting materials...</p>
            <p className="text-sm text-gray-400">This takes a few seconds</p>
          </div>
        </div>
      )}

      {appState === 'survey' && survey && formData && (
        <SurveyPage
          suggestion={survey}
          formData={formData}
          error={error}
          onConfirm={handleSurveyConfirm}
          onBack={() => {
            setAppState('form');
            setError(null);
          }}
        />
      )}

      {appState === 'estimate_loading' && (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
            <div className="animate-spin mx-auto w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            <p className="text-gray-600 font-medium">Pricing your confirmed materials and labor...</p>
            <p className="text-sm text-gray-400">Fetching BLS wage data and calculating costs</p>
          </div>
        </div>
      )}

      {appState === 'estimate' && estimate && formData && (
        <EstimateDisplay
          estimate={estimate}
          formData={formData}
          crewSize={confirmedData?.crew_size ?? 0}
          loading={loading}
          onLocationChange={handleLocationChange}
          onSendToClient={(priceInfo) => {
            setClientPrice(priceInfo);
            setAppState('preview');
          }}
          onReset={handleReset}
          onBackToSurvey={handleBackToSurvey}
        />
      )}

      {appState === 'preview' && estimate && formData && clientPrice && (
        <SendPreview
          estimate={estimate}
          formData={formData}
          clientPrice={clientPrice}
          onReset={handleReset}
          onBackToSurvey={handleBackToSurvey}
        />
      )}
    </main>
  );
}
