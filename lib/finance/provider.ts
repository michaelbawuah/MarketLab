import { validateImport, type DatasetInput } from './market-data.ts';

// Deliberate US/USD universe: this endpoint does not return currency metadata.
export const providerSymbols = ['AAPL', 'AMZN', 'GOOGL', 'IBM', 'MSFT', 'NVDA', 'SPY'] as const;
export type ProviderMode = 'demo' | 'key' | 'configured';
export type ProviderProvenance = { origin: 'alphavantage'; refreshed: string; timezone: string };
export type ProviderRun = { id: string; symbol: string; mode: ProviderMode; started: string; status: string; records: number; dataset_id: string | null; message: string };
export type ProviderStatus = { configured: boolean; runs: ProviderRun[] };
export class ProviderError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, message: string, status = 502) { super(message); this.code = code; this.status = status; }
}
const invalid = () => new ProviderError('invalid_response', 'The provider returned unexpected data. Nothing was imported.');
const rateLimited = () => new ProviderError('rate_limited', 'Alpha Vantage is limiting this request. MarketLab cannot determine the reset time. Its one-minute cooldown does not reset the provider allowance.', 429);
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }

export function providerRequest(input: unknown, configuredKey?: string): { symbol: string; mode: ProviderMode; key: string } {
  if (!object(input) || Object.keys(input).some(k => !['symbol', 'mode', 'apiKey'].includes(k)) || typeof input.symbol !== 'string' || !['demo', 'key', 'configured'].includes(input.mode as string)) throw new ProviderError('invalid_request', 'Choose a supported symbol and connection method.', 400);
  const symbol = input.symbol.trim().toUpperCase(), mode = input.mode as ProviderMode;
  if (!providerSymbols.some(s => s === symbol)) throw new ProviderError('unsupported_symbol', 'Choose one of the supported US-listed USD symbols.', 400);
  if (mode !== 'key' && input.apiKey !== undefined) throw new ProviderError('invalid_request', 'Only the one-time key method accepts an API key.', 400);
  if (mode === 'demo') {
    if (symbol !== 'IBM') throw new ProviderError('demo_symbol', 'The provider demo supports IBM only.', 400);
    return { symbol, mode, key: 'demo' };
  }
  const key = mode === 'configured' ? configuredKey?.trim() : typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  if (!key || key.toLowerCase() === 'demo' || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new ProviderError('key_required', mode === 'configured' ? 'A server API key has not been configured.' : 'Enter a valid Alpha Vantage API key.', 400);
  return { symbol, mode, key };
}

export function normalizeDailyResponse(payload: unknown, symbol: string, today = new Date().toISOString().slice(0, 10)): { dataset: DatasetInput; provenance: ProviderProvenance } {
  if (!object(payload) || !providerSymbols.some(s => s === symbol)) throw invalid();
  // Provider notices may contain the submitted key. Return only our own fixed messages.
  const notice = [payload.Information, payload.Note, payload['Error Message']].filter(x => typeof x === 'string').join(' ');
  if (notice) {
    // Explicit key/access rejections outrank incidental quota information. Match
    // complete phrases: words such as "generated" must never imply a rate limit.
    if (/\b(?:invalid|missing|incorrect|expired|revoked)\s+(?:api\s*key|apikey)\b|\b(?:api\s*key|apikey)\s+(?:is\s+)?(?:invalid|missing|incorrect|expired|revoked)\b/i.test(notice)) throw new ProviderError('provider_rejected', 'Alpha Vantage rejected the API key. Check the key in your provider account.', 400);
    if (/\b(?:premium|paid)\s+(?:api\s+)?endpoint\b|\b(?:premium|paid)\s+access\s+(?:is\s+)?required\b/i.test(notice)) throw new ProviderError('provider_access', 'This request is not included in the provider account’s access.', 403);
    if (/\b(?:rate[\s-]*limits?|call\s+(?:frequency|volume)|(?:request|usage|daily|monthly)\s+(?:limits?|quota)|requests?\s+per\s+(?:day|minute|second)|too\s+many\s+requests|quota\s+(?:exceeded|reached|exhausted))\b/i.test(notice)) throw rateLimited();
    if (/demo/i.test(notice)) throw new ProviderError('demo_unavailable', 'The IBM provider demo is unavailable. Try again later or use your own API key.', 503);
    if (/premium|subscription|entitlement/i.test(notice)) throw new ProviderError('provider_access', 'This request is not included in the provider account’s access.', 403);
    throw new ProviderError('provider_rejected', 'The provider rejected the request. Check the API key and its access.', 400);
  }
  const meta = payload['Meta Data'], series = payload['Time Series (Daily)'];
  if (!object(meta) || !object(series) || meta['2. Symbol'] !== symbol || meta['4. Output Size'] !== 'Compact') throw invalid();
  const refreshed = meta['3. Last Refreshed'], timezone = meta['5. Time Zone'];
  if (typeof refreshed !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(refreshed) || !['US/Eastern', 'America/New_York'].includes(timezone as string)) throw invalid();
  const entries = Object.entries(series);
  if (entries.length < 2 || entries.length > 100) throw invalid();
  const lines = entries.map(([date, row]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !object(row) || typeof row['4. close'] !== 'string' || !/^\d+(?:\.\d+)?$/.test(row['4. close'])) throw invalid();
    return date + ',' + row['4. close'];
  });
  let dataset: DatasetInput;
  try { dataset = validateImport({ symbol, source: 'Alpha Vantage · TIME_SERIES_DAILY · compact', basis: 'raw', priceColumn: 'close', kind: 'historical', csv: 'date,close\n' + lines.join('\n') }, today); }
  catch { throw invalid(); }
  if (dataset.observations.at(-1)!.date !== refreshed) throw invalid();
  return { dataset, provenance: { origin: 'alphavantage', refreshed, timezone: timezone as string } };
}

export async function fetchDailyPrices(symbol: string, key: string, fetcher: typeof fetch = fetch, timeoutMs = 20000) {
  const url = new URL('https://www.alphavantage.co/query');
  url.searchParams.set('function', 'TIME_SERIES_DAILY'); url.searchParams.set('symbol', symbol); url.searchParams.set('apikey', key);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal, redirect: 'manual', headers: { Accept: 'application/json' } });
    if (response.status >= 300 && response.status < 400) throw new ProviderError('unexpected_redirect', 'The provider returned an unexpected redirect. No redirect was followed.');
    if (response.status === 429) throw rateLimited();
    if (!response.ok) throw new ProviderError('provider_unavailable', 'The market-data provider is unavailable. Try again later.', 503);
    const reader = response.body?.getReader(); if (!reader) throw invalid();
    let raw = '', size = 0; const decoder = new TextDecoder('utf-8', { fatal: true });
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 128 * 1024) { await reader.cancel(); throw invalid(); } raw += decoder.decode(chunk.value, { stream: true }); }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
    let payload: unknown; try { payload = JSON.parse(raw); } catch { throw invalid(); }
    return normalizeDailyResponse(payload, symbol);
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (controller.signal.aborted) throw new ProviderError('timeout', 'The provider took too long to respond. Nothing was imported; you can retry.', 504);
    throw new ProviderError('network_error', 'Could not reach the market-data provider. Try again later.', 503);
  } finally { clearTimeout(timer); }
}
