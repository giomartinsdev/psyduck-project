# Load Tests

k6 load test suite for the Psyduck federated GraphQL stack. Tests the Apollo Gateway under realistic browsing traffic to validate the system meets its performance SLAs.

## Prerequisites

```bash
# macOS
brew install k6

# Linux
sudo snap install k6

# Docker (no install needed)
docker run --rm -i grafana/k6 run - < load-test/k6.js
```

## How to Run

```bash
# Make sure the full stack is running
docker compose up -d

# Run the load test
k6 run load-test/k6.js
```

## Test Scenarios

The test file defines a single scenario — `browse_catalogue` — that simulates users browsing the storefront:

| Stage | Duration | Target VUs |
|-------|----------|-----------|
| Ramp up | 30s | 0 → 100 |
| Ramp up | 30s | 100 → 300 |
| Ramp up | 30s | 300 → 500 |
| Sustain | 20s | 500 |
| Ramp down | 30s | 500 → 0 |

Each virtual user randomly selects from four GraphQL queries on each iteration:

1. **Featured products** — `featuredProducts(limit: 3) { id title price }`
2. **Featured posts** — `featuredPosts(limit: 2) { id title excerpt }`
3. **Catalogue pagination** — `products(first: 6) { edges { node { id title price } } }`
4. **Baseline introspection** — `{ __typename }` (measures raw gateway overhead)

## Thresholds (SLAs)

| Metric | Threshold | Spec |
|--------|-----------|------|
| `http_req_failed` | < 1% | SC-002 |
| `http_req_duration` p(95) | < 2000ms | SC-006 |

The test exits with a non-zero code if either threshold is breached.

## Interpreting Results

```
✓ http_req_failed..................: 0.12%  ✓ < 1%
✓ http_req_duration................: p(95)=1843ms ✓ < 2000ms

http_reqs..........................: 24500  204.1/s
```

Key metrics to watch:

- **`http_req_duration` p(95) and p(99)** — tail latency; spikes indicate a slow subgraph or database lock
- **`http_req_failed`** — network errors + 5xx responses; > 1% means the system is shedding load
- **`iterations`** — total completed VU iterations; lower than expected means VUs are spending too long waiting

## Running Against a Specific Gateway URL

```bash
k6 run -e GATEWAY_URL=http://staging.example.com/graphql load-test/k6.js
```

Update the `BASE_URL` constant in `k6.js` to pick up the env variable:

```js
const BASE_URL = __ENV.GATEWAY_URL || 'http://localhost:4000/graphql';
```

## CI Integration

To run load tests in CI (e.g., GitHub Actions):

```yaml
- name: Start stack
  run: docker compose up -d

- name: Wait for gateway
  run: |
    until curl -sf http://localhost:4000/graphql; do sleep 2; done

- name: Run k6
  uses: grafana/k6-action@v0.3.0
  with:
    filename: load-test/k6.js
```
