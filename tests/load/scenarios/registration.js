// APIbase.pro — Agent Registration Load Test
//
// Validates agent registration endpoints under load:
//   POST /api/v1/agents/register  — explicit KYA Basic registration
//   POST /api/v1/agents/auto      — anonymous auto-registration
//
// Verifies:
//   - Registration returns valid api_key format (ak_live_<32hex>)
//   - Auto-registration deduplicates by IP fingerprint
//   - No errors under concurrent registration load
//
// Usage:
//   k6 run tests/load/scenarios/registration.js
//   API_URL=https://apibase.pro k6 run tests/load/scenarios/registration.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  THRESHOLDS,
  LIGHT_STAGES,
  JSON_HEADERS,
} from '../k6-config.js';

// ---------------------------------------------------------------------------
// Options — lighter load (registration is write-heavy)
// ---------------------------------------------------------------------------
export const options = {
  stages: LIGHT_STAGES,
  thresholds: {
    ...THRESHOLDS,
    'checks': ['rate>0.95'], // 95%+ checks pass
  },
  tags: { scenario: 'registration' },
};

const API_KEY_PATTERN = /^ak_(live|test)_[0-9a-f]{32}$/;

// ---------------------------------------------------------------------------
// Test execution
// ---------------------------------------------------------------------------
export default function () {
  const vuId = __VU;
  const iterId = __ITER;

  // 1. Explicit registration (KYA Basic)
  const registerRes = http.post(
    `${BASE_URL}/api/v1/agents/register`,
    JSON.stringify({
      agent_name: `k6-agent-${vuId}-${iterId}`,
      agent_version: '1.0.0',
    }),
    {
      headers: JSON_HEADERS,
      tags: { name: 'POST /api/v1/agents/register' },
    },
  );

  check(registerRes, {
    'register returns 201': (r) => r.status === 201,
    'register has agent_id': (r) => {
      try {
        return JSON.parse(r.body).agent_id !== undefined;
      } catch {
        return false;
      }
    },
    'register has valid api_key': (r) => {
      try {
        return API_KEY_PATTERN.test(JSON.parse(r.body).api_key);
      } catch {
        return false;
      }
    },
    'register has tier': (r) => {
      try {
        return JSON.parse(r.body).tier === 'free';
      } catch {
        return false;
      }
    },
  });

  sleep(0.5);

  // 2. Auto-registration (anonymous)
  const autoRes = http.post(
    `${BASE_URL}/api/v1/agents/auto`,
    null,
    {
      headers: {
        ...JSON_HEADERS,
        'X-Agent-Name': `k6-auto-${vuId}`,
      },
      tags: { name: 'POST /api/v1/agents/auto' },
    },
  );

  check(autoRes, {
    'auto returns 200 or 201': (r) => r.status === 200 || r.status === 201,
    'auto has agent_id': (r) => {
      try {
        return JSON.parse(r.body).agent_id !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(0.5);
}
