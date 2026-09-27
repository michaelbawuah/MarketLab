import { validateImport, type DatasetInput } from './market-data.ts';

// Deliberate US/USD universe: this endpoint does not return currency metadata.
export const providerSymbols = ['AAPL', 'AMZN', 'GOOGL', 'IBM', 'MSFT', 'NVDA', 'SPY'] as const;
export type ProviderMode = 'demo' | 'key' | 'configured';
export type ProviderProvenance = { origin: 'alphavantage'; refreshed: string; timezone: string };
export type ProviderRun = { id: string; symbol: string; mode: ProviderMode; started: string; status: string; records: number; dataset_id: string | null; message: string };
export type ProviderStatus = { configured: boolean; runs: ProviderRun[] };
export type ProviderDiagnostic = { upstreamStatus: number; noticeFields: string[]; providerNotice: string | null };
export class ProviderError extends Error {
  readonly code: string; readonly status: number; readonly diagnostic?: ProviderDiagnostic;
  constructor(code: string, message: string, status = 502, diagnostic?: ProviderDiagnostic) { super(message); this.code = code; this.status = status; this.diagnostic = diagnostic; }
}
const invalid = () => new ProviderError('invalid_response', 'The provider returned unexpected data. Nothing was imported.');
const rateLimited = (http = false) => new ProviderError('rate_limited', `${http ? 'Alpha Vantage rejected the request with a rate-limit response.' : 'Alpha Vantage returned a usage-limit notice instead of prices.'} This does not establish your key’s remaining allowance. MarketLab cannot determine the reset time; its one-minute cooldown does not reset the provider allowance.`, 429);
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }

function providerDiagnostic(payload: unknown, upstreamStatus: number, key: string): ProviderDiagnostic {
  const noticeFields = object(payload) ? ['Information', 'Note', 'Error Message'].filter(field => typeof payload[field] === 'string') : [];
  let notice = noticeFields.map(field => (payload as Record<string, string>)[field]).join(' ');
  // Redact before truncation so a credential crossing the length boundary cannot
  // survive as a partial key. Never include arbitrary response fields or URLs.
  if (key) notice = notice.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[key removed]');
  notice = notice.replace(/https?:\/\/[^\s<>"']+/gi, '[link removed]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(api[ _-]?key|token|secret)\s*[:=]\s*["']?[A-Z0-9_-]+["']?/gi, '$1=[key removed]')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  return { upstreamStatus, noticeFields, providerNotice: notice ? notice.slice(0, 800) + (notice.length > 800 ? '…' : '') : null };
}

async function readProviderPayload(response: Response): Promise<unknown> {
  const reader = response.body?.getReader(); if (!reader) throw invalid();
  let raw = '', size = 0; const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 128 * 1024) { await reader.cancel(); throw invalid(); } raw += decoder.decode(chunk.value, { stream: true }); }
    raw += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(raw) as unknown; } catch { throw invalid(); }
}

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
  // The main error stays a fixed message. The fetch boundary can additionally
  // attach a bounded notice after removing the submitted key and external links.
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
  let upstreamStatus: number | undefined, payload: unknown;
  try {
    const response = await fetcher(url, { signal: controller.signal, redirect: 'manual', headers: { Accept: 'application/json' } });
    upstreamStatus = response.status;
    if (response.status >= 300 && response.status < 400) throw new ProviderError('unexpected_redirect', 'The provider returned an unexpected redirect. No redirect was followed.');
    if (!response.ok) {
      try { payload = await readProviderPayload(response); } catch { /* An optional error body must not obscure the observed HTTP status. */ }
      if (response.status === 429) throw rateLimited(true);
      if (response.status === 401 || response.status === 403) throw new ProviderError('provider_access', 'Alpha Vantage denied access to this request. Review the provider response for details.', 403);
      throw new ProviderError('provider_unavailable', 'The market-data provider is unavailable. Try again later.', 503);
    }
    payload = await readProviderPayload(response);
    return normalizeDailyResponse(payload, symbol);
  } catch (e) {
    const error = e instanceof ProviderError ? e : controller.signal.aborted
      ? new ProviderError('timeout', 'The provider took too long to respond. Nothing was imported; you can retry.', 504)
      : new ProviderError('network_error', 'Could not reach the market-data provider. Try again later.', 503);
    throw upstreamStatus === undefined ? error : new ProviderError(error.code, error.message, error.status, providerDiagnostic(payload, upstreamStatus, key));
  } finally { clearTimeout(timer); }
}
