import test from 'node:test';
import assert from 'node:assert/strict';
import { browserDailyTransfer, normalizeBrowserTransfer, fetchAndSaveBrowserPrices, BrowserProviderError } from '../../lib/finance/browser-provider.ts';
import { normalizeDailyResponse } from '../../lib/finance/provider.ts';

const payload = () => ({ 'Meta Data': { '2. Symbol': 'NVDA', '3. Last Refreshed': '2026-09-24', '4. Output Size': 'Compact', '5. Time Zone': 'US/Eastern' }, 'Time Series (Daily)': { '2026-09-24': { '4. close': '101.123400' }, '2026-09-23': { '4. close': '100.0000' } }, ignored: 'NEVER_TRANSFER' });

test('direct connection sends the key only to Alpha Vantage, reserves first and saves exact prices', async () => {
  const calls: string[] = [], sent: unknown[] = [], key = 'BROWSER_FICTIONAL_KEY';
  const fake = (async (url: URL | RequestInfo, init?: RequestInit) => {
    const location = String(url); calls.push(location.startsWith('https:') ? 'provider' : 'app');
    if (location.startsWith('https:')) {
      const query = new URL(location); assert.equal(query.origin, 'https://www.alphavantage.co'); assert.equal(query.searchParams.get('apikey'), key); assert.equal(query.searchParams.get('symbol'), 'NVDA');
      assert.equal(init?.credentials, 'omit'); assert.equal(init?.referrerPolicy, 'no-referrer'); assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store'); assert.equal(init?.mode, 'cors');
      return Response.json(payload());
    }
    assert.equal(location, '/api/provider/browser');
    assert.ok(!JSON.stringify(init).includes(key));
    const body = JSON.parse(String(init?.body)); sent.push(body);
    if (body.action === 'start') return Response.json({ requestId: 'fictional-reservation' }, { status: 201 });
    assert.equal(body.action, 'complete');
    assert.ok(!JSON.stringify(body).includes('NEVER_TRANSFER'));
    assert.deepEqual(body.data.observations, [{ date: '2026-09-23', close: '100' }, { date: '2026-09-24', close: '101.1234' }]);
    return Response.json({ dataset: { id: 'saved-fixture' }, message: 'Saved' });
  }) as typeof fetch;
  const saved = await fetchAndSaveBrowserPrices('NVDA', '  ' + key + '  ', fake);
  assert.equal(saved.dataset.id, 'saved-fixture'); assert.deepEqual(calls, ['app', 'provider', 'app']); assert.equal(sent.length, 2);
});

test('provider denial triggers no retry or hosted fallback and no notice/key is persisted', async () => {
  const key = 'BROWSER_PRIVATE_KEY', actions: string[] = [];
  let externalCalls = 0;
  const fake = (async (url: URL | RequestInfo, init?: RequestInit) => {
    if (String(url).startsWith('https:')) { externalCalls++; return Response.json({ Note: `Rate limit reached for ${key}. PRIVATE_NOTICE_MARKER` }); }
    const body = JSON.parse(String(init?.body)); actions.push(body.action);
    assert.ok(!JSON.stringify(body).includes(key)); assert.ok(!JSON.stringify(body).includes('PRIVATE_NOTICE_MARKER'));
    return Response.json(body.action === 'start' ? { requestId: 'fictional-reservation' } : { recorded: true });
  }) as typeof fetch;
  await assert.rejects(fetchAndSaveBrowserPrices('NVDA', key, fake), (e: unknown) => {
    assert.ok(e instanceof BrowserProviderError); assert.equal(e.code, 'rate_limited'); assert.equal(e.diagnostic?.upstreamStatus, 200); assert.ok(!JSON.stringify(e).includes(key)); return true;
  });
  assert.equal(externalCalls, 1); assert.deepEqual(actions, ['start', 'fail']);
});

test('reservation denial prevents any provider request', async () => {
  let calls = 0;
  const fake = (async (url: URL | RequestInfo) => { calls++; assert.equal(String(url), '/api/provider/browser'); return Response.json({ code: 'cooldown', error: 'Wait one minute.' }, { status: 429 }); }) as typeof fetch;
  await assert.rejects(fetchAndSaveBrowserPrices('NVDA', 'BROWSER_PRIVATE_KEY', fake), (e: unknown) => e instanceof BrowserProviderError && e.code === 'cooldown');
  assert.equal(calls, 1);
});

test('browser and save network failures never expose the key or retry provider traffic', async () => {
  for (const failAt of ['provider', 'save']) {
    let externalCalls = 0;
    const actions: string[] = [];
    const fake = (async (url: URL | RequestInfo, init?: RequestInit) => {
      if (String(url).startsWith('https:')) { externalCalls++; if (failAt === 'provider') throw new Error(String(url)); return Response.json(payload()); }
      const body = JSON.parse(String(init?.body)); actions.push(body.action);
      if (body.action === 'complete') throw new Error('private transport detail');
      return Response.json(body.action === 'start' ? { requestId: 'fictional-reservation' } : { recorded: true });
    }) as typeof fetch;
    await assert.rejects(fetchAndSaveBrowserPrices('NVDA', 'BROWSER_PRIVATE_KEY', fake), (e: unknown) => {
      assert.ok(e instanceof BrowserProviderError); assert.ok(!e.message.includes('BROWSER_PRIVATE_KEY')); assert.ok(!e.message.includes('private transport detail')); return true;
    });
    assert.equal(externalCalls, 1); assert.equal(actions.at(-1), 'fail');
  }
});

test('server transfer validation keeps browser provenance distinct and rejects forged or invalid data', () => {
  const transfer = browserDailyTransfer(normalizeDailyResponse(payload(), 'NVDA'));
  const normalized = normalizeBrowserTransfer(transfer, 'NVDA');
  assert.equal(normalized.provenance.origin, 'alphavantage-browser'); assert.match(normalized.dataset.source, /browser import/);
  assert.equal(normalized.dataset.observations[1].priceMicros, '101123400');
  for (const data of [
    { ...transfer, symbol: 'IBM' }, { ...transfer, origin: 'alphavantage' }, { ...transfer, apiKey: 'PRIVATE_KEY' },
    { ...transfer, refreshed: '2026-09-23' }, { ...transfer, timezone: 'Europe/London' },
    { ...transfer, observations: [transfer.observations[0], transfer.observations[0]] },
    { ...transfer, observations: [{ date: '2026-09-23', close: '100', secret: 'PRIVATE' }, transfer.observations[1]] },
    { ...transfer, observations: [{ date: '2026-09-23', close: '1e2' }, transfer.observations[1]] },
    { ...transfer, observations: Array(101).fill(transfer.observations[0]) },
  ]) assert.throws(() => normalizeBrowserTransfer(data, 'NVDA'), /unexpected price data/);
  assert.throws(() => normalizeBrowserTransfer(transfer, 'NVDA', '2026-09-23'), /unexpected price data/);
});
