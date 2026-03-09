// APIbase.pro — Tool Catalog Load Test
//
// Validates tool catalog endpoints under load:
//   GET /api/v1/tools       — paginated list
//   GET /api/v1/tools/:id   — single tool detail
//   GET /api/tools           — public catalog
//
// Usage:
//   k6 run tests/load/scenarios/tools-api.js
//   API_URL=https://apibase.pro k6 run tests/load/scenarios/tools-api.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  THRESHOLDS,
  STANDARD_STAGES,
  JSON_HEADERS,
  checkResponse,
} from '../k6-config.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------
export const options = {
  stages: STANDARD_STAGES,
  thresholds: THRESHOLDS,
  tags: { scenario: 'tools-api' },
};

// Tool IDs to rotate through (known catalog entries)
const TOOL_IDS = [
  'weather.get_current',
  'weather.get_forecast',
  'weather.get_alerts',
  'crypto.get_price',
  'coingecko.get_market',
  'polymarket.search',
  'aviasales.search_flights',
];

// ---------------------------------------------------------------------------
// Test execution
// ---------------------------------------------------------------------------
export default function () {
  // 1. Paginated tool list
  const listRes = http.get(`${BASE_URL}/api/v1/tools?limit=10`, {
    headers: JSON_HEADERS,
    tags: { name: 'GET /api/v1/tools' },
  });
  check(listRes, {
    ...checkResponse(listRes, 'tool-list'),
    'tool-list has data array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data);
      } catch {
        return false;
      }
    },
    'tool-list has pagination': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.pagination !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(0.1);

  // 2. Single tool detail (rotate through known tools)
  const toolId = TOOL_IDS[Math.floor(Math.random() * TOOL_IDS.length)];
  const detailRes = http.get(`${BASE_URL}/api/v1/tools/${toolId}`, {
    headers: JSON_HEADERS,
    tags: { name: 'GET /api/v1/tools/:toolId' },
  });
  check(detailRes, {
    ...checkResponse(detailRes, 'tool-detail'),
    'tool-detail has id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.id === toolId;
      } catch {
        return false;
      }
    },
  });

  sleep(0.1);

  // 3. Public catalog (cached, should be fast)
  const catalogRes = http.get(`${BASE_URL}/api/tools`, {
    headers: JSON_HEADERS,
    tags: { name: 'GET /api/tools' },
  });
  check(catalogRes, {
    ...checkResponse(catalogRes, 'public-catalog'),
    'public-catalog has tools': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.total > 0;
      } catch {
        return false;
      }
    },
  });

  sleep(0.2);
}
