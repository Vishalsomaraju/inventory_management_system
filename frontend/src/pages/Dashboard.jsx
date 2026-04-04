import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchDashboard = async () => {
      try {
        const [dashboardRes, insightsRes] = await Promise.all([
          api.get('/analytics/dashboard'),
          api.get('/ai/insights').catch(() => ({ data: { insights: [] } })),
        ]);
        if (mounted) {
          setData(dashboardRes.data);
          setInsights(Array.isArray(insightsRes.data?.insights) ? insightsRes.data.insights : []);
          setInsightsLoading(false);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError('Failed to load dashboard data.');
          setInsightsLoading(false);
          setLoading(false);
        }
      }
    };
    fetchDashboard();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-8 bg-gray-300 rounded w-1/3"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-white rounded-xl shadow-sm h-64 border border-gray-100 animate-pulse"></div>
          <div className="bg-white rounded-xl shadow-sm h-64 border border-gray-100 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
        {error}
      </div>
    );
  }

  // Fallbacks using optional chaining or logical OR to avoid crashes
  const stats = {
    total_products: data?.total_products || 0,
    low_stock_count: data?.low_stock_count || 0,
    open_purchase_orders: data?.open_purchase_orders || 0,
    pending_alerts: data?.pending_alerts || 0,
  };
  const recentTransactions = data?.recent_transactions || [];
  const stockByCategory = data?.stock_value_by_category || [];
  const insightStyles = {
    warning: {
      card: 'border-amber-300 bg-amber-50/70',
      icon: 'text-amber-600 bg-amber-100',
      button: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
    },
    suggestion: {
      card: 'border-blue-300 bg-blue-50/70',
      icon: 'text-blue-600 bg-blue-100',
      button: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
    },
    info: {
      card: 'border-gray-300 bg-gray-50',
      icon: 'text-gray-600 bg-gray-200',
      button: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    },
  };

  return (
    <div className="space-y-6">
      {stats.low_stock_count > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg flex items-center justify-between shadow-sm">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-amber-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>
              <h3 className="text-sm font-medium text-amber-800">
                Low Stock Alert
              </h3>
              <p className="text-sm text-amber-700 mt-1">
                You have {stats.low_stock_count} items running critically low.
              </p>
            </div>
          </div>
          <Link
            to="/inventory?filter=low_stock"
            className="text-sm font-semibold text-amber-800 hover:text-amber-900 bg-amber-100 px-4 py-2 rounded-lg transition-colors"
          >
            View all
          </Link>
        </div>
      )}

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Products */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center">
          <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Products</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total_products}</p>
          </div>
        </div>

        {/* Low Stock Items */}
        <Link to="/inventory?filter=low_stock" className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center hover:shadow-md transition-shadow group">
          <div className={`p-3 rounded-full mr-4 transition-colors ${stats.low_stock_count > 0 ? 'bg-amber-100 text-amber-600 group-hover:bg-amber-200' : 'bg-gray-100 text-gray-500'}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Low Stock Items</p>
            <p className={`text-2xl font-bold ${stats.low_stock_count > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{stats.low_stock_count}</p>
          </div>
        </Link>

        {/* Open Purchase Orders */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center">
          <div className="p-3 rounded-full bg-purple-100 text-purple-600 mr-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Open POs</p>
            <p className="text-2xl font-bold text-gray-900">{stats.open_purchase_orders}</p>
          </div>
        </div>

        {/* Pending Alerts */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center">
          <div className={`p-3 rounded-full mr-4 ${stats.pending_alerts > 0 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-green-100 text-green-600'}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Pending Alerts</p>
            <p className={`text-2xl font-bold ${stats.pending_alerts > 0 ? 'text-red-600' : 'text-gray-900'}`}>{stats.pending_alerts}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">AI Insights</h2>
            <p className="text-sm text-gray-500">Machine-generated recommendations from your current inventory snapshot.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Powered by Claude
          </div>
        </div>
        <div className="p-6">
          {insightsLoading ? (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="rounded-xl border border-gray-200 bg-gray-50 p-5 animate-pulse">
                  <div className="h-4 w-24 rounded bg-gray-200 mb-3"></div>
                  <div className="h-3 w-full rounded bg-gray-200 mb-2"></div>
                  <div className="h-3 w-4/5 rounded bg-gray-200"></div>
                </div>
              ))}
            </div>
          ) : insights.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {insights.map((insight, index) => {
                const style = insightStyles[insight.type] || insightStyles.info;
                return (
                  <div key={`${insight.title || 'insight'}-${index}`} className={`rounded-xl border p-5 shadow-sm flex flex-col gap-4 ${style.card}`}>
                    <div className="flex items-start gap-3">
                      <div className={`rounded-full p-2 ${style.icon}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-gray-900">{insight.title || 'Insight'}</h3>
                        <p className="mt-1 text-sm text-gray-700">{insight.message || 'No additional detail provided.'}</p>
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                      {insight.action_label && insight.action_route ? (
                        <button
                          type="button"
                          onClick={() => navigate(insight.action_route)}
                          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${style.button}`}
                        >
                          {insight.action_label}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">No action</span>
                      )}
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-gray-600">
                        <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                        Powered by Claude
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
              No AI insights are available right now.
            </div>
          )}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity Table */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">Recent Activity</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Product</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentTransactions.length > 0 ? (
                  recentTransactions.map((tx, idx) => (
                    <tr key={tx.id || idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(tx.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {tx.product_name}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          tx.type.toLowerCase() === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {tx.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-900 font-medium">
                        {tx.type.toLowerCase() === 'in' ? '+' : '-'}{tx.quantity}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                      No recent activity found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stock by Category Chart */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">Stock by Category</h2>
          </div>
          <div className="p-6">
            {stockByCategory.length > 0 ? (
              <div className="space-y-4">
                {stockByCategory.map((cat, idx) => {
                  // Find the max count to scale the bars
                  const maxCount = Math.max(...stockByCategory.map(c => c.count || 1));
                  const percentage = Math.min((cat.count / maxCount) * 100, 100);
                  return (
                    <div key={idx}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{cat.category}</span>
                        <span className="text-gray-500">{cat.count} items</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div 
                          className="bg-blue-500 h-2.5 rounded-full" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No category data available.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
