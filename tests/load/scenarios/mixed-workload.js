// APIbase.pro — Mixed Workload Load Test (§16 P1d)
//
// Simulates realistic production traffic from 1,000 concurrent AI agents:
//   - 60% tool catalog browsing (read-heavy, cached)
//   - 20% tool detail lookups
//   - 10% agent registration
//   - 10% health checks
//
// SLO targets:
//   - 1,000 concurrent agents
//   - 100 req/s sustained
//   - P95 latency < 500ms
//   - Error rate < 1%
//   - Zero double charges (idempotency verified via post-test SQL)
//   - Zero orphaned escrows (verified via post-test SQL)
//
// Usage:
//   k6 run tests/load/scenarios/mixed-workload.js
//   API_URL=https://apibase.pro k6 run tests/load/scenarios/mixed-workload.js
//
// Post-test verification (run against PostgreSQL):
//   -- No orphaned escrows
//   SELECT COUNT(*) FROM execution_ledger
//     WHERE status = 'pending' AND created_at < NOW() - INTERVAL '2 minutes';
//   -- No double charges
//   SELECT idempotency_key, COUNT(*) FROM execution_ledger
//     WHERE billing_status = 'CHARGED'
//     GROUP BY idempotency_key HAVING COUNT(*) > 1;

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import {
  BASE_URL,
  THRESHOLDS,
  STANDARD_STAGES,
  JSON_HEADERS,
} from '../k6-config.js';

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const catalogRequests = new Counter('catalog_requests');
const detailRequests = new Counter('detail_requests');
const registrationRequests = new Counter('registration_requests');
const healthRequests = new Counter('health_requests');
const catalogLatency = new Trend('catalog_latency', true);
const detailLatency = new Trend('detail_latency', true);
const registrationLatency = new Trend('registration_latency', true);

// ---------------------------------------------------------------------------
// Options — full load (1,000 VUs)
// ---------------------------------------------------------------------------
export const options = {
  stages: STANDARD_STAGES,
  thresholds: {
    ...THRESHOLDS,
    'checks': ['rate>0.95'],
    'catalog_latency': ['p(95)<300'],     // Cached reads should be fast
    'detail_latency': ['p(95)<300'],
    'registration_latency': ['p(95)<500'],
  },
  tags: { scenario: 'mixed-workload' },
};

// Tool IDs to rotate through
const TOOL_IDS = [
  'weather.get_current',
  'weather.get_forecast',
  'weather.get_alerts',
  'weather.get_history',
  'weather.air_quality',
  'weather.geocode',
  'weather.compare',
  'crypto.get_price',
  'coingecko.get_market',
  'crypto.coin_detail',
  'crypto.price_history',
  'crypto.trending',
  'crypto.global',
  'polymarket.search',
  'polymarket.market_detail',
  'polymarket.trending',
  'aviasales.search_flights',
  'aviasales.price_calendar',
  'aviasales.cheap_flights',
  'aviasales.popular_routes',
];

// ---------------------------------------------------------------------------
// Weighted random action selection
// ---------------------------------------------------------------------------
function pickAction() {
  const roll = Math.random();
  if (roll < 0.60) return 'catalog';
  if (roll < 0.80) return 'detail';
  if (roll < 0.90) return 'register';
  return 'health';
}

// ---------------------------------------------------------------------------
// Test execution
// ---------------------------------------------------------------------------
export default function () {
  const action = pickAction();

  switch (action) {
    case 'catalog':
      doCatalogBrowse();
      break;
    case 'detail':
      doToolDetail();
      break;
    case 'register':
      doRegistration();
      break;
    case 'health':
      doHealthCheck();
      break;
  }

  // Think time: simulate agent processing between requests
  sleep(Math.random() * 0.5 + 0.1);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function doCatalogBrowse() {
  group('catalog_browse', function () {
    const limit = [10, 20, 50][Math.floor(Math.random() * 3)];
    const res = http.get(`${BASE_URL}/api/v1/tools?limit=${limit}`, {
      headers: JSON_HEADERS,
      tags: { name: 'GET /api/v1/tools' },
    });

    catalogRequests.add(1);
    catalogLatency.add(res.timings.duration);

    check(res, {
      'catalog 200': (r) => r.status === 200,
      'catalog has data': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).data);
        } catch {
          return false;
        }
      },
    });
  });
}

function doToolDetail() {
  group('tool_detail', function () {
    const toolId = TOOL_IDS[Math.floor(Math.random() * TOOL_IDS.length)];
    const res = http.get(`${BASE_URL}/api/v1/tools/${toolId}`, {
      headers: JSON_HEADERS,
      tags: { name: 'GET /api/v1/tools/:toolId' },
    });

    detailRequests.add(1);
    detailLatency.add(res.timings.duration);

    check(res, {
      'detail 200': (r) => r.status === 200,
      'detail has id': (r) => {
        try {
          return JSON.parse(r.body).id !== undefined;
        } catch {
          return false;
        }
      },
    });
  });
}

function doRegistration() {
  group('registration', function () {
    const res = http.post(
      `${BASE_URL}/api/v1/agents/register`,
      JSON.stringify({
        agent_name: `k6-mixed-${__VU}-${__ITER}-${Date.now()}`,
        agent_version: '1.0.0',
      }),
      {
        headers: JSON_HEADERS,
        tags: { name: 'POST /api/v1/agents/register' },
      },
    );

    registrationRequests.add(1);
    registrationLatency.add(res.timings.duration);

    check(res, {
      'register 201': (r) => r.status === 201,
      'register has api_key': (r) => {
        try {
          return JSON.parse(r.body).api_key !== undefined;
        } catch {
          return false;
        }
      },
    });
  });
}

function doHealthCheck() {
  group('health_check', function () {
    const res = http.get(`${BASE_URL}/health/ready`, {
      tags: { name: 'GET /health/ready' },
    });

    healthRequests.add(1);

    check(res, {
      'health 200': (r) => r.status === 200,
      'health ready': (r) => {
        try {
          return JSON.parse(r.body).status === 'ready';
        } catch {
          return false;
        }
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Post-test summary
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const passed = data.metrics.checks
    ? data.metrics.checks.values.rate >= 0.95
    : false;
  const p95ok = data.metrics.http_req_duration
    ? data.metrics.http_req_duration.values['p(95)'] < 500
    : false;
  const errorRate = data.metrics.http_req_failed
    ? data.metrics.http_req_failed.values.rate
    : 1;

  const summary = {
    slo_results: {
      p95_under_500ms: p95ok,
      error_rate_under_1pct: errorRate < 0.01,
      checks_pass_rate: passed,
    },
    post_test_queries: {
      orphaned_escrows:
        "SELECT COUNT(*) FROM execution_ledger WHERE status = 'pending' AND created_at < NOW() - INTERVAL '2 minutes';",
      double_charges:
        "SELECT idempotency_key, COUNT(*) FROM execution_ledger WHERE billing_status = 'CHARGED' GROUP BY idempotency_key HAVING COUNT(*) > 1;",
    },
  };

  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'load-test-results.json': JSON.stringify(summary, null, 2),
  };
}

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
