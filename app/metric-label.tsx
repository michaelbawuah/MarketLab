'use client';
import { CircleHelp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const metricHelp: Record<string, string> = {
  'Ending value': 'What the investment was worth at the end, including cash and earned dividends.',
  'Executed trades': 'The number of purchases and sales made by the strategy.',
  'Total fees': 'The trading charges paid across all purchases and sales. Price differences are separate.',
  'Close (USD)': 'The saved stock price at the end of the trading day, in US dollars.',
  'Daily change': 'The percentage change from the previous saved price.',
  'Gross amount': 'The transaction amount before trading fees.',
  'Ex-date': 'The first date when new buyers no longer qualify for this dividend.',
  'Investment gain': 'Portfolio value minus your net deposits, including fees and earned dividends.',
  'Return': 'How much the investment grew or fell, shown as a percentage of the starting value.',
  'Return after costs': 'The percentage gained or lost after the trading fees and price differences modeled in this report.',
  'Time-weighted return': 'Investment growth with the effect of deposits and withdrawals removed.',
  'Drawdown': 'The largest fall from an earlier high to a later low among the dates shown.',
  'Sharpe ratio': 'Return relative to how much it fluctuated. Here it uses the observed intervals and a 0% cash return; it is not annualized.',
  'Slippage': 'The extra cost of buying slightly above, or selling slightly below, the quoted price.',
  'Volatility': 'How much returns moved around between the price dates shown. Bigger numbers mean larger swings.',
  'Beta': 'How strongly this investment moved with the chosen benchmark. Around 1 means similar sensitivity.',
  'Correlation': 'How closely two investments moved together, from −1 (opposite) to +1 (together).',
  'Benchmark': 'A reference investment used to compare your result. By default, the backtest buys and holds the same stock.',
  'Cost basis': 'What you paid for the shares you still hold, including purchase fees.',
  'Unrealized gain': 'The change in value of investments you still hold, compared with what you paid.',
  'Unrealized return': 'The percentage change in investments you still hold, compared with their purchase cost including fees.',
  'Realized gain': 'The gain or loss on investments you have already sold.',
  'Net contributions': 'Money you put in, minus money you took out.',
  'Weight': 'The share of your portfolio’s total value held in this investment.',
  'Fresh cash': 'This period starts over with the same initial cash and no carried-over shares.',
  'Trend window': 'The number of earlier price dates used to calculate the moving average. The default is 20.',
};

export default function MetricLabel({ children, help }: { children: string; help?: string }) {
  const description = help ?? metricHelp[children];
  if (!description) return <span>{children}</span>;
  return <span className="metric-label">{children}<TooltipProvider delayDuration={150}><Tooltip><TooltipTrigger asChild><button type="button" className="metric-help" aria-label={`Explain ${children}`}><CircleHelp size={15}/></button></TooltipTrigger><TooltipContent sideOffset={7} className="metric-tooltip"><p>{description}</p></TooltipContent></Tooltip></TooltipProvider></span>;
}
