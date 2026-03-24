import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';

const BLS_BASE_URL = process.env.BLS_API_KEY || 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const BLS_LOG_DIR = join(process.cwd(), 'data', 'bls');
const BLS_LOG_FILE = join(BLS_LOG_DIR, 'bls_output.json');

// Common trade → SOC code mappings for OEWS wage lookups
const TRADE_SOC_MAP: Record<string, string> = {
  plumbing: '47-2152',
  plumber: '47-2152',
  hvac: '49-9021',
  electrical: '47-2111',
  electrician: '47-2111',
  roofing: '47-2181',
  roofer: '47-2181',
  landscaping: '37-3011',
  landscape: '37-3011',
  carpentry: '47-2031',
  carpenter: '47-2031',
  painting: '47-2141',
  painter: '47-2141',
  cleaning: '37-2011',
  catering: '35-2012',
  chef: '35-1011',
  cook: '35-2014',
  'hair stylist': '39-5012',
  hairdresser: '39-5012',
  barber: '39-5011',
  'personal trainer': '39-9031',
  'personal training': '39-9031',
  massage: '31-9011',
  welding: '51-4121',
  welder: '51-4121',
  mechanic: '49-3023',
  'auto mechanic': '49-3023',
};

// BLS OEWS series ID format: OEUM + area_code + industry_code + occupation_code + data_type
// National data uses area code 0000000, all industries = 000000
// Data types: 01=employment, 04=mean hourly, 07=10th pctl, 08=25th pctl, 12=75th pctl, 13=90th pctl
function buildSeriesIds(socCode: string): string[] {
  const soc = socCode.replace('-', '');
  const base = `OEUN0000000000000${soc}`;
  return [
    `${base}04`, // mean hourly wage
    `${base}07`, // 10th percentile
    `${base}13`, // 90th percentile
  ];
}

function matchTradeToSoc(tradeType: string): string | null {
  const normalized = tradeType.toLowerCase().trim();

  // Direct match
  if (TRADE_SOC_MAP[normalized]) return TRADE_SOC_MAP[normalized];

  // Partial match
  for (const [key, soc] of Object.entries(TRADE_SOC_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) return soc;
  }

  return null;
}

export interface BLSWageData {
  mean_hourly: number | null;
  percentile_10: number | null;
  percentile_90: number | null;
  soc_code: string;
}

interface BLSLogEntry {
  last_updated: string;
  request: {
    trade_type: string;
    location: string;
    soc_code: string;
    series_ids: string[];
  };
  bls_response: {
    status: string;
    parsed_wages: BLSWageData | null;
    raw_data: unknown;
  };
  claude_estimate: unknown | null;
}

async function readLog(): Promise<BLSLogEntry | null> {
  try {
    const raw = await readFile(BLS_LOG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeLog(entry: BLSLogEntry): Promise<void> {
  try {
    await mkdir(BLS_LOG_DIR, { recursive: true });
    await writeFile(BLS_LOG_FILE, JSON.stringify(entry, null, 2));
  } catch (err) {
    console.error('Failed to write BLS log:', err);
  }
}

// Called from the API route after Claude responds, to append the estimate
export async function updateLogWithEstimate(estimate: unknown): Promise<void> {
  const existing = await readLog();
  if (!existing) return;
  existing.claude_estimate = estimate;
  existing.last_updated = new Date().toISOString();
  await writeLog(existing);
}

export async function fetchBLSWages(tradeType: string, location: string): Promise<BLSWageData | null> {
  const socCode = matchTradeToSoc(tradeType);
  if (!socCode) return null;

  const seriesIds = buildSeriesIds(socCode);

  try {
    const res = await fetch(BLS_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesid: seriesIds,
        latest: true,
      }),
    });

    if (!res.ok) {
      const entry: BLSLogEntry = {
        last_updated: new Date().toISOString(),
        request: { trade_type: tradeType, location, soc_code: socCode, series_ids: seriesIds },
        bls_response: { status: `HTTP ${res.status} ${res.statusText}`, parsed_wages: null, raw_data: null },
        claude_estimate: null,
      };
      await writeLog(entry);
      return null;
    }

    const data = await res.json();

    if (data.status !== 'REQUEST_SUCCEEDED' || !data.Results?.series) {
      const entry: BLSLogEntry = {
        last_updated: new Date().toISOString(),
        request: { trade_type: tradeType, location, soc_code: socCode, series_ids: seriesIds },
        bls_response: { status: data.status || 'UNKNOWN', parsed_wages: null, raw_data: data },
        claude_estimate: null,
      };
      await writeLog(entry);
      return null;
    }

    const wages: BLSWageData = {
      mean_hourly: null,
      percentile_10: null,
      percentile_90: null,
      soc_code: socCode,
    };

    for (const series of data.Results.series) {
      const seriesId: string = series.seriesID;
      const latestValue = series.data?.[0]?.value;
      if (!latestValue || latestValue === '-') continue;

      const val = parseFloat(latestValue);
      if (isNaN(val)) continue;

      if (seriesId.endsWith('04')) wages.mean_hourly = val;
      else if (seriesId.endsWith('07')) wages.percentile_10 = val;
      else if (seriesId.endsWith('13')) wages.percentile_90 = val;
    }

    const entry: BLSLogEntry = {
      last_updated: new Date().toISOString(),
      request: { trade_type: tradeType, location, soc_code: socCode, series_ids: seriesIds },
      bls_response: { status: 'REQUEST_SUCCEEDED', parsed_wages: wages, raw_data: data },
      claude_estimate: null,
    };
    await writeLog(entry);

    return wages;
  } catch (err) {
    console.error('BLS API error:', err);
    return null;
  }
}
