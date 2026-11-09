import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const productionHost = 'invest.filipcsupka.online';
const rawBase = __ENV.BASE_URL || 'http://localhost:3000';
const target = /^https?:\/\/([^/:?#@]+)(?::\d+)?\/?$/i.exec(rawBase);
if (!target || target[1].includes('%')) throw new Error('BASE_URL must be an HTTP origin without credentials, path, query or fragment');
const host = target[1].replace(/\.$/, '').toLowerCase();
if ((host === productionHost || host.endsWith(`.${productionHost}`)) && __ENV.ALLOW_PROD !== '1') throw new Error(`Refusing production host ${productionHost}; set ALLOW_PROD=1 to override`);
const base = rawBase.replace(/\/$/, '');
const profile = __ENV.PROFILE || 'smoke';
if (profile !== 'smoke' && profile !== 'load') throw new Error('PROFILE must be smoke or load');
const fixtureHealth = profile === 'smoke' && __ENV.HEALTH_EXPECTED_STATUS === '503';
const tickers = open(__ENV.TICKERS || './tickers.txt').split(/\r?\n/).map((value) => value.trim()).filter((value) => value && !value.startsWith('#'));
if (!tickers.length || tickers.some((ticker) => !/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker))) throw new Error('TICKERS must contain one valid ticker symbol per line');
if (profile === 'load' && !__ENV.REVALIDATE_TOKEN) throw new Error('REVALIDATE_TOKEN is required for the load profile');

const tooLarge = new Rate('response_too_large');
const rateLimited = new Rate('rate_limited');
const unexpectedStatus = new Rate('unexpected_status');
const decodedSize = new Trend('decoded_body_chars');
const gzipSize = new Trend('gzip_content_length_bytes');
const maxHtmlChars = Number(__ENV.MAX_HTML_CHARS || 25000000);
const maxDashboardGzipBytes = Number(__ENV.MAX_DASHBOARD_GZIP_BYTES || 1048576);
if (!(maxHtmlChars > 0) || !(maxDashboardGzipBytes > 0)) throw new Error('Response size limits must be positive');

const loadScenarios = {
  journeys: { executor: 'ramping-vus', exec: 'journey', startVUs: 0, stages: [
    { duration: '5m', target: 50 }, { duration: '5m', target: 200 },
    { duration: '5m', target: 500 }, { duration: '10m', target: 500 },
    { duration: '2m', target: 0 },
  ], gracefulRampDown: '30s' },
  revalidate_spike: { executor: 'shared-iterations', exec: 'revalidate', vus: 1, iterations: 1, startTime: '17m', maxDuration: '30s' },
  post_purge_spike: { executor: 'ramping-vus', exec: 'journey', startTime: '17m30s', startVUs: 0, stages: [
    { duration: '10s', target: 100 }, { duration: '50s', target: 100 }, { duration: '10s', target: 0 },
  ], gracefulRampDown: '30s' },
};

export const options = {
  scenarios: profile === 'smoke' ? { journeys: { executor: 'ramping-vus', exec: 'journey', startVUs: 1, stages: [
    { duration: '10s', target: 1 }, { duration: '20s', target: 5 }, { duration: '30s', target: 5 },
  ], gracefulRampDown: '5s' } } : loadScenarios,
  thresholds: {
    ...(fixtureHealth ? {} : { http_req_failed: ['rate<0.005'] }),
    ...(profile === 'load' ? {
      'http_req_duration{endpoint:dashboard}': ['p(95)<1500'],
      'http_req_duration{endpoint:company}': ['p(95)<800'],
      'http_req_duration{endpoint:scanner}': ['p(95)<1200'],
      'http_req_duration{endpoint:health}': ['p(99)<500'],
    } : {}),
    rate_limited: ['rate==0'],
    unexpected_status: ['rate<0.005'],
    response_too_large: ['rate==0'],
  },
  userAgent: 'investbuddy-k6/1.0',
  noConnectionReuse: false,
};

function authHeaders() {
  const headers = { 'Accept-Encoding': 'gzip', Accept: 'text/html' };
  if (__ENV.OWNER_AUTH) headers.Authorization = __ENV.OWNER_AUTH;
  return headers;
}

function request(path, endpoint, asset = false) {
  const res = http.get(`${base}${path}`, { headers: authHeaders(), redirects: 0, tags: { endpoint }, timeout: '15s' });
  const ok = res.status === (fixtureHealth && endpoint === 'health' ? 503 : 200);
  const length = typeof res.body === 'string' ? res.body.length : (res.body ? res.body.byteLength : 0);
  const declared = Number(res.headers['Content-Length'] || 0);
  const gzip = (res.headers['Content-Encoding'] || '').toLowerCase().includes('gzip');
  const oversize = (!asset && length > maxHtmlChars) || (endpoint === 'dashboard' && gzip && declared > maxDashboardGzipBytes);
  decodedSize.add(length, { endpoint });
  if (gzip && declared) gzipSize.add(declared, { endpoint });
  rateLimited.add(res.status === 429, { endpoint });
  unexpectedStatus.add(!ok, { endpoint });
  tooLarge.add(oversize, { endpoint });
  check(res, { 'expected status': () => ok, 'response size within limit': () => !oversize }, { endpoint });
  return res;
}

function think() { sleep(1 + Math.random() * 4); }
function ticker() { return tickers[Math.floor(Math.random() * tickers.length)]; }
function company() { request(`/en/company/${ticker()}`, 'company'); }

const scannerQueries = [
  '?state=watch', '?state=wait', '?state=setup', '?sector=Cybersecurity',
  '?sector=Cloud%20%26%20SaaS', '?f=5', '?t=5', '?m=2',
  '?sort=ticker', '?sort=sector', '?source=guide', '?q=NVDA',
];

export function journey() {
  const choice = profile === 'smoke' ? [0, 40, 65, 80, 95][(__VU - 1) % 5] : Math.random() * 100;
  if (choice < 40) {
    request('/en', 'home'); think();
    request('/en/dashboard', 'dashboard'); think();
    for (let i = 0; i < 3; i++) { company(); think(); }
    request('/en/dashboard', 'dashboard');
  } else if (choice < 65) {
    const query = scannerQueries[Math.floor(Math.random() * scannerQueries.length)];
    const page = 1 + Math.floor(Math.random() * 3);
    request(`/en/scanner?page=${page}&${query.slice(1)}`, 'scanner'); think();
    request(`/en/scanner?page=${1 + Math.floor(Math.random() * 3)}&sort=score`, 'scanner');
  } else if (choice < 80) {
    company(); think();
    request('/en/methodology', 'methodology'); think();
    request('/en/track-record', 'track_record');
  } else if (choice < 90) {
    request('/en/heatmap', 'heatmap'); think();
    request('/en/etf', 'etf');
  } else if (choice < 95) {
    request('/api/health', 'health');
  } else {
    request('/favicon.svg', 'asset', true); think();
    request('/fonts/inter-latin-wght-normal.woff2', 'asset', true);
    if (profile === 'smoke') { think(); request('/api/health', 'health'); }
  }
  think();
}

export function revalidate() {
  const res = http.post(`${base}/api/revalidate`, JSON.stringify({ tags: ['scores'] }), {
    headers: { Authorization: `Bearer ${__ENV.REVALIDATE_TOKEN}`, 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
    redirects: 0, tags: { endpoint: 'revalidate' }, timeout: '15s',
  });
  const length = typeof res.body === 'string' ? res.body.length : (res.body ? res.body.byteLength : 0);
  const oversized = length > 65536;
  decodedSize.add(length, { endpoint: 'revalidate' });
  tooLarge.add(oversized, { endpoint: 'revalidate' });
  rateLimited.add(res.status === 429, { endpoint: 'revalidate' });
  unexpectedStatus.add(res.status !== 200, { endpoint: 'revalidate' });
  check(res, { 'revalidate status 200': (response) => response.status === 200, 'response size within limit': () => !oversized });
}
