import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  MdArrowDownward,
  MdArrowForward,
  MdArrowUpward,
  MdCategory,
  MdClose,
  MdInventory2,
  MdInsights,
  MdPaid,
} from 'react-icons/md';

import {
  fetchMonthlySales,
  fetchProductTrend,
  fetchSalesCategories,
} from '../api/analytics';
import StatCard from '../components/StatCard';
import { SkeletonBlock } from '../components/Skeleton';


const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear - 2, currentYear - 1, currentYear];
const DONUT_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#f97316', '#8b5cf6', '#ef4444', '#14b8a6', '#6366f1'];
const RUPEE_FORMATTER = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});


function formatCurrency(value) {
  return `₹${RUPEE_FORMATTER.format(Number(value || 0))}`;
}


function formatCompactCurrency(value) {
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


function TrendIcon({ trend }) {
  if (trend === 'up') {
    return <MdArrowUpward className="text-lg text-emerald-600 dark:text-emerald-400" />;
  }
  if (trend === 'down') {
    return <MdArrowDownward className="text-lg text-rose-600 dark:text-rose-400" />;
  }
  return <MdArrowForward className="text-lg text-slate-500 dark:text-slate-400" />;
}


function SortButton({ label, sortKey, sortState, onSort }) {
  const isActive = sortState.key === sortKey;
  const direction = isActive ? sortState.direction : null;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 transition ${
        isActive ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
      }`}
    >
      <span>{label}</span>
      <span className="text-xs">{direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕'}</span>
    </button>
  );
}


function StatsSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-800">
          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-8 w-28" />
            <SkeletonBlock className="h-4 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}


function TableSkeleton() {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-800">
      <div className="space-y-3">
        <SkeletonBlock className="h-5 w-44" />
        <SkeletonBlock className="h-4 w-72 max-w-full" />
        <SkeletonBlock className="mt-6 h-80 rounded-2xl" />
      </div>
    </div>
  );
}


function PanelSkeleton() {
  return (
    <div className="rounded-t-[28px] bg-white p-6 shadow-2xl dark:bg-slate-800">
      <div className="space-y-3">
        <SkeletonBlock className="h-5 w-56" />
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="mt-4 h-72 rounded-2xl" />
      </div>
    </div>
  );
}


function CategoryTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <p className="font-semibold text-slate-900 dark:text-white">{point.category}</p>
      <div className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
        <p>Revenue: {formatCurrency(point.revenue)}</p>
        <p>Share: {Number(point.pct_of_total || 0).toFixed(2)}%</p>
      </div>
    </div>
  );
}


function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const values = payload.reduce((accumulator, item) => {
    accumulator[item.dataKey] = item.value;
    return accumulator;
  }, {});

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <p className="font-semibold text-slate-900 dark:text-white">{label}</p>
      <div className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
        <p>Units Sold: {values.units_sold ?? 0}</p>
        <p>Revenue: {formatCurrency(values.revenue ?? 0)}</p>
      </div>
    </div>
  );
}


export default function SalesAnalysis() {
  const now = new Date();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [salesData, setSalesData] = useState(null);
  const [categoriesData, setCategoriesData] = useState({ categories: [], period: '' });
  const [trendData, setTrendData] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sortState, setSortState] = useState({ key: 'units_sold', direction: 'desc' });
  const [statsLoading, setStatsLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(false);
  const [salesError, setSalesError] = useState('');
  const [categoriesError, setCategoriesError] = useState('');
  const [trendError, setTrendError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadSales() {
      setStatsLoading(true);
      setTableLoading(true);
      setSalesError('');

      try {
        const response = await fetchMonthlySales(year, month);
        if (!active) {
          return;
        }
        setSalesData(response);
      } catch (error) {
        if (active) {
          setSalesError(getErrorMessage(error, 'Failed to load sales analysis'));
          setSalesData(null);
        }
      } finally {
        if (active) {
          setStatsLoading(false);
          setTableLoading(false);
        }
      }
    }

    loadSales();

    return () => {
      active = false;
    };
  }, [year, month]);

  useEffect(() => {
    let active = true;

    async function loadCategories() {
      setCategoriesLoading(true);
      setCategoriesError('');

      try {
        const response = await fetchSalesCategories(year, month);
        if (!active) {
          return;
        }
        setCategoriesData(response);
      } catch (error) {
        if (active) {
          setCategoriesError(getErrorMessage(error, 'Failed to load sales categories'));
          setCategoriesData({ categories: [], period: '' });
        }
      } finally {
        if (active) {
          setCategoriesLoading(false);
        }
      }
    }

    loadCategories();

    return () => {
      active = false;
    };
  }, [year, month]);

  useEffect(() => {
    let active = true;

    async function loadTrend() {
      if (!selectedProduct?.product_id) {
        setTrendData(null);
        setTrendError('');
        return;
      }

      setTrendLoading(true);
      setTrendError('');

      try {
        const response = await fetchProductTrend(selectedProduct.product_id, 6);
        if (!active) {
          return;
        }
        setTrendData(response);
      } catch (error) {
        if (active) {
          setTrendError(getErrorMessage(error, 'Failed to load product trend'));
          setTrendData(null);
        }
      } finally {
        if (active) {
          setTrendLoading(false);
        }
      }
    }

    loadTrend();

    return () => {
      active = false;
    };
  }, [selectedProduct]);

  const sortedProducts = useMemo(() => {
    const products = [...(salesData?.top_products ?? [])];
    const multiplier = sortState.direction === 'asc' ? 1 : -1;

    products.sort((left, right) => {
      if (sortState.key === 'units_sold') {
        return (left.units_sold - right.units_sold) * multiplier;
      }
      if (sortState.key === 'revenue') {
        return (left.revenue - right.revenue) * multiplier;
      }
      return 0;
    });

    return products;
  }, [salesData, sortState]);

  const trendChartData = useMemo(
    () =>
      (trendData?.trend_data ?? []).map((item) => ({
        ...item,
        label: `${item.month_name.slice(0, 3)} ${String(item.year).slice(-2)}`,
      })),
    [trendData],
  );

  const selectedMonthLabel = useMemo(
    () => MONTH_OPTIONS.find((option) => option.value === month)?.label ?? 'Selected month',
    [month],
  );

  const stats = useMemo(
    () => [
      {
        title: 'Products Moved',
        value: salesData?.total_products_sold ?? 0,
        subtitle: `${selectedMonthLabel} ${year}`,
        color: 'blue',
        icon: MdInventory2,
        trend: 'up',
      },
      {
        title: 'Total Units Sold',
        value: salesData?.total_units_moved ?? 0,
        subtitle: `Across ${salesData?.total_products_sold ?? 0} products`,
        color: 'orange',
        icon: MdInsights,
        trend: 'flat',
      },
      {
        title: 'Total Sales Revenue',
        value: {
          number: salesData?.top_products?.reduce((sum, item) => sum + Number(item.revenue || 0), 0) ?? 0,
          formatter: formatCurrency,
        },
        subtitle: salesData?.period ?? `${year}-${String(month).padStart(2, '0')}`,
        color: 'green',
        icon: MdPaid,
        trend: 'up',
      },
    ],
    [month, salesData, selectedMonthLabel, year],
  );

  const donutData = useMemo(
    () =>
      (categoriesData?.categories ?? []).map((item, index) => ({
        ...item,
        fill: DONUT_COLORS[index % DONUT_COLORS.length],
      })),
    [categoriesData],
  );

  const handleSort = (key) => {
    setSortState((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === 'desc' ? 'asc' : 'desc',
        };
      }
      return {
        key,
        direction: 'desc',
      };
    });
  };

  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
  };

  const totalRevenue = salesData?.top_products?.reduce((sum, item) => sum + Number(item.revenue || 0), 0) ?? 0;

  return (
    <div className="space-y-8 pb-40">
      <section className="rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900 px-6 py-7 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-emerald-200/80">Operations Revenue</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sales Analysis</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-200/80">
              Review best-selling products, revenue share by category, and product-level momentum over the last six months.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-[160px]">
              <span className="mb-2 block text-sm font-medium text-emerald-100">Month</span>
              <select
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
                className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white backdrop-blur transition focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              >
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className="text-slate-900">
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[140px]">
              <span className="mb-2 block text-sm font-medium text-emerald-100">Year</span>
              <select
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white backdrop-blur transition focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              >
                {YEAR_OPTIONS.map((option) => (
                  <option key={option} value={option} className="text-slate-900">
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {salesError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-sm dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
          {salesError}
        </div>
      ) : null}

      {statsLoading ? (
        <StatsSkeleton />
      ) : (
        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((card) => (
            <StatCard key={card.title} {...card} />
          ))}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        {tableLoading ? (
          <TableSkeleton />
        ) : (
          <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-800">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Top Selling Products</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Ranked by units sold for {selectedMonthLabel} {year}.
                </p>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Revenue tracked: {formatCurrency(totalRevenue)}</p>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Rank</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Product Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">SKU</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Category</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        <SortButton label="Units Sold" sortKey="units_sold" sortState={sortState} onSort={handleSort} />
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        <SortButton label="Revenue" sortKey="revenue" sortState={sortState} onSort={handleSort} />
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                    {sortedProducts.length ? (
                      sortedProducts.map((product) => (
                        <tr
                          key={product.product_id}
                          onClick={() => handleSelectProduct(product)}
                          className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-700/30 ${
                            product.rank === 1 ? 'border-l-4 border-amber-400 bg-amber-50/30 dark:bg-amber-500/5' : ''
                          } ${
                            selectedProduct?.product_id === product.product_id ? 'bg-sky-50/70 dark:bg-sky-500/10' : ''
                          }`}
                        >
                          <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-900 dark:text-white">{product.rank}</td>
                          <td className="px-4 py-4 text-sm font-medium text-slate-900 dark:text-white">{product.name}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600 dark:text-slate-300">{product.sku}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600 dark:text-slate-300">{product.category}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600 dark:text-slate-300">{product.units_sold}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-medium text-slate-900 dark:text-white">{formatCurrency(product.revenue)}</td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                              <TrendIcon trend={product.trend} />
                              <span className="capitalize">{product.trend}</span>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                          No product sales recorded for this month.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {categoriesLoading ? (
          <TableSkeleton />
        ) : (
          <section className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-800">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Category Breakdown</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Revenue share by category for {selectedMonthLabel} {year}.
              </p>
            </div>

            {categoriesError ? (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
                {categoriesError}
              </div>
            ) : donutData.length ? (
              <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_220px] lg:items-center">
                <div className="min-h-[300px] h-[40vh] max-h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="revenue"
                        nameKey="category"
                        innerRadius={72}
                        outerRadius={112}
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {donutData.map((entry, index) => (
                          <Cell key={`${entry.category}-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<CategoryTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3">
                  {donutData.map((item, index) => (
                    <div key={item.category} className="flex items-start gap-3">
                      <span
                        className="mt-1 h-3 w-3 rounded-full"
                        style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{item.category}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatCurrency(item.revenue)} · {Number(item.pct_of_total || 0).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-12 text-center text-sm text-slate-500 dark:bg-slate-700/30 dark:text-slate-400">
                No category sales data available for this period.
              </div>
            )}
          </section>
        )}
      </div>

      <div
        className={`fixed inset-x-0 bottom-0 z-30 transition-transform duration-300 ease-out ${
          selectedProduct ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {selectedProduct ? (
          trendLoading ? (
            <PanelSkeleton />
          ) : (
            <section className="mx-auto max-w-7xl rounded-t-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Trend Analysis</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                    {selectedProduct.name} - Last 6 Months
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    SKU {selectedProduct.sku} · {selectedProduct.category}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50"
                >
                  <MdClose className="mr-2 text-lg" />
                  Close
                </button>
              </div>

              {trendError ? (
                <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
                  {trendError}
                </div>
              ) : trendChartData.length ? (
                <div className="mt-6 min-h-[320px] h-[50vh] max-h-[500px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChartData} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="#cbd5e1" strokeOpacity={0.35} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis
                        yAxisId="units"
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        width={56}
                      />
                      <YAxis
                        yAxisId="revenue"
                        orientation="right"
                        tickFormatter={formatCompactCurrency}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        width={84}
                      />
                      <Tooltip content={<TrendTooltip />} />
                      <Legend verticalAlign="top" height={36} />
                      <Line
                        yAxisId="units"
                        type="monotone"
                        dataKey="units_sold"
                        name="Units Sold"
                        stroke="#0ea5e9"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        yAxisId="revenue"
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-12 text-center text-sm text-slate-500 dark:bg-slate-700/30 dark:text-slate-400">
                  No trend data available for this product.
                </div>
              )}
            </section>
          )
        ) : null}
      </div>
    </div>
  );
}
