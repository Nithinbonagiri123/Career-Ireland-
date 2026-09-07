// Public entry — re-exports the SSR-disabled client wrapper so the
// dashboard doesn't have to know about the recharts hydration
// mechanics. See trend-chart-client.tsx / trend-chart-inner.tsx.
export { TrendChart } from './trend-chart-client';
