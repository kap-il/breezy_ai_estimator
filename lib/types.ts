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
  quantity: number;
  unit_cost_low: number;
  unit_cost_high: number;
}

export interface EmployeeCostBreakdown {
  base_wage_low: number;
  base_wage_high: number;
  payroll_tax: number;
  workers_comp: number;
  insurance: number;
  total_burden_low: number;
  total_burden_high: number;
}

export interface FlatRate {
  unit: string;
  rate_low: number;
  rate_high: number;
  quantity: number;
  total_low: number;
  total_high: number;
}

export interface EstimateResult {
  trade: string;
  job_summary: string;
  insufficient_data?: boolean;
  reason?: string;
  materials: MaterialLine[];
  labor_hours_low: number;
  labor_hours_high: number;
  hourly_rate_low: number;
  hourly_rate_high: number;
  flat_rate: FlatRate | null;
  provider_material_cost_low: number;
  provider_material_cost_high: number;
  employee_cost_breakdown: EmployeeCostBreakdown | null;
  provider_labor_cost_low: number;
  provider_labor_cost_high: number;
  total_low: number;
  total_high: number;
  location_adjustment: number;
  notes: string;
}

export interface ClientInfo {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
}

export interface SurveyMaterial {
  item: string;
  quantity: number;
  unit: string;
  included: boolean;
}

export interface SurveySuggestion {
  job_type: 'duration' | 'project';
  insufficient_data?: boolean;
  reason?: string;
  materials: SurveyMaterial[];
  suggested_crew_size: number;
  crew_rationale: string;
}

export interface SurveyConfirmedData {
  materials: SurveyMaterial[];
  crew_size: number;
}

export interface ClientPriceInfo {
  totalLow: number;
  totalHigh: number;
  customPrice?: number;
}

export type AppState = 'form' | 'survey_loading' | 'survey' | 'estimate_loading' | 'estimate' | 'preview';
