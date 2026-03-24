import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Breezy AI Job Estimator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #f8fafc 0%, #dbeafe 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Breezy logo mark */}
        <div style={{ display: 'flex', marginBottom: 32 }}>
          <svg width="60" height="94" viewBox="0 0 25 39" fill="none">
            <path d="M1.70549 24.7317C0.763575 22.7678 1.59206 20.4122 3.55596 19.4703L20.9523 11.1267C21.1131 11.0496 21.306 11.1175 21.3831 11.2783C22.9949 14.6389 21.5772 18.6699 18.2165 20.2818L3.05813 27.552L1.70549 24.7317Z" fill="#5EB5F9"/>
            <path d="M1.70549 13.7454C0.763575 11.7815 1.59206 9.42588 3.55596 8.48396L20.9523 0.140418C21.1131 0.0632899 21.306 0.131129 21.3831 0.291942C22.9949 3.65261 21.5772 7.68362 18.2165 9.29545L3.05813 16.5657L1.70549 13.7454Z" fill="#5EB5F9"/>
            <path d="M1.42309 35.5902C0.637139 33.9515 1.32844 31.9859 2.96715 31.2L20.9523 22.574C21.1131 22.4969 21.306 22.5647 21.3831 22.7255C22.9949 26.0862 21.5772 30.1172 18.2165 31.729L6.46719 37.3642C4.58442 38.2672 2.3261 37.473 1.42309 35.5902Z" fill="#0251FF"/>
          </svg>
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: '#111827',
            marginBottom: 16,
            letterSpacing: '-0.02em',
          }}
        >
          Breezy AI Job Estimator
        </div>
        <div
          style={{
            fontSize: 28,
            color: '#6b7280',
            fontWeight: 400,
          }}
        >
          Get professional job estimates in seconds
        </div>
      </div>
    ),
    { ...size }
  );
}
