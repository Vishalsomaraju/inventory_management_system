import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import api from '../api/axios';
import LoadingSpinner from '../components/LoadingSpinner';


function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.detail || fallback;
}


const statCards = [
  { key: 'total_products', label: 'Total Products', accent: 'bg-sky-100 text-sky-700' },
  { key: 'low_stock_count', label: 'Low Stock', accent: 'bg-amber-100 text-amber-700' },
  { key: 'active_alerts', label: 'Active Alerts', accent: 'bg-rose-100 text-rose-700' },
  { key: 'pending_orders', label: 'Pending Orders', accent: 'bg-indigo-100 text-indigo-700' },
  { key: 'total_vendors', label: 'Total Vendors', accent: 'bg-emerald-100 text-emerald-700' },
];


export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [stockMovements, setStockMovements] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError('');
      try {
        const [dashboardResponse, movementsResponse, topProductsResponse] = await Promise.all([
          api.get('/analytics/dashboard'),
          api.get('/analytics/stock-movements'),
          api.get('/analytics/top-products'),
        ]);

        if (!active) {
          return;
        }

        setDashboard(dashboardResponse.data);
        setStockMovements(movementsResponse.data);
        setTopProducts(topProductsResponse.data);
      } catch (loadError) {
        if (active) {
          setError(getErrorMessage(loadError, 'Failed to load dashboard data'));
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
  }, []);

  const topProductChartData = useMemo(
    () => topProducts.map((item) => ({ ...item, label: `${item.product_name} (${item.sku})` })),
    [topProducts],
  );

  if (loading) {
    return <LoadingSpinner label="Loading dashboard..." />;
  }

  if (error) {
    return <div className="rounded-2xl bg-rose-50 px-6 py-5 text-sm font-medium text-rose-700">{error}</div>;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {statCards.map((card) => (
          <div key={card.key} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className={`inline-flex rounded-xl px-3 py-2 text-sm font-semibold ${card.accent}`}>
              {card.label.slice(0, 2)}
            </div>
            <p className="mt-5 text-3xl font-bold text-slate-900">{dashboard?.[card.key] ?? 0}</p>
            <p className="mt-2 text-sm text-slate-500">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900">Stock Movements</h2>
            <p className="text-sm text-slate-500">Daily IN and OUT quantities across the last 30 days.</p>
          </div>
          {stockMovements.length ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stockMovements}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="in_quantity" stroke="#16a34a" fill="#bbf7d0" />
                  <Area type="monotone" dataKey="out_quantity" stroke="#dc2626" fill="#fecaca" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">No stock movement data yet.</p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900">Top Products by Usage</h2>
            <p className="text-sm text-slate-500">Top 10 products by OUT quantity in the last 90 days.</p>
          </div>
          {topProductChartData.length ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProductChartData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="sku"
                    width={90}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                  />
                  <Tooltip />
                  <Bar dataKey="total_out" fill="#0284c7" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">No usage data yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
