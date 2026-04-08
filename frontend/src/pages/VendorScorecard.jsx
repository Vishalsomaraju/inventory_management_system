import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fetchAllScorecards, fetchVendorScorecard, fetchVendorPriceHistory } from '../api/vendors';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

const CircleProgress = ({ score, colorClass }) => {
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const [offsetState, setOffsetState] = useState(circumference);
  
  useEffect(() => {
    // Small delay to allow the CSS transition to play on mount
    const timer = setTimeout(() => {
      setOffsetState(circumference - (score / 100) * circumference);
    }, 100);
    return () => clearTimeout(timer);
  }, [score, circumference]);

  return (
    <svg className="w-24 h-24 transform -rotate-90 shrink-0">
      <circle
        className="text-gray-100 dark:text-gray-700"
        strokeWidth="8"
        stroke="currentColor"
        fill="transparent"
        r={radius}
        cx="48"
        cy="48"
      />
      <circle
        className={`transition-all duration-1000 ease-out ${colorClass}`}
        strokeWidth="8"
        strokeDasharray={circumference}
        strokeDashoffset={offsetState}
        strokeLinecap="round"
        stroke="currentColor"
        fill="transparent"
        r={radius}
        cx="48"
        cy="48"
      />
    </svg>
  );
};

const ProgressBar = ({ label, value, colorClass }) => {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setWidth(value);
    }, 150);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between items-center mb-1 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="font-bold text-gray-900 dark:text-gray-100">{value}%</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 relative overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-1000 ease-out ${colorClass}`}
          style={{ width: `${width}%` }}
        ></div>
      </div>
    </div>
  );
};

const getGradeConfig = (grade) => {
  switch (grade?.toUpperCase()) {
    case 'A': return { badge: 'bg-green-100 text-green-800 shadow-green-400/50 shadow-md', ring: 'text-green-500', bar: 'bg-green-500' };
    case 'B': return { badge: 'bg-teal-100 text-teal-800 shadow-teal-400/50 shadow-md', ring: 'text-teal-500', bar: 'bg-teal-500' };
    case 'C': return { badge: 'bg-yellow-100 text-yellow-800 shadow-yellow-400/50 shadow-md', ring: 'text-yellow-500', bar: 'bg-yellow-500' };
    case 'D': return { badge: 'bg-orange-100 text-orange-800 shadow-orange-400/50 shadow-md', ring: 'text-orange-500', bar: 'bg-orange-500' };
    case 'F': return { badge: 'bg-red-100 text-red-800 shadow-red-400/50 shadow-md', ring: 'text-red-500', bar: 'bg-red-500' };
    default: return { badge: 'bg-gray-100 text-gray-800 shadow-gray-400/50 shadow-sm', ring: 'text-gray-500', bar: 'bg-gray-500' };
  }
};

export default function VendorScorecard() {
  const [scorecards, setScorecards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVendorId, setSelectedVendorId] = useState(null);
  
  // Drawer state
  const [detailData, setDetailData] = useState(null);
  const [priceHistory, setPriceHistory] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchAllScorecards()
      .then(data => setScorecards(data))
      .catch(err => console.error("Failed to load scorecards", err))
      .finally(() => setLoading(false));
  }, []);

  const openDrawer = (vendorId) => {
    setSelectedVendorId(vendorId);
    setDetailLoading(true);
    
    Promise.all([
      fetchVendorScorecard(vendorId),
      fetchVendorPriceHistory(vendorId)
    ])
    .then(([scorecard, history]) => {
      setDetailData(scorecard);
      
      // Pivot price history for Recharts
      const byDate = {};
      const productSet = new Set();
      
      if (Array.isArray(history)) {
        history.forEach(item => {
          const date = item.date || item.created_at || 'Unknown';
          const productName = item.product_name || 'Generic Product';
          if (!byDate[date]) byDate[date] = { date };
          byDate[date][productName] = item.unit_price || 0;
          productSet.add(productName);
        });
      }
      
      setPriceHistory({
        data: Object.values(byDate).sort((a,b) => new Date(a.date) - new Date(b.date)),
        products: Array.from(productSet)
      });
    })
    .catch(err => console.error("Failed to load vendor details", err))
    .finally(() => setDetailLoading(false));
  };

  const closeDrawer = () => {
    setSelectedVendorId(null);
    setTimeout(() => {
      setDetailData(null);
      setPriceHistory(null);
    }, 300); // clear after slide out animation
  };

  return (
    <div className="p-6 max-w-7xl mx-auto relative min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Vendor Performance Scorecards</h1>
      
      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : scorecards.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No Vendor Scorecards available yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {scorecards.map(vendor => {
            const gConfig = getGradeConfig(vendor.grade);
            const metrics = vendor.metrics || {};
            
            return (
              <div key={vendor.vendor_id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col hover:shadow-md transition-shadow">
                
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{vendor.vendor_name}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Vendor ID: {vendor.vendor_id}</p>
                  </div>
                  <span className={`px-4 py-1.5 rounded-lg text-lg font-bold ${gConfig.badge}`}>
                    {vendor.grade ? vendor.grade.toUpperCase() : 'N/A'}
                  </span>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-8 mb-6">
                  <div className="relative flex items-center justify-center">
                    <CircleProgress score={vendor.overall_score || 0} colorClass={gConfig.ring} />
                    <div className="absolute flex flex-col items-center">
                      <span className="text-3xl font-black text-gray-900 dark:text-white">
                        {vendor.overall_score !== undefined ? Number(vendor.overall_score).toFixed(1) : 0}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex-1 w-full space-y-4">
                    <ProgressBar label="On-Time Delivery" value={metrics.on_time_delivery || 0} colorClass={gConfig.bar} />
                    <ProgressBar label="Price Consistency" value={metrics.price_consistency || 0} colorClass={gConfig.bar} />
                    <ProgressBar label="Stock Reliability" value={metrics.stock_reliability || 0} colorClass={gConfig.bar} />
                  </div>
                </div>
                
                <hr className="border-gray-100 dark:border-gray-700 my-4" />
                
                <div className="flex justify-between items-center mt-auto">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium text-gray-900 dark:text-white">{vendor.purchase_orders_count || 0}</span> purchase orders
                    <span className="mx-2">&middot;</span>
                    <span className="font-medium text-gray-900 dark:text-white">₹{(vendor.total_spend || 0).toLocaleString()}</span> total spend
                  </div>
                  <button 
                    onClick={() => openDrawer(vendor.vendor_id)}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40"
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drawer Overlay Backdrop */}
      {selectedVendorId && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 transition-opacity backdrop-blur-sm"
          onClick={closeDrawer}
        />
      )}

      {/* Slide-in Detail Drawer */}
      <div 
        className={`fixed top-0 right-0 h-full w-full max-w-[400px] bg-white dark:bg-gray-800 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 overflow-y-auto ${selectedVendorId ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Vendor Details</h2>
            <button 
              onClick={closeDrawer}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <FiX className="w-6 h-6" />
            </button>
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center p-12">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : detailData ? (
            <div className="space-y-8 animate-fade-in">
              <div className="flex items-center mb-6 gap-4">
                <span className={`px-4 py-2 rounded-lg text-xl font-bold ${getGradeConfig(detailData.grade).badge}`}>
                  Grade {detailData.grade?.toUpperCase() || 'N/A'}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{detailData.vendor_name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Breakdown & History</p>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-100 dark:border-gray-700 shadow-inner">
                <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wider text-xs">Performance Breakdown</h4>
                <div className="space-y-4">
                  <ProgressBar label="On-Time Delivery" value={detailData.metrics?.on_time_delivery || 0} colorClass={getGradeConfig(detailData.grade).bar} />
                  <ProgressBar label="Price Consistency" value={detailData.metrics?.price_consistency || 0} colorClass={getGradeConfig(detailData.grade).bar} />
                  <ProgressBar label="Stock Reliability" value={detailData.metrics?.stock_reliability || 0} colorClass={getGradeConfig(detailData.grade).bar} />
                  {detailData.metrics?.quality_rating && (
                     <ProgressBar label="Quality Rating" value={detailData.metrics.quality_rating} colorClass={getGradeConfig(detailData.grade).bar} />
                  )}
                  {detailData.metrics?.communication && (
                     <ProgressBar label="Communication" value={detailData.metrics.communication} colorClass={getGradeConfig(detailData.grade).bar} />
                  )}
                </div>
                
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 flex justify-between">
                   <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Total Spend</p>
                      <p className="font-bold text-gray-900 dark:text-white text-lg">₹{(detailData.total_spend || 0).toLocaleString()}</p>
                   </div>
                   <div className="text-right">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Active Orders</p>
                      <p className="font-bold text-gray-900 dark:text-white text-lg">{detailData.purchase_orders_count || 0}</p>
                   </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wider text-xs">Price History (Unit Price)</h4>
                {priceHistory && priceHistory.data.length > 0 ? (
                  <div className="h-64 mt-4 w-full bg-white dark:bg-gray-800 overflow-hidden text-sm">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={priceHistory.data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.2} />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fill: '#6b7280', fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          tick={{ fill: '#6b7280', fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(val) => `₹${val}`}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1f2937', color: '#fff', border: 'none', borderRadius: '0.5rem', fontSize: '0.875rem' }}
                          formatter={(value) => [`₹${value}`, undefined]}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem', paddingTop: '10px' }} />
                        {priceHistory.products.map((product, idx) => (
                          <Line 
                            key={product}
                            type="monotone" 
                            dataKey={product} 
                            stroke={COLORS[idx % COLORS.length]} 
                            strokeWidth={2}
                            dot={{ r: 3, strokeWidth: 2 }}
                            activeDot={{ r: 5 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-center">
                    No price history data available for this vendor.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 dark:text-gray-400 text-center">
              Failed to load details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
