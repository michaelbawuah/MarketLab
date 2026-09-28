/** Choose an evaluable range while retaining warmup and at least three dates per segment. */
export function defaultResearchDates(observations: readonly { date: string }[], window: number) {
  if (!Number.isInteger(window) || window < 2 || window > 500) throw new Error('Choose a trend window between 2 and 500 price dates.');
  const points = observations.slice(window);
  if (points.length < 6) throw new Error('This trend window needs more history. Choose a shorter window or add more price dates.');
  const split = Math.min(points.length - 3, Math.max(3, Math.floor(points.length * .7)));
  return { start: points[0].date, end: points.at(-1)!.date, holdoutStart: points[split].date };
}
