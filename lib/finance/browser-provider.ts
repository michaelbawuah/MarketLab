import { fetchDailyPrices, normalizeDailyResponse, providerRequest, ProviderError, type ProviderDiagnostic } from './provider.ts';
import { priceDecimal, type DatasetSummary } from './market-data.ts';

type DailyResult = Awaited<ReturnType<typeof fetchDailyPrices>>;
export type BrowserDailyTransfer = { symbol: string; refreshed: string; timezone: string; observations: { date: string; close: string }[] };
export type ProviderSaveResult = { dataset: DatasetSummary; message: string; historyWarning?: string };

/** Only validated price fields cross back to MarketLab, never a raw provider body. */
export function browserDailyTransfer(result: DailyResult): BrowserDailyTransfer {
  return { symbol: result.dataset.symbol, refreshed: result.provenance.refreshed, timezone: result.provenance.timezone,
    observations: result.dataset.observations.map(p => ({ date: p.date, close: priceDecimal(p.priceMicros) })) };
}

function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
const invalid = () => new ProviderError('invalid_response', 'The browser returned unexpected price data. Nothing was imported.', 400);

/** The server validates the transfer independently and assigns its own provenance. */
export function normalizeBrowserTransfer(input: unknown, expectedSymbol: string, today?: string): DailyResult {
  if (!object(input) || Object.keys(input).sort().join(',') !== 'observations,refreshed,symbol,timezone' || input.symbol !== expectedSymbol || !Array.isArray(input.observations) || input.observations.length < 2 || input.observations.length > 100) throw invalid();
  const dates = new Set<string>();
  const entries = input.observations.map(row => {
    if (!object(row) || Object.keys(row).sort().join(',') !== 'close,date' || typeof row.date !== 'string' || typeof row.close !== 'string' || dates.has(row.date)) throw invalid();
    dates.add(row.date); return [row.date, { '4. close': row.close }];
  });
  let result: DailyResult;
  try { result = normalizeDailyResponse({ 'Meta Data': { '2. Symbol': input.symbol, '3. Last Refreshed': input.refreshed, '4. Output Size': 'Compact', '5. Time Zone': input.timezone }, 'Time Series (Daily)': Object.fromEntries(entries) }, expectedSymbol, today); }
  catch { throw invalid(); }
  return { dataset: { ...result.dataset, source: 'Alpha Vantage · TIME_SERIES_DAILY · browser import' }, provenance: { ...result.provenance, origin: 'alphavantage-browser' } };
}

export class BrowserProviderError extends ProviderError {
  readonly requestId: string;
  constructor(error: ProviderError, requestId: string) { super(error.code, error.message, error.status, error.diagnostic); this.requestId = requestId; }
}

/** One explicit user action: reserve, fetch once from the user's browser, save. */
export async function fetchAndSaveBrowserPrices(symbol: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<ProviderSaveResult> {
  const request = providerRequest({ symbol, mode: 'key', apiKey });
  let requestId = '';
  async function submit(payload: unknown) {
    const response = await fetcher('/api/provider/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
    const body = await response.json() as ProviderSaveResult & { error?: string; code?: string; diagnostic?: ProviderDiagnostic; requestId?: string };
    if (!response.ok) throw new ProviderError(body.code ?? 'save_failed', body.error ?? 'Could not save prices. Check saved datasets before trying again.', response.status);
    return body;
  }
  try {
    const reservation = await submit({ action: 'start', symbol: request.symbol });
    if (!reservation.requestId) throw new ProviderError('invalid_response', 'Could not start the browser request. No provider request was sent.');
    requestId = reservation.requestId;
    const result = await fetchDailyPrices(request.symbol, request.key, (url, init) => fetcher(url, { ...init, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error' }));
    return await submit({ action: 'complete', requestId, data: browserDailyTransfer(result) });
  } catch (e) {
    // A fixed failure marker is sufficient for history. No keys or notices return
    // to the server, including when Alpha Vantage echoes the submitted key.
    if (requestId) try { await submit({ action: 'fail', requestId }); } catch { /* Preserve the original error; never retry the provider request. */ }
    const error = e instanceof ProviderError ? e : new ProviderError('connection_error', 'Could not finish the browser connection. Check saved datasets before trying again.', 503);
    throw new BrowserProviderError(error, requestId);
  }
}
