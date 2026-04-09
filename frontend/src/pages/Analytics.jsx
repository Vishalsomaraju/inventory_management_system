import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import api from "../lib/api";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#64748b",
];

const Analytics = () => {
  const [stockMovement, setStockMovement] = useState({
    data: [],
    loading: true,
  });
  const [poSummary, setPoSummary] = useState({ data: [], loading: true });
  const [topProducts, setTopProducts] = useState({ data: [], loading: true });
  const [lowStock, setLowStock] = useState({ data: [], loading: true });
  const [daysMoved, setDaysMoved] = useState(30);

  const fetchStockMovement = async (days) => {
    setStockMovement((p) => ({ ...p, loading: true }));
    try {
      const res = await api.get(`/analytics/stock-movement?days=${days}`);
      setStockMovement({
        data: Array.isArray(res.data) ? res.data : res.data.data || [],
        loading: false,
      });
    } catch {
      setStockMovement({ data: [], loading: false });
    }
  };

  const fetchPoSummary = async () => {
    setPoSummary((p) => ({ ...p, loading: true }));
    try {
      const res = await api.get("/analytics/po-summary");
      // expecting format { by_status: [{ name: 'Draft', value: 12 }, ...]}
      setPoSummary({
        data: res.data.by_status || res.data || [],
        loading: false,
      });
    } catch {
      setPoSummary({ data: [], loading: false });
    }
  };

  const fetchTopProducts = async () => {
    setTopProducts((p) => ({ ...p, loading: true }));
    try {
      const res = await api.get("/analytics/top-products?by=stock_out");
      setTopProducts({ data: res.data || [], loading: false });
    } catch {
      setTopProducts({ data: [], loading: false });
    }
  };

  const fetchLowStock = async () => {
    setLowStock((p) => ({ ...p, loading: true }));
    try {
      const res = await api.get("/analytics/low-stock");
      setLowStock({ data: res.data || [], loading: false });
    } catch {
      setLowStock({ data: [], loading: false });
    }
  };

  useEffect(() => {
    fetchStockMovement(daysMoved);
  }, [daysMoved]);

  useEffect(() => {
    fetchPoSummary();
    fetchTopProducts();
    fetchLowStock();
  }, []);

  const ChartCard = ({
    title,
    subtitle,
    onRefresh,
    loading,
    children,
    headerRight,
  }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
      <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
        <div>
          <h3 className="font-bold text-gray-800">{title}</h3>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {headerRight}
          <button
            onClick={onRefresh}
            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md transition-colors"
            title="Refresh"
          >
            <svg
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="p-6 flex-1 min-h-[300px] relative flex justify-center items-center">
        {loading && (
          <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center animate-pulse">
            <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
          </div>
        )}
        {children}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <h2 className="text-xl font-bold text-gray-800">Advanced Analytics</h2>
        <p className="text-sm text-gray-500">
          Real-time metrics from the analytics engine
        </p>
      </div>

      {/* Grid containing charts and tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Stock Movement Line Chart */}
        <ChartCard
          title="Stock Movement"
          subtitle="Inbound vs Outbound tracking"
          loading={stockMovement.loading}
          onRefresh={() => fetchStockMovement(daysMoved)}
          headerRight={
            <div className="flex bg-white rounded border border-gray-200 p-0.5 shadow-sm text-xs font-medium">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDaysMoved(d)}
                  className={`px-3 py-1 rounded-sm transition-colors ${daysMoved === d ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  {d}d
                </button>
              ))}
            </div>
          }
        >
          {stockMovement.data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={stockMovement.data}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#eee"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                <Line
                  type="monotone"
                  dataKey="total_in"
                  name="Stock In"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  strokeLinecap="round"
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="total_out"
                  name="Stock Out"
                  stroke="#ef4444"
                  strokeWidth={3}
                  strokeLinecap="round"
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Net Change"
                  stroke="#94a3b8"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400">No stock movement data.</p>
          )}
        </ChartCard>

        {/* Card 2: PO Status Pie Chart */}
        <ChartCard
          title="PO Status Overview"
          subtitle="Breakdown of Purchase Orders"
          loading={poSummary.loading}
          onRefresh={fetchPoSummary}
        >
          {poSummary.data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={poSummary.data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {poSummary.data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: "12px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400">No PO data available.</p>
          )}
        </ChartCard>

        {/* Card 3: Top Products Bar Chart */}
        <ChartCard
          title="Top Products (Stock Out)"
          subtitle="Highest volume leaving inventory"
          loading={topProducts.loading}
          onRefresh={fetchTopProducts}
        >
          {topProducts.data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topProducts.data}
                layout="vertical"
                margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="#eee"
                />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis
                  dataKey="product_name"
                  type="category"
                  width={100}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <Tooltip
                  cursor={{ fill: "#f1f5f9" }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Bar
                  dataKey="quantity"
                  name="Quantity Out"
                  fill="#3b82f6"
                  radius={[0, 4, 4, 0]}
                >
                  {topProducts.data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400">No product data available.</p>
          )}
        </ChartCard>

        {/* Card 4: Low Stock Table */}
        <ChartCard
          title="Critical Low Stock"
          subtitle="Immediate attention required"
          loading={lowStock.loading}
          onRefresh={fetchLowStock}
        >
          <div className="h-full overflow-y-auto w-full absolute inset-0">
            {lowStock.data.length > 0 ? (
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-gray-50/90 backdrop-blur sticky top-0 border-b border-gray-100 text-gray-600 font-semibold shadow-sm z-10">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Product</th>
                    <th className="py-2.5 px-4 text-center font-semibold">
                      Stock
                    </th>
                    <th className="py-2.5 px-4 text-center font-semibold">
                      Deficit
                    </th>
                    <th className="py-2.5 px-4 font-semibold text-right">
                      Vendor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lowStock.data.map((item, i) => {
                    const deficit = item.reorder_level - item.current_stock;
                    return (
                      <tr key={item.id || i} className="hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-800">
                          {item.name}
                        </td>
                        <td className="py-3 px-4 text-center text-red-600 font-bold bg-red-50/50">
                          {item.current_stock}{" "}
                          <span className="font-normal text-xs text-red-400">
                            {item.unit}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-amber-600 font-bold bg-amber-50/50">
                          -{deficit > 0 ? deficit : 0}
                        </td>
                        <td className="py-3 px-4 text-gray-500 text-right truncate max-w-[100px]">
                          {item.vendor?.name || item.vendor_id || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex justify-center items-center h-full text-gray-400">
                All stock is sufficient.
              </div>
            )}
          </div>
        </ChartCard>
      </div>
    </div>
  );
};

export default Analytics;
