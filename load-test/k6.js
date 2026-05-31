import http from 'k6/http';
import { check, sleep } from 'k6';

// SC-002: 500 concurrent users — ramp up to find saturation point,
// then sustain at 500 VUs for 20s to measure steady-state performance.
export const options = {
  scenarios: {
    browse_catalogue: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },  // ramp to 100
        { duration: '10s', target: 300 },  // ramp to 300
        { duration: '10s', target: 500 },  // ramp to 500 (SC-002 target)
        { duration: '20s', target: 500 },  // sustain at 500
        { duration: '10s', target: 0   },  // ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.01'],   // <1% errors (must pass)
    http_req_duration: ['p(95)<2000'],  // SC-002/SC-006 target (may fail on dev)
  },
};

const GW = 'http://localhost:4000/graphql';

const QUERIES = [
  // Home page featured products
  JSON.stringify({ query: '{ featuredProducts(limit: 3) { id title price stockStatus } }' }),
  // Home page featured posts
  JSON.stringify({ query: '{ featuredPosts(limit: 2) { id title excerpt } }' }),
  // Catalogue first page
  JSON.stringify({ query: '{ products(first: 6) { edges { node { id title price } } totalCount } }' }),
  // Gateway typename (cheapest possible query — baseline)
  JSON.stringify({ query: '{ __typename }' }),
];

export default function () {
  const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const res = http.post(GW, query, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status 200': r => r.status === 200,
    'has data':   r => {
      try { return JSON.parse(r.body).data !== null; } catch { return false; }
    },
    'no errors':  r => {
      try { return !JSON.parse(r.body).errors; } catch { return false; }
    },
    'under 2s':   r => r.timings.duration < 2000,
  });

  sleep(0.05);
}
