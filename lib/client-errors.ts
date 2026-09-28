/** Public-facing recovery guidance. Unrecognized server/runtime text stays internal. */
export function friendlyError(error: unknown, fallback = 'We couldn’t finish that. Please try again. If it keeps happening, reload the page.') {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/sign.?in|unauthenticated|authentication required|session.*expired/i.test(message)) return 'Your session has ended. Sign in again, then retry.';
  if (/forbidden|owner.only|access denied|not authorized/i.test(message)) return 'This account can’t open that workspace. Use your report or invitation link, or sign in with the account that created it.';
  if (/failed to fetch|network|connection|timeout|timed out|aborted/i.test(message)) return 'We couldn’t connect. Check your internet connection, then try again. Your saved reports are still available when the connection returns.';
  if (/quota|rate.limit|cooldown|too many|allowance|request.*minute/i.test(message)) return 'The price provider needs a little more time. Try again later, or keep working with your saved prices.';
  if (/api.key|invalid key|missing key/i.test(message)) return 'Check your price-provider key and enter it again. You can also import a CSV file.';
  if (/replay.*mismatch|verification.*mismatch|did not match|failed.*checks|calculation.*mismatch/i.test(message)) return 'The independent calculation didn’t match this report. It hasn’t been marked verified. Review the report’s details before sharing it.';
  if (/busy|capacity|unavailable|(?:HTTP|status|code)\s*50[023]\b|internal.*error|service.*configured/i.test(message)) return 'This feature is temporarily unavailable. Please try again shortly.';
  if (/changed|stale|revision|fingerprint|conflict/i.test(message)) return 'This has changed since you opened it. Reload, review the latest version, and try again.';
  if (/complete.*event|event.*complete|event.*coverage|saved.*event|corporate.action/i.test(message)) return 'The split and dividend history needs a review. Open Prices & data, select this stock, and complete its company events before continuing.';
  if (/warmup|SMA|more history|six evaluation|three observations|too few/i.test(message)) return 'There isn’t enough price history for these settings. Choose a shorter trend window or import more dates, then try again.';
  if (/identical.*dates|matched.*dates|missing.*price|exact.date|no.*close|coverage/i.test(message)) return 'Some required prices are missing. Use a date range covered by all selected stocks, or add the missing daily prices.';
  if (/unsupported.*(action|transaction)|action.*unsupported|not supported.*(action|transaction)/i.test(message)) return 'This file includes a transaction type MarketLab can’t calculate yet. Open Supported transactions in the import form; don’t remove real activity just to make the file pass.';
  if (/256 KiB|too large|file.*size/i.test(message)) return 'This file is too large. Choose a CSV smaller than 256 KB.';
  if (/CSV|header|column|delimiter|row|date|decimal|positive|non.negative|duplicate|must be|at most|at least|insufficient|cash|shares|symbol|confirm|review/i.test(message)
      && message.length <= 260 && !/[{}<>]|\bat\s+\S+\.(?:ts|js)|SQL|D1_|SQLITE|stack|https?:|token|secret|error code|HTTP\s*\d|unexpected|JSON/i.test(message)) {
    const plain = message.replace(/dated observations/gi, 'prices with dates').replace(/dataset/gi, 'price history').replace(/observations/gi, 'price dates').replace(/basis points/gi, 'hundredths of a percent').replace(/ledger/gi, 'transaction history').replace(/raw closes/gi, 'unadjusted daily prices');
    return `${plain.replace(/[.\s]+$/, '')}. Review your settings or file, then try again.`;
  }
  return fallback;
}
