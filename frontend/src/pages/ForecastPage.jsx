import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MdAutoGraph, MdInventory2, MdWarningAmber } from 'react-icons/md';

import { fetchDemandForecast, fetchSeasonalCalendar } from '../api/forecast';
import { SkeletonBlock } from '../components/Skeleton';


const MONTH_OPTIONS = [
  { value: 3, label: '3 Months' },
  { value: 6, label: '6 Months' },
];

const URGENCY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'normal', label: 'Normal' },
];

const urgencyStyles = {
  critical: {
    label: 'CRITICAL',
    pill: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
    dot: 'bg-rose-500 animate-pulse',
  },
  at_risk: {
    label: 'AT RISK',
    pill: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  normal: {
    label: 'NORMAL',
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
};

const confidenceStyles = {
  high: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  medium: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  low: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const calendarStyles = {
  low: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300',
  normal: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  high: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  peak: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
};


function formatMonthLabel(value) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(
    new Date(year, month - 1, 1),
  );
}


function formatCalendarMonth(value) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(year, month - 1, 1));
}


function getEmptyStateLabel(urgencyFilter) {
  if (urgencyFilter === 'critical') {
    return 'No critical products';
  }
  if (urgencyFilter === 'at_risk') {
    return 'No at risk products';
  }
  if (urgencyFilter === 'normal') {
    return 'No normal products';
  }
  return 'No forecast products';
}


function ProgressBar({ currentStock, totalDemand }) {
  const denominator = Math.max(currentStock, totalDemand, 1);
  const ratio = Math.min((totalDemand / denominator) * 100, 100);

  let fillClass = 'bg-emerald-500';
  if (totalDemand > currentStock) {
    fillClass = 'bg-rose-500';
  } else if (totalDemand > currentStock * 0.7) {
    fillClass = 'bg-amber-500';
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        <span>Current Stock</span>
        <span>Total Forecasted Demand</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
        <span>{currentStock} units</span>
        <span>{totalDemand} units</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${fillClass}`}
          style={{ width: `${ratio}%` }}
        />
      </div>
    </div>
  );
}


function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <p className="font-semibold text-slate-900 dark:text-white">{formatMonthLabel(label)}</p>
      <div className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
        <p>Predicted Demand: {point.predicted_demand}</p>
        <p>Seasonal Factor: {Number(point.seasonal_factor || 0).toFixed(2)}</p>
      </div>
    </div>
  );
}


function SummaryPill({ label, count, urgency, active, onClick }) {
  const base =
    urgency === 'critical'
      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
      : urgency === 'at_risk'
        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-semibold transition ${
        active ? 'ring-2 ring-slate-900/10 dark:ring-white/10' : ''
      } ${base}`}
    >
      <span>{label}</span>
      <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs dark:bg-slate-900/40">{count}</span>
    </button>
  );
}


function ForecastCard({ product }) {
  const confidenceClass = confidenceStyles[product.confidence] ?? confidenceStyles.low;
  const urgencyMeta = urgencyStyles[product.urgency] ?? urgencyStyles.normal;

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-transform duration-300 hover:-translate-y-1 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-white">{product.name}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{product.sku}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-bold tracking-[0.18em] ${confidenceClass}`}>
            {product.confidence.toUpperCase()}
          </span>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold tracking-[0.18em] ${urgencyMeta.pill}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${urgencyMeta.dot}`} />
            {urgencyMeta.label}
          </span>
        </div>
      </div>

      <div className="mt-5">
        <ProgressBar
          currentStock={product.current_stock}
          totalDemand={product.total_forecasted_demand}
        />
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Monthly Forecast
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{product.category}</p>
        </div>
        <div className="h-20">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={product.monthly_forecast} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.2} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={formatCalendarMonth}
              />
              <YAxis hide />
              <Tooltip cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} content={<ForecastTooltip />} />
              <Bar dataKey="predicted_demand" radius={[6, 6, 0, 0]}>
                {product.monthly_forecast.map((entry) => {
                  let fill = '#94a3b8';
                  if (entry.seasonal_factor > 1.1) {
                    fill = '#f97316';
                  } else if (entry.seasonal_factor > 1.0) {
                    fill = '#3b82f6';
                  }

                  return <Cell key={entry.month} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-5 border-t border-dashed border-slate-200 pt-4 dark:border-slate-700">
        <p className={`text-sm font-semibold ${product.recommended_order_qty > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
          Recommended Order: {product.recommended_order_qty} units
        </p>
      </div>
    </article>
  );
}


function LoadingState() {
  return (
    <div className="space-y-8">
      <div className="rounded-[32px] bg-white p-6 shadow-sm dark:bg-slate-800">
        <div className="space-y-3">
          <SkeletonBlock className="h-7 w-56" />
          <SkeletonBlock className="h-4 w-80 max-w-full" />
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-[auto_auto_1fr]">
          <SkeletonBlock className="h-12 rounded-2xl" />
          <SkeletonBlock className="h-12 rounded-2xl" />
          <SkeletonBlock className="h-12 rounded-2xl" />
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-800">
            <div className="space-y-3">
              <SkeletonBlock className="h-5 w-36" />
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="h-16 rounded-2xl" />
              <SkeletonBlock className="h-20 rounded-2xl" />
              <SkeletonBlock className="h-4 w-40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


export default function ForecastPage() {
  const [monthsAhead, setMonthsAhead] = useState(3);
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState('');
  const [forecastData, setForecastData] = useState(null);
  const [calendarData, setCalendarData] = useState([]);
  const [loadingForecast, setLoadingForecast] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadForecast() {
      setLoadingForecast(true);
      setError('');

      try {
        const response = await fetchDemandForecast(monthsAhead);
        if (!active) {
          return;
        }
        setForecastData(response);
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'Failed to load forecast data');
          setForecastData(null);
        }
      } finally {
        if (active) {
          setLoadingForecast(false);
        }
      }
    }

    loadForecast();

    return () => {
      active = false;
    };
  }, [monthsAhead]);

  useEffect(() => {
    let active = true;

    async function loadCalendar() {
      setLoadingCalendar(true);

      try {
        const response = await fetchSeasonalCalendar();
        if (!active) {
          return;
        }
        setCalendarData(response.calendar || []);
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'Failed to load seasonal calendar');
          setCalendarData([]);
        }
      } finally {
        if (active) {
          setLoadingCalendar(false);
        }
      }
    }

    loadCalendar();

    return () => {
      active = false;
    };
  }, []);

  const summaryCounts = useMemo(() => {
    const products = forecastData?.products || [];
    return products.reduce(
      (accumulator, product) => {
        accumulator[product.urgency] += 1;
        return accumulator;
      },
      { critical: 0, at_risk: 0, normal: 0 },
    );
  }, [forecastData]);

  const selectedMonthRiskMap = useMemo(() => {
    return calendarData.reduce((accumulator, item) => {
      accumulator[item.month] = new Set(
        (item.at_risk_products || []).map((product) => product.product_id),
      );
      return accumulator;
    }, {});
  }, [calendarData]);

  const filteredProducts = useMemo(() => {
    const products = forecastData?.products || [];

    return products.filter((product) => {
      const urgencyMatches = urgencyFilter === 'all' || product.urgency === urgencyFilter;
      const monthMatches =
        !selectedCalendarMonth ||
        selectedMonthRiskMap[selectedCalendarMonth]?.has(product.product_id);

      return urgencyMatches && monthMatches;
    });
  }, [forecastData, selectedCalendarMonth, selectedMonthRiskMap, urgencyFilter]);

  const activeMonthMeta = useMemo(
    () => calendarData.find((item) => item.month === selectedCalendarMonth) || null,
    [calendarData, selectedCalendarMonth],
  );

  if (loadingForecast || loadingCalendar) {
    return <LoadingState />;
  }

  if (error && !forecastData) {
    return (
      <div className="rounded-2xl bg-rose-50 px-6 py-5 text-sm font-medium text-rose-700 dark:bg-rose-900/20 dark:text-rose-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 p-6 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:border-sky-500/20 dark:bg-slate-900/60 dark:text-sky-300">
              <MdAutoGraph className="text-sm" />
              Forecast Intelligence
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Demand Forecast
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              AI-powered seasonal demand predictions
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:min-w-[440px]">
            <label className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Forecast Horizon
              </span>
              <select
                value={monthsAhead}
                onChange={(event) => setMonthsAhead(Number(event.target.value))}
                className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none dark:text-white"
              >
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Urgency Filter
              </span>
              <select
                value={urgencyFilter}
                onChange={(event) => setUrgencyFilter(event.target.value)}
                className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none dark:text-white"
              >
                {URGENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
            <div className="rounded-2xl bg-slate-900 p-3 text-white dark:bg-slate-100 dark:text-slate-900">
              <MdWarningAmber className="text-xl" />
            </div>
            <div>
              <p className="text-sm font-semibold">Urgency Summary</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Click a pill to filter the product forecast cards.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <SummaryPill
              label="Critical"
              urgency="critical"
              count={summaryCounts.critical}
              active={urgencyFilter === 'critical'}
              onClick={() => setUrgencyFilter((current) => (current === 'critical' ? 'all' : 'critical'))}
            />
            <SummaryPill
              label="At Risk"
              urgency="at_risk"
              count={summaryCounts.at_risk}
              active={urgencyFilter === 'at_risk'}
              onClick={() => setUrgencyFilter((current) => (current === 'at_risk' ? 'all' : 'at_risk'))}
            />
            <SummaryPill
              label="Normal"
              urgency="normal"
              count={summaryCounts.normal}
              active={urgencyFilter === 'normal'}
              onClick={() => setUrgencyFilter((current) => (current === 'normal' ? 'all' : 'normal'))}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Product Forecasts</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Cards remain in API order: critical first, then at risk, then normal.
            </p>
          </div>
          {activeMonthMeta ? (
            <button
              type="button"
              onClick={() => setSelectedCalendarMonth('')}
              className="inline-flex w-fit items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Clear month filter: {formatMonthLabel(activeMonthMeta.month)}
            </button>
          ) : null}
        </div>

        {filteredProducts.length ? (
          <div className="grid gap-5 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <ForecastCard key={product.product_id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-800/60">
            <MdInventory2 className="mx-auto text-3xl text-slate-400 dark:text-slate-500" />
            <p className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
              {getEmptyStateLabel(urgencyFilter)}
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {selectedCalendarMonth
                ? `No products are flagged for ${formatMonthLabel(selectedCalendarMonth)} with the current filters.`
                : 'Try switching the urgency filter or forecast horizon.'}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Seasonal Calendar</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Tap a month to isolate products that are at risk or critical in that period.
            </p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            12-month outlook
          </p>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
            {calendarData.map((item) => {
              const palette = calendarStyles[item.demand_level] ?? calendarStyles.normal;
              const active = selectedCalendarMonth === item.month;

              return (
                <button
                  key={item.month}
                  type="button"
                  onClick={() => setSelectedCalendarMonth((current) => (current === item.month ? '' : item.month))}
                  className={`w-36 shrink-0 rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 ${palette} ${
                    active ? 'ring-2 ring-slate-900/10 dark:ring-white/10' : ''
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
                    {formatCalendarMonth(item.month)}
                  </p>
                  <p className="mt-3 text-xl font-bold">{item.at_risk_products.length}</p>
                  <p className="text-sm font-medium">at-risk products</p>
                  <span className="mt-4 inline-flex rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] dark:bg-slate-900/40">
                    {item.demand_level}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
