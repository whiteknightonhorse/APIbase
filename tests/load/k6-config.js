// APIbase.pro — k6 Load Test Configuration (§16 P1d)
//
// Shared configuration, thresholds, and helpers for all load test scenarios.
//
// Environment variables:
//   API_URL       — Target base URL (default: http://localhost:3000)
//   AGENT_NAME    — Agent name for registration (default: k6-load-agent)
//   AGENT_VERSION — Agent version (default: 1.0.0)

export const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// SLO thresholds (§16 P1d)
// ---------------------------------------------------------------------------
export const THRESHOLDS = {
  http_req_duration: [
    'p(95)<500',  // P95 < 500ms
    'p(99)<1000', // P99 < 1s
  ],
  http_req_failed: [
    'rate<0.01',  // Error rate < 1%
  ],
  http_reqs: [
    'rate>50',    // Sustained throughput > 50 req/s
  ],
};

// ---------------------------------------------------------------------------
// Standard load stages — ramp to 1,000 VUs
// ---------------------------------------------------------------------------
export const STANDARD_STAGES = [
  { duration: '30s', target: 100 },   // Warm up
  { duration: '1m',  target: 500 },   // Ramp up
  { duration: '3m',  target: 1000 },  // Sustained peak
  { duration: '1m',  target: 500 },   // Ramp down
  { duration: '30s', target: 0 },     // Cool down
];

// ---------------------------------------------------------------------------
// Light load stages — quick validation
// ---------------------------------------------------------------------------
export const LIGHT_STAGES = [
  { duration: '10s', target: 10 },
  { duration: '30s', target: 50 },
  { duration: '1m',  target: 100 },
  { duration: '10s', target: 0 },
];

// ---------------------------------------------------------------------------
// Common headers
// ---------------------------------------------------------------------------
export const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

export function authHeaders(apiKey) {
  return {
    ...JSON_HEADERS,
    'Authorization': `Bearer ${apiKey}`,
  };
}

// ---------------------------------------------------------------------------
// Helper: register an agent and return { agent_id, api_key }
// ---------------------------------------------------------------------------
export function registerAgent(vuId) {
  const res = http.post(
    `${BASE_URL}/api/v1/agents/register`,
    JSON.stringify({
      agent_name: `${__ENV.AGENT_NAME || 'k6-load-agent'}-${vuId}`,
      agent_version: __ENV.AGENT_VERSION || '1.0.0',
    }),
    { headers: JSON_HEADERS },
  );

  if (res.status === 201) {
    const body = JSON.parse(res.body);
    return { agent_id: body.agent_id, api_key: body.api_key };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helper: check response is valid
// ---------------------------------------------------------------------------
export function checkResponse(res, name, expectedStatus = 200) {
  const checks = {};
  checks[`${name} status ${expectedStatus}`] = (r) => r.status === expectedStatus;
  checks[`${name} has body`] = (r) => r.body && r.body.length > 0;
  return checks;
}

import http from 'k6/http';
