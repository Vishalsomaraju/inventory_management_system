import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../api/axios';

// Generic SVGs for cards
const Icons = {
  products: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>,
  lowStock: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
  outStock: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>,
  po: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
  alerts: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>,
  revenue: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
};

const StatCard = ({ title, value, subtitle, icon }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex items-start justify-between">
    <div>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{title}</p>
      <h3 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{value}</h3>
      {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 font-medium">{subtitle}</p>}
    </div>
    <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg shrink-0">
      {icon}
    </div>
  </div>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/analytics/dashboard-summary', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err) {
        console.error("Error fetching dashboard summary", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin"></div>
      </div>
    );
  }

  if (!data) return null;

  const { inventory, orders, alerts, sales_today, top_movers_7d } = data;

  const handleOpenAI = () => {
    window.dispatchEvent(new CustomEvent('open-ai-assistant'));
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      
      {/* Alert Banner / Dead Stock Warning */}
      {inventory.dead_stock_count > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 text-amber-800 dark:text-amber-300">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <p className="font-medium text-sm">
              <span className="font-bold">{inventory.dead_stock_count} products</span> are dead stock — last moved 30+ days ago.
            </p>
          </div>
          <button 
            onClick={() => navigate('/stock-health')}
            className="px-4 py-1.5 shrink-0 bg-amber-100 hover:bg-amber-200 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-800 dark:text-amber-100 text-sm font-semibold rounded-lg transition-colors border border-amber-200 dark:border-amber-700"
          >
            View in Stock Health
          </button>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard 
          title="Total Products" 
          value={inventory.total_products} 
          subtitle={`₹${inventory.total_stock_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})} total stock value`}
          icon={Icons.products} 
        />
        <StatCard 
          title="Low Stock" 
          value={inventory.low_stock_count} 
          subtitle="Items at or below reorder level"
          icon={Icons.lowStock} 
        />
        <StatCard 
          title="Out of Stock" 
          value={inventory.out_of_stock_count} 
          subtitle="Requires immediate attention"
          icon={Icons.outStock} 
        />
        <StatCard 
          title="Pending POs" 
          value={orders.pending_pos} 
          subtitle={`₹${orders.pending_po_value.toLocaleString()} pending value`}
          icon={Icons.po} 
        />
        <StatCard 
          title="Active Alerts" 
          value={alerts.active_alerts} 
          subtitle={`${alerts.resolved_today} resolved today`}
          icon={Icons.alerts} 
        />
        <StatCard 
          title="Today's Revenue" 
          value={`₹${sales_today.revenue.toLocaleString()}`} 
          subtitle={`${sales_today.units_out} units shipped out`}
          icon={Icons.revenue} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Top Movers Chart */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 lg:col-span-2 flex flex-col">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Top Moving Products <span className="text-sm font-normal text-slate-500 border ml-2 border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">(7 Days)</span></h2>
          <div className="flex-1 w-full h-[300px]">
            {top_movers_7d.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top_movers_7d} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#64748b' }} />
                  <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }}
                    formatter={(val) => [`${val} units`, 'Units Out']}
                  />
                  <Bar dataKey="units_out" radius={[0, 4, 4, 0]} barSize={24}>
                    {top_movers_7d.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : '#93c5fd'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">No sales data for the last 7 days.</div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Quick Actions</h2>
          
          <button 
            onClick={() => navigate('/reorder')}
            className="group flex items-center justify-between p-5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 border border-transparent"
          >
            <div className="flex flex-col items-start gap-1">
              <span className="text-white font-bold text-lg leading-tight group-hover:underline decoration-white/50 underline-offset-4">Run Auto-Reorder</span>
              <span className="text-blue-100 text-sm font-medium">Draft POs for low stock</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
               <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white transform group-hover:translate-x-1 transition-transform"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </div>
          </button>

          <button 
            onClick={() => navigate('/forecast')}
            className="group flex items-center justify-between p-5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl shadow-sm hover:shadow transition-all border border-slate-200 dark:border-slate-700"
          >
            <div className="flex flex-col items-start gap-1">
              <span className="text-slate-900 dark:text-white font-bold text-lg leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">View Demand Forecast</span>
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">LSTM 30-day predictions</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-800">
               <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 dark:text-slate-400 group-hover:text-blue-600 transition-colors"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
            </div>
          </button>

          <button 
            onClick={handleOpenAI}
            className="group flex items-center justify-between p-5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl shadow-sm hover:shadow transition-all border border-slate-200 dark:border-slate-700"
          >
            <div className="flex flex-col items-start gap-1">
              <span className="text-slate-900 dark:text-white font-bold text-lg leading-tight flex items-center gap-2">
                Ask AI Assistant <span className="text-amber-500 text-xs tracking-wider uppercase font-bold animate-pulse">✦</span>
              </span>
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Data-driven procurement insights</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-800">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 transition-colors group-hover:scale-110 duration-200"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /><path d="M21 16l2-2" /><path d="M1 16l-2-2" /></svg>
            </div>
          </button>

        </div>
      </div>

    </div>
  );
}
