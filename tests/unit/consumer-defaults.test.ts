import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultResearchDates } from '../../lib/research-defaults.ts';
import { friendlyError } from '../../lib/client-errors.ts';

const dates = (count: number) => Array.from({length: count}, (_, i) => ({ date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10) }));

test('automatic dates keep warmup and enough prices for both evaluation periods', () => {
  for (const count of [26, 27, 100, 500]) {
    const observations = dates(count), chosen = defaultResearchDates(observations, 20);
    const start = observations.findIndex(p => p.date === chosen.start), split = observations.findIndex(p => p.date === chosen.holdoutStart);
    assert.equal(start, 20);
    assert.equal(chosen.end, observations.at(-1)!.date);
    assert.ok(split - start >= 3);
    assert.ok(count - split >= 3);
  }
  assert.deepEqual(defaultResearchDates(dates(26), 20), {start: '2026-01-21', end: '2026-01-26', holdoutStart: '2026-01-24'});
});

test('automatic dates refuse invalid settings instead of inventing missing history', () => {
  assert.throws(() => defaultResearchDates(dates(25), 20), /more history/);
  for (const window of [0, 1, 2.5, 501, NaN]) assert.throws(() => defaultResearchDates(dates(100), window), /between 2 and 500/);
});

test('unknown technical failures do not expose internal details to users', () => {
  for (const raw of ['D1_ERROR: SQL query failed with secret=abc', 'TypeError: column.toFixed is not a function at server.ts:7', '<html>502 proxy stack trace</html>', 'Unexpected token in JSON at position 2', 'Row 1: invalid token=private-token']) {
    const shown = friendlyError(new Error(raw));
    assert.notEqual(shown, raw);
    assert.doesNotMatch(shown, /D1_|SQL|server\.ts|private-token|<html>|stack trace|secret=|JSON/);
    assert.match(shown, /try again|reload|unavailable/i);
  }
});

test('recognizable failures give actionable language without masking valid limits', () => {
  assert.match(friendlyError(new Error('CSV header must include date and close')), /date and close.*try again/);
  assert.match(friendlyError(new Error('At most 500 transactions are allowed')), /500 transactions/);
  assert.match(friendlyError(new Error('Complete event coverage required')), /splits|split and dividend/);
  assert.match(friendlyError(new Error('Unsupported transaction: reinvestment')), /can’t calculate yet/);
  assert.match(friendlyError(new Error('Failed to fetch')), /internet connection/);
  assert.match(friendlyError(new Error('Replay verification mismatch')), /hasn’t been marked verified/);
});
