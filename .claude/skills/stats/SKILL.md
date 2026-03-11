---
name: stats
description: "Internal analytics and statistics for APIbase. Shows traffic, API usage, agents, revenue, latency, top paths, bot activity — all from internal sources (Prometheus, PostgreSQL, Nginx logs). No external analytics services."
user-invocable: true
argument-hint: "[all | traffic | agents | tools | revenue | latency | errors | today | 24h | 7d]"
allowed-tools: Bash, Read, Grep
---

# APIbase — Internal Statistics Skill

Comprehensive internal analytics from 3 data sources:
- **Prometheus** (http://127.0.0.1:9090) — real-time metrics, counters, histograms
- **PostgreSQL** — agents, accounts, execution_ledger, tools, request_metrics
- **Nginx logs** — raw traffic, IPs, paths, status codes, bots

No external analytics. Everything runs on our infrastructure.

---

## Execution Workflow

When invoked, run ALL sections and produce a single formatted report.
If `$ARGUMENTS` specifies a section, show only that section.
Default (`all` or empty): show everything.

---

### Section 1: TRAFFIC (Nginx + Prometheus)

#### 1a. Total Nginx requests (lifetime)

```bash
curl -s 'http://127.0.0.1:9090/api/v1/query?query=nginx_http_requests_total' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
for r in data.get('data',{}).get('result',[]):
    print(f'Total Nginx requests (lifetime): {int(float(r[\"value\"][1])):,}')
"
```

#### 1b. Current request rate (req/min, last 5m)

```bash
curl -s 'http://127.0.0.1:9090/api/v1/query?query=sum(rate(http_requests_total\{job=%22api%22\}[5m]))*60' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
for r in data.get('data',{}).get('result',[]):
    print(f'Current rate: {float(r[\"value\"][1]):.2f} req/min')
"
```

#### 1c. Active connections right now

```bash
curl -s 'http://127.0.0.1:9090/api/v1/query?query=nginx_connections_active' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
for r in data.get('data',{}).get('result',[]):
    print(f'Active connections: {int(float(r[\"value\"][1]))}')
"
```

#### 1d. Top visited paths (from Prometheus HTTP metrics)

```bash
curl -s 'http://127.0.0.1:9090/api/v1/query?query=sort_desc(sum%20by(path)(http_requests_total\{job=%22api%22\}))' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
results = data.get('data',{}).get('result',[])
print('Top paths by total requests:')
for r in results[:15]:
    path = r['metric'].get('path','?')
    count = int(float(r['value'][1]))
    print(f'  {count:>8,}  {path}')
"
```

#### 1e. Status code distribution

```bash
curl -s 'http://127.0.0.1:9090/api/v1/query?query=sort_desc(sum%20by(status)(http_requests_total\{job=%22api%22\}))' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
results = data.get('data',{}).get('result',[])
print('Status code distribution:')
for r in results:
    status = r['metric'].get('status','?')
    count = int(float(r['value'][1]))
    print(f'  HTTP {status}: {count:,}')
"
```

#### 1f. Recent visitors from Nginx logs (unique IPs, last 500 requests)

```bash
sudo docker logs apibase-nginx-1 --tail=500 2>&1 | grep -o '"remote_addr":"[^"]*"' | sort | uniq -c | sort -rn | head -15 | while read count ip; do
  addr=$(echo "$ip" | grep -o '[0-9.]*')
  echo "  $count requests from $addr"
done
```

#### 1g. Bot detection (scanning for known bot patterns in recent Nginx logs)

```bash
echo "Bot/scanner activity (last 500 requests):"
sudo docker logs apibase-nginx-1 --tail=500 2>&1 | grep -oiE '"request":"[^"]*"' | grep -iE 'wp-admin|wordpress|xmlrpc|phpmyadmin|.env|.git|setup-config|wp-login|admin|cgi-bin|shell|eval' | wc -l | xargs -I{} echo "  {} bot/scanner requests detected"
sudo docker logs apibase-nginx-1 --tail=500 2>&1 | grep -oiE '"request":"[^"]*"' | grep -iE 'wp-admin|wordpress|xmlrpc|phpmyadmin|.env|.git|setup-config' | sort | uniq -c | sort -rn | head -10
```

#### 1h. Requests per hour (last 24h from Prometheus)

```bash
curl -s 'http://127.0.0.1:9090/api/v1/query?query=sum(increase(http_requests_total\{job=%22api%22\}[1h]))' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
for r in data.get('data',{}).get('result',[]):
    print(f'Requests in last hour: {int(float(r[\"value\"][1])):,}')
"
```

---

### Section 2: AGENTS

Query PostgreSQL for agent registrations and account data.

```bash
echo "=== Registered Agents ==="
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -t -c "
  SELECT
    COUNT(*) AS total_agents,
    COUNT(*) FILTER (WHERE tier = 'free') AS free_tier,
    COUNT(*) FILTER (WHERE tier = 'paid') AS paid_tier,
    COUNT(*) FILTER (WHERE tier = 'enterprise') AS enterprise_tier,
    COUNT(*) FILTER (WHERE status = 'active') AS active,
    COUNT(*) FILTER (WHERE status = 'suspended') AS suspended
  FROM agents;
"

echo ""
echo "=== Agent Accounts ==="
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -t -c "
  SELECT
    COUNT(*) AS total_accounts,
    COALESCE(SUM(balance_usd), 0) AS total_balance_usd,
    COALESCE(AVG(balance_usd), 0) AS avg_balance_usd,
    COUNT(*) FILTER (WHERE is_test_account = true) AS test_accounts
  FROM accounts;
"

echo ""
echo "=== Recent Registrations (last 7 days) ==="
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "
  SELECT agent_id, tier, status, created_at
  FROM agents
  WHERE created_at > NOW() - INTERVAL '7 days'
  ORDER BY created_at DESC
  LIMIT 10;
"
```

---

### Section 3: TOOLS

```bash
echo "=== Tool Catalog Summary ==="
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "
  SELECT
    provider,
    COUNT(*) AS tools,
    MIN(price_usd::numeric) AS min_price,
    MAX(price_usd::numeric) AS max_price,
    COUNT(*) FILTER (WHERE status = 'healthy') AS healthy,
    COUNT(*) FILTER (WHERE status != 'healthy') AS unhealthy
  FROM tools
  GROUP BY provider
  ORDER BY tools DESC;
"

echo ""
echo "=== Unhealthy Tools ==="
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "
  SELECT tool_id, provider, status, price_usd
  FROM tools
  WHERE status != 'healthy'
  ORDER BY provider;
"
```

---

### Section 4: REVENUE & API USAGE

Query execution_ledger for billing data.

```bash
echo "=== Execution Ledger Summary ==="
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "
  SELECT
    COUNT(*) AS total_executions,
    COUNT(*) FILTER (WHERE status = 'success') AS successful,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    COUNT(*) FILTER (WHERE cache_status = 'HIT') AS cache_hits,
    COUNT(*) FILTER (WHERE cache_status = 'MISS') AS cache_misses,
    COALESCE(SUM(cost_usd), 0) AS total_revenue_usd,
    COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
  FROM execution_ledger;
"

echo ""
echo "=== Revenue by Tool (top 10) ==="
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "
  SELECT
    tool_id,
    COUNT(*) AS calls,
    SUM(cost_usd) AS revenue_usd,
    AVG(latency_ms)::int AS avg_latency_ms,
    COUNT(*) FILTER (WHERE cache_status = 'HIT') AS cache_hits
  FROM execution_ledger
  GROUP BY tool_id
  ORDER BY revenue_usd DESC NULLS LAST
  LIMIT 10;
"

echo ""
echo "=== Revenue by Agent (top 10) ==="
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "
  SELECT
    agent_id,
    COUNT(*) AS calls,
    SUM(cost_usd) AS total_spent_usd,
    MIN(created_at) AS first_call,
    MAX(created_at) AS last_call
  FROM execution_ledger
  GROUP BY agent_id
  ORDER BY total_spent_usd DESC NULLS LAST
  LIMIT 10;
"

echo ""
echo "=== Revenue by Day (last 7 days) ==="
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "
  SELECT
    created_at::date AS day,
    COUNT(*) AS calls,
    SUM(cost_usd) AS revenue_usd,
    COUNT(DISTINCT agent_id) AS unique_agents
  FROM execution_ledger
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY day
  ORDER BY day DESC;
"

echo ""
echo "=== Billing Status Breakdown ==="
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "
  SELECT
    billing_status,
    COUNT(*) AS count,
    COALESCE(SUM(cost_usd), 0) AS total_usd
  FROM execution_ledger
  GROUP BY billing_status
  ORDER BY count DESC;
"
```

---

### Section 5: LATENCY

```bash
echo "=== API Latency (Prometheus) ==="

echo "P50 latency:"
curl -s 'http://127.0.0.1:9090/api/v1/query?query=histogram_quantile(0.50,sum%20by(le)(http_request_duration_seconds_bucket\{job=%22api%22\}))' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
for r in data.get('data',{}).get('result',[]):
    ms = float(r['value'][1]) * 1000
    print(f'  P50: {ms:.1f}ms')
"

echo "P95 latency:"
curl -s 'http://127.0.0.1:9090/api/v1/query?query=histogram_quantile(0.95,sum%20by(le)(http_request_duration_seconds_bucket\{job=%22api%22\}))' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
for r in data.get('data',{}).get('result',[]):
    ms = float(r['value'][1]) * 1000
    print(f'  P95: {ms:.1f}ms')
"

echo "P99 latency:"
curl -s 'http://127.0.0.1:9090/api/v1/query?query=histogram_quantile(0.99,sum%20by(le)(http_request_duration_seconds_bucket\{job=%22api%22\}))' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
for r in data.get('data',{}).get('result',[]):
    ms = float(r['value'][1]) * 1000
    print(f'  P99: {ms:.1f}ms')
"

echo ""
echo "=== Latency by Path (P95) ==="
curl -s 'http://127.0.0.1:9090/api/v1/query?query=sort_desc(histogram_quantile(0.95,sum%20by(le,path)(http_request_duration_seconds_bucket\{job=%22api%22\})))' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
results = data.get('data',{}).get('result',[])
for r in results[:10]:
    path = r['metric'].get('path','?')
    ms = float(r['value'][1]) * 1000
    print(f'  {ms:>8.1f}ms  {path}')
"

echo ""
echo "=== Node.js Runtime ==="
curl -s 'http://127.0.0.1:9090/api/v1/query?query=nodejs_heap_size_used_bytes\{job=%22api%22\}/1024/1024' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
for r in data.get('data',{}).get('result',[]):
    mb = float(r['value'][1])
    print(f'  Heap used: {mb:.1f} MB')
"
curl -s 'http://127.0.0.1:9090/api/v1/query?query=nodejs_eventloop_lag_p99_seconds\{job=%22api%22\}*1000' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
for r in data.get('data',{}).get('result',[]):
    ms = float(r['value'][1])
    print(f'  Event loop P99: {ms:.2f}ms')
"
```

---

### Section 6: ERRORS

```bash
echo "=== Error Rate (Prometheus) ==="
curl -s 'http://127.0.0.1:9090/api/v1/query?query=sum(rate(http_requests_total\{job=%22api%22,status=~%22[45]..%22\}[5m]))/sum(rate(http_requests_total\{job=%22api%22\}[5m]))*100' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
for r in data.get('data',{}).get('result',[]):
    pct = float(r['value'][1])
    print(f'  Current error rate: {pct:.2f}%')
" 2>/dev/null || echo "  No traffic for error rate calculation"

echo ""
echo "=== Top Error Paths ==="
curl -s 'http://127.0.0.1:9090/api/v1/query?query=sort_desc(sum%20by(path,status)(http_requests_total\{job=%22api%22,status=~%22[45]..%22\}))' 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
results = data.get('data',{}).get('result',[])
for r in results[:10]:
    path = r['metric'].get('path','?')
    status = r['metric'].get('status','?')
    count = int(float(r['value'][1]))
    print(f'  {count:>6}x HTTP {status}  {path}')
"

echo ""
echo "=== Recent API Errors (last 100 log lines) ==="
sudo docker logs apibase-api-1 --tail=100 2>&1 | grep -E '"level":"error"' | python3 -c "
import sys,json
errors = {}
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        msg = d.get('msg','unknown')[:80]
        errors[msg] = errors.get(msg, 0) + 1
    except: pass
if not errors:
    print('  No errors in recent logs')
else:
    for msg, count in sorted(errors.items(), key=lambda x: -x[1]):
        print(f'  {count}x {msg}')
" 2>/dev/null
```

---

### Section 7: INFRASTRUCTURE

```bash
echo "=== Containers ==="
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null | head -20

echo ""
echo "=== Disk ==="
df -h / | tail -1 | awk '{print "  Used:", $3, "/", $2, "(" $5 ")"}'

echo ""
echo "=== Docker Disk ==="
sudo docker system df 2>/dev/null

echo ""
echo "=== Memory (top 5 containers) ==="
sudo docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | sort -t'/' -k1 -h -r | head -5 | while read line; do echo "  $line"; done

echo ""
echo "=== PostgreSQL Size ==="
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -t -c "
  SELECT pg_size_pretty(pg_database_size('apibase')) AS db_size;
"

echo ""
echo "=== Table Sizes (top 10) ==="
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "
  SELECT
    relname AS table,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    n_live_tup AS rows
  FROM pg_stat_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
  LIMIT 10;
"

echo ""
echo "=== Prometheus Alerts ==="
curl -s http://127.0.0.1:9090/api/v1/alerts 2>/dev/null | python3 -c "
import sys,json
data=json.loads(sys.stdin.read())
alerts=[a for a in data.get('data',{}).get('alerts',[]) if a.get('state')=='firing']
if not alerts: print('  No active alerts')
else:
    for a in alerts:
        print(f'  FIRING: {a[\"labels\"][\"alertname\"]} [{a[\"labels\"][\"severity\"]}]')
"
```

---

## Output Format

Present all sections in a single formatted report:

```
╔══════════════════════════════════════════════════════╗
║           APIbase.pro — Internal Statistics          ║
║              Generated: {timestamp}                  ║
╚══════════════════════════════════════════════════════╝

1. TRAFFIC
   ...

2. AGENTS
   ...

3. TOOLS
   ...

4. REVENUE & API USAGE
   ...

5. LATENCY
   ...

6. ERRORS
   ...

7. INFRASTRUCTURE
   ...
```

## Data Sources

| Source | What | Retention |
|--------|------|-----------|
| Prometheus | HTTP metrics, latency histograms, connections | 15 days |
| PostgreSQL (execution_ledger) | Per-call billing, latency, cache status | 365 days |
| PostgreSQL (request_metrics) | Per-request status code + duration | 90 days |
| PostgreSQL (agents/accounts) | Agent registrations, balances | Permanent |
| PostgreSQL (tools) | Tool catalog, prices, status | Permanent |
| Nginx logs | Raw traffic, IPs, paths, status codes | 14 days (Loki) |
| Docker logs | Container stdout, last N lines | Docker json-file rotation |

## No External Services

This skill uses ONLY internal infrastructure:
- No Google Analytics
- No Mixpanel, Amplitude, or Segment
- No external tracking pixels
- No cookies or client-side JS
- All data stays on Hetzner server
