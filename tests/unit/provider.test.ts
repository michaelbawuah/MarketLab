import test from 'node:test';
import assert from 'node:assert/strict';
import { providerRequest, normalizeDailyResponse, fetchDailyPrices, ProviderError } from '../../lib/finance/provider.ts';

const payload = () => ({ 'Meta Data': { '2. Symbol': 'IBM', '3. Last Refreshed': '2026-09-24', '4. Output Size': 'Compact', '5. Time Zone': 'US/Eastern' }, 'Time Series (Daily)': { '2026-09-24': { '4. close': '101.123400' }, '2026-09-23': { '4. close': '100.0000' } } });
const code = (expected: string) => (e: unknown) => e instanceof ProviderError && e.code === expected;
test('connection validation fixes demo to IBM and rejects unknown inputs or ambiguous currency', () => {
  assert.deepEqual(providerRequest({ mode: 'demo', symbol: 'IBM' }), { symbol: 'IBM', mode: 'demo', key: 'demo' });
  assert.throws(() => providerRequest({ mode: 'demo', symbol: 'AAPL' }), code('demo_symbol'));
  assert.throws(() => providerRequest({ mode: 'key', symbol: 'TSCO.LON', apiKey: 'validtestkey' }), code('unsupported_symbol'));
  assert.throws(() => providerRequest({ mode: 'key', symbol: 'IBM', apiKey: 'demo' }), code('key_required'));
  assert.throws(() => providerRequest({ mode: 'configured', symbol: 'IBM' }), code('key_required'));
  assert.throws(() => providerRequest({ mode: 'demo', symbol: 'IBM', owner: 'someone-else' }), code('invalid_request'));
  assert.throws(() => providerRequest({ mode: 'demo', symbol: 'IBM', apiKey: 'notallowed' }), code('invalid_request'));
});
test('daily parsing preserves exact decimals, source, observed dates and adjustment basis', () => {
  const result = normalizeDailyResponse(payload(), 'IBM', '2026-09-25');
  assert.deepEqual(result.dataset.observations, [{ date: '2026-09-23', priceMicros: '100000000' }, { date: '2026-09-24', priceMicros: '101123400' }]);
  assert.equal(result.dataset.basis, 'raw'); assert.equal(result.dataset.currency, 'USD'); assert.equal(result.dataset.kind, 'historical');
  assert.deepEqual(result.provenance, { origin: 'alphavantage', refreshed: '2026-09-24', timezone: 'US/Eastern' });
});
test('unexpected symbol, refresh date, timezone and future observations fail closed', () => {
  for (const [field, value] of [['2. Symbol', 'AAPL'], ['3. Last Refreshed', '2026-09-23'], ['5. Time Zone', 'Europe/London'], ['4. Output Size', 'Full']]) {
    const p = payload(); Object.assign(p['Meta Data'], { [field]: value }); assert.throws(() => normalizeDailyResponse(p, 'IBM', '2026-09-25'), code('invalid_response'));
  }
  assert.throws(() => normalizeDailyResponse(payload(), 'IBM', '2026-09-23'), code('invalid_response'));
  const malformed = payload(); malformed['Time Series (Daily)']['2026-09-24']['4. close'] = '0.0000001'; assert.throws(() => normalizeDailyResponse(malformed, 'IBM'), code('invalid_response'));
  assert.throws(() => normalizeDailyResponse({ 'Meta Data': payload()['Meta Data'], 'Time Series (Daily)': {} }, 'IBM'), code('invalid_response'));
});
test('upstream notices are classified without leaking provider messages or keys', () => {
  const secret = 'secret_key_never_return';
  for (const [field, message, expected] of [['Note', `Rate limit reached for ${secret}`, 'rate_limited'], ['Information', `Demo key ${secret} unsupported`, 'demo_unavailable'], ['Information', `Premium access required ${secret}`, 'provider_access'], ['Error Message', `Invalid API key ${secret}`, 'provider_rejected']]) {
    assert.throws(() => normalizeDailyResponse({ [field]: message }, 'IBM'), (e: unknown) => e instanceof ProviderError && e.code === expected && !e.message.includes(secret));
  }
});
test('fetch uses the fixed HTTPS endpoint without redirects and returns normalized data', async () => {
  const fake = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input)); assert.equal(url.origin, 'https://www.alphavantage.co'); assert.equal(url.pathname, '/query');
    assert.equal(url.searchParams.get('function'), 'TIME_SERIES_DAILY'); assert.equal(url.searchParams.get('symbol'), 'IBM'); assert.equal(url.searchParams.get('apikey'), 'demo'); assert.equal([...url.searchParams].length, 3);
    assert.equal(init?.redirect, 'manual'); assert.ok(init?.signal);
    return Response.json(payload());
  }) as typeof fetch;
  assert.equal((await fetchDailyPrices('IBM', 'demo', fake)).dataset.observations.length, 2);
});
test('notice classification distinguishes access failures and incidental quota information', () => {
  for (const [message, expected] of [
    ['Your API key was generated. Please check its activation.', 'provider_rejected'],
    ['Invalid API key. Standard API rate limit is 25 requests per day.', 'provider_rejected'],
    ['This is a premium endpoint. Subscription plans have higher rate limits.', 'provider_access'],
    ['Premium access required. Standard usage limits apply.', 'provider_access'],
    ['Our standard API rate limit is 25 requests per day. Subscribe to premium to remove daily rate limits.', 'rate_limited'],
    ['Thank you for using the service. Our call frequency is 25 requests per day.', 'rate_limited'],
  ]) assert.throws(() => normalizeDailyResponse({ Information: message }, 'NVDA'), code(expected));
});
test('provider rate-limit errors do not imply an app cooldown resets the allowance', () => {
  assert.throws(() => normalizeDailyResponse({ Note: 'Rate limit reached for secret_test_key.' }, 'NVDA'), (e: unknown) => {
    assert.ok(e instanceof ProviderError);
    assert.equal(e.code, 'rate_limited');
    assert.match(e.message, /cannot determine the reset time/);
    assert.match(e.message, /does not reset/);
    assert.ok(!e.message.includes('secret_test_key'));
    return true;
  });
});
test('HTTP errors, malformed payloads and oversized responses are never imported', async () => {
  const cases: [Response, string][] = [[new Response('', { status: 302, headers: { Location: 'https://example.org' } }), 'unexpected_redirect'], [new Response('', { status: 429 }), 'rate_limited'], [new Response('', { status: 500 }), 'provider_unavailable'], [new Response('<html>not JSON</html>'), 'invalid_response'], [new Response('x'.repeat(128 * 1024 + 1)), 'invalid_response']];
  for (const [response, expected] of cases) await assert.rejects(fetchDailyPrices('IBM', 'demo', (async () => response) as typeof fetch), code(expected));
});
test('network errors redact secret URLs, and bounded timeouts stop the request', async () => {
  await assert.rejects(fetchDailyPrices('IBM', 'private_test_key', (async () => { throw new Error('https://provider?apikey=private_test_key'); }) as typeof fetch), (e: unknown) => e instanceof ProviderError && e.code === 'network_error' && !e.message.includes('private_test_key'));
  const stalled = (async (_input: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); })) as typeof fetch;
  await assert.rejects(fetchDailyPrices('IBM', 'demo', stalled, 5), code('timeout'));
});
