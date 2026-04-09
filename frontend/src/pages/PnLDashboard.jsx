import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  MdCalendarMonth,
  MdMonetizationOn,
  MdPaid,
  MdQueryStats,
  MdTrendingUp,
} from 'react-icons/md';

import { fetchPnL, fetchPnLCategories } from '../api/analytics';
import StatCard from '../components/StatCard';
import { SkeletonBlock } from '../components/Skeleton';


const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear - 2, currentYear - 1, currentYear];
const RUPEE_FORMATTER = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});


function formatCurrency(value) {
  return `₹${RUPEE_FORMATTER.format(Number(value || 0))}`;
}


function formatCompactRupee(value) {
  const numericValue = Number(value || 0);
  const absoluteValue = Math.abs(numericValue);

  if (absoluteValue >= 10000000) {
    return `₹${(numericValue / 10000000).toFixed(1)}Cr`;
  }
  if (absoluteValue >= 100000) {
    return `₹${(numericValue / 100000).toFixed(1)}L`;
  }
  if (absoluteValue >= 1000) {
    return `₹${(numericValue / 1000).toFixed(1)}K`;
  }
  return `₹${RUPEE_FORMATTER.format(numericValue)}`;
}


function getErrorMessage(error, fallback) {
  return error?.message || fallback;
}


function hasMeaningfulPnLData(data) {
  return (data?.monthly ?? []).some(
    (item) => Number(item.revenue) > 0 || Number(item.cost) > 0 || Number(item.gross_profit) !== 0,
  );
}


function getMarginBadgeClass(value) {
  if (value === null || value === undefined) {
    return 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300';
  }
  if (value > 20) {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
  }
  if (value >= 5) {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
  }
  return 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300';
}


function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <SkeletonBlock className="h-8 w-56" />
            <SkeletonBlock className="h-4 w-80 max-w-full" />
          </div>
          <SkeletonBlock className="h-11 w-36 rounded-xl" />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-800">
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="h-8 w-32" />
                <SkeletonBlock className="h-4 w-28" />
              </div>
              <SkeletonBlock className="h-12 w-12 rounded-xl" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <div className="space-y-3">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="h-4 w-72 max-w-full" />
          <SkeletonBlock className="mt-6 h-80 rounded-2xl" />
        </div>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <div className="space-y-3">
          <SkeletonBlock className="h-5 w-44" />
          <SkeletonBlock className="h-4 w-72 max-w-full" />
          <SkeletonBlock className="mt-6 h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}


function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const entries = payload.reduce((accumulator, item) => {
    accumulator[item.dataKey] = item.value;
    return accumulator;
  }, {});

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <p className="font-semibold text-slate-900 dark:text-white">{label}</p>
      <div className="mt-2 space-y-1.5 text-slate-600 dark:text-slate-300">
        <p>Revenue: {formatCurrency(entries.revenue)}</p>
        <p>Cost: {formatCurrency(entries.cost)}</p>
        <p>Gross Profit: {formatCurrency(entries.gross_profit)}</p>
      </div>
    </div>
  );
}


function EmptyState({ onRetry }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-8 py-20 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-300">
        <MdQueryStats className="text-3xl" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-slate-900 dark:text-white">No P&amp;L data available</h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        There are no revenue or cost records for the selected year yet.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        Retry
      </button>
    </div>
  );
}


export default function PnLDashboard() {
  const [year, setYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [pnlData, setPnlData] = useState(null);
  const [categoriesData, setCategoriesData] = useState({ categories: [], period: currentYear.toString() });
  const [loading, setLoading] = useState(true);
  const [retryIndex, setRetryIndex] = useState(0);
  const [error, setError] = useState('');
  const hasAutoSwitchedYear = useRef(false);
  const userSelectedYear = useRef(false);

  useEffect(() => {
    setSelectedMonth(null);
  }, [year]);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        let targetYear = year;
        let [nextPnlData, nextCategoriesData] = await Promise.all([
          fetchPnL(targetYear),
          fetchPnLCategories(targetYear, selectedMonth),
        ]);

        if (
          !selectedMonth &&
          !userSelectedYear.current &&
          !hasAutoSwitchedYear.current &&
          !hasMeaningfulPnLData(nextPnlData)
        ) {
          const fallbackYears = [...YEAR_OPTIONS]
            .sort((left, right) => right - left)
            .filter((option) => option !== targetYear);

          for (const fallbackYear of fallbackYears) {
            const fallbackPnlData = await fetchPnL(fallbackYear);
            if (!hasMeaningfulPnLData(fallbackPnlData)) {
              continue;
            }

            const fallbackCategoriesData = await fetchPnLCategories(fallbackYear);
            targetYear = fallbackYear;
            nextPnlData = fallbackPnlData;
            nextCategoriesData = fallbackCategoriesData;
            hasAutoSwitchedYear.current = true;
            break;
          }
        }

        if (!active) {
          return;
        }

        if (targetYear !== year) {
          setYear(targetYear);
        }
        setPnlData(nextPnlData);
        setCategoriesData(nextCategoriesData);
      } catch (loadError) {
        if (active) {
          setError(getErrorMessage(loadError, 'Failed to load P&L dashboard'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [year, selectedMonth, retryIndex]);

  const chartData = useMemo(
    () =>
      (pnlData?.monthly ?? []).map((item) => ({
        ...item,
        monthLabel: item.month_name.slice(0, 3),
      })),
    [pnlData],
  );

  const hasChartData = useMemo(() => hasMeaningfulPnLData(pnlData), [pnlData]);

  const bestMonthName = useMemo(() => {
    if (!pnlData?.summary?.best_month?.month) {
      return 'N/A';
    }
    const monthData = pnlData.monthly.find((item) => item.month === pnlData.summary.best_month.month);
    return monthData?.month_name ?? 'N/A';
  }, [pnlData]);

  const statCards = useMemo(() => {
    const summary = pnlData?.summary;
    const totalProfit = summary?.total_profit ?? 0;

    return [
      {
        title: 'Total Revenue',
        value: {
          number: summary?.total_revenue ?? 0,
          formatter: formatCurrency,
        },
        subtitle: `For ${year}`,
        color: 'blue',
        icon: MdPaid,
        trend: 'up',
      },
      {
        title: 'Total Cost',
        value: {
          number: summary?.total_cost ?? 0,
          formatter: formatCurrency,
        },
        subtitle: `For ${year}`,
        color: 'orange',
        icon: MdMonetizationOn,
        trend: 'flat',
      },
      {
        title: 'Gross Profit',
        value: {
          number: totalProfit,
          formatter: formatCurrency,
        },
        subtitle: totalProfit >= 0 ? 'Profitable year so far' : 'Costs exceeded revenue',
        color: totalProfit >= 0 ? 'green' : 'red',
        icon: MdTrendingUp,
        trend: totalProfit >= 0 ? 'up' : 'down',
      },
      {
        title: 'Best Month',
        value: bestMonthName,
        subtitle: formatCurrency(summary?.best_month?.profit ?? 0),
        color: 'teal',
        icon: MdCalendarMonth,
        trend: 'up',
      },
    ];
  }, [bestMonthName, pnlData, year]);

  const handleRetry = () => {
    setRetryIndex((current) => current + 1);
  };

  const handleBarClick = (data) => {
    if (!data?.activePayload?.length) {
      return;
    }

    const monthValue = data.activePayload[0]?.payload?.month;
    setSelectedMonth((current) => (current === monthValue ? null : monthValue));
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-sm dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 font-medium text-white transition hover:bg-rose-500"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasChartData) {
    return <EmptyState onRetry={handleRetry} />;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-sky-900 px-6 py-7 text-white shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-sky-200/80">Finance Analytics</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Monthly P&amp;L Dashboard</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-200/80">
              Review revenue, purchasing cost, and gross profit trends across the year, then drill into category performance month by month.
            </p>
          </div>

          <label className="w-full max-w-[180px]">
            <span className="mb-2 block text-sm font-medium text-sky-100">Select year</span>
            <select
              value={year}
              onChange={(event) => {
                userSelectedYear.current = true;
                setYear(Number(event.target.value));
              }}
              className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white backdrop-blur transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
            >
              {YEAR_OPTIONS.map((option) => (
                <option key={option} value={option} className="text-slate-900">
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Revenue, Cost &amp; Gross Profit</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Click a month bar to filter the category breakdown table below.
            </p>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {selectedMonth
              ? `Filtered month: ${chartData.find((item) => item.month === selectedMonth)?.month_name ?? 'Selected'}`
              : 'Showing full-year categories'}
          </div>
        </div>

        <div className="mt-6 min-h-[380px] h-[60vh] max-h-[600px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} onClick={handleBarClick} margin={{ top: 12, right: 8, left: -8, bottom: 12 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#cbd5e1" strokeOpacity={0.35} vertical={false} />
              <XAxis dataKey="monthLabel" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatCompactRupee} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={84} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} />
              <Legend verticalAlign="bottom" height={36} />
              <Bar name="Revenue" dataKey="revenue" barSize={20} radius={[8, 8, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell
                    key={`revenue-${entry.month}`}
                    fill={selectedMonth === entry.month ? '#0284c7' : '#38bdf8'}
                    cursor="pointer"
                  />
                ))}
              </Bar>
              <Bar name="Cost" dataKey="cost" barSize={20} radius={[8, 8, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell
                    key={`cost-${entry.month}`}
                    fill={selectedMonth === entry.month ? '#d97706' : '#fb923c'}
                    cursor="pointer"
                  />
                ))}
              </Bar>
              <Line
                name="Gross Profit"
                type="monotone"
                dataKey="gross_profit"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: '#ffffff' }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Category Breakdown</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {selectedMonth
                ? `Category margin for ${chartData.find((item) => item.month === selectedMonth)?.month_name ?? categoriesData.period}.`
                : `Category margin for ${categoriesData.period}.`}
            </p>
          </div>
          {selectedMonth ? (
            <button
              type="button"
              onClick={() => setSelectedMonth(null)}
              className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50"
            >
              Clear month filter
            </button>
          ) : null}
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/70">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Revenue</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Gross Profit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                {categoriesData.categories.length ? (
                  categoriesData.categories.map((category) => (
                    <tr key={category.category} className="transition hover:bg-slate-50/80 dark:hover:bg-slate-700/30">
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-slate-900 dark:text-white">{category.category}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600 dark:text-slate-300">{formatCurrency(category.revenue)}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600 dark:text-slate-300">{formatCurrency(category.cost)}</td>
                      <td className={`whitespace-nowrap px-4 py-4 text-right text-sm font-medium ${category.gross_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {formatCurrency(category.gross_profit)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getMarginBadgeClass(category.margin_pct)}`}>
                          {category.margin_pct === null ? 'N/A' : `${category.margin_pct.toFixed(2)}%`}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      No category performance data found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
