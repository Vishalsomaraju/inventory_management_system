import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchStockHealth, fetchStockHealthTimeline } from '../api/analytics';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { FiX, FiAlertTriangle, FiCheckCircle, FiActivity, FiArchive, FiInfo } from 'react-icons/fi';

const HEALTH_COLORS = {
  healthy: { bg: '#22c55e', text: 'text-green-600', fill: '#22c55e', label: 'Healthy', icon: FiCheckCircle },
  warning: { bg: '#f59e0b', text: 'text-amber-500', fill: '#f59e0b', label: 'Warning', icon: FiAlertTriangle },
  critical: { bg: '#ef4444', text: 'text-red-500', fill: '#ef4444', label: 'Critical', icon: FiActivity },
  out_of_stock: { bg: '#1a1a1a', text: 'text-gray-900', fill: '#1a1a1a', label: 'Out of Stock', icon: FiX },
  dead_stock: { bg: '#9333ea', text: 'text-purple-600', fill: '#9333ea', label: 'Dead Stock', icon: FiArchive }
};

export default function StockHealth() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [timelineDays, setTimelineDays] = useState(30);
  const [loading, setLoading] = useState(true);
  
  const [selectedStatuses, setSelectedStatuses] = useState({
    healthy: true,
    warning: true,
    critical: true,
    out_of_stock: true,
    dead_stock: true
  });
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [mockHistory, setMockHistory] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadTimeline();
  }, [timelineDays]);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await fetchStockHealth();
      setData(result);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadTimeline = async () => {
    try {
      const result = await fetchStockHealthTimeline(timelineDays);
      setTimeline(result.timeline);
    } catch (error) {
      console.error(error);
    }
  };

  const currentSummary = data?.summary || { healthy: 0, warning: 0, critical: 0, out_of_stock: 0, dead_stock: 0, total: 0 };
  
  const toggleStatus = (status) => {
    setSelectedStatuses(prev => ({
      ...prev,
      [status]: !prev[status]
    }));
  };

  const visibleProducts = useMemo(() => {
    if (!data?.products) return [];
    return data.products.filter(p => selectedStatuses[p.health_status]);
  }, [data, selectedStatuses]);

  const getCellBackground = (product) => {
    const status = product.health_status;
    if (status === 'healthy') {
      const opacity = Math.min(1, Math.max(0.4, product.stock_ratio / 5));
      return `rgba(34, 197, 94, ${opacity})`;
    }
    return HEALTH_COLORS[status]?.bg || '#9ca3af';
  };

  const handleCellClick = (product) => {
    setSelectedProduct(product);
    // Mock history since backend doesn't provide individual product per-day breakdown
    setMockHistory(Array.from({length: 30}, (_, i) => ({
      day: i + 1,
      IN: Math.floor(Math.random() * 15),
      OUT: Math.floor(Math.random() * 20)
    })));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen relative flex overflow-hidden">
      
      {/* Main Content Area */}
      <div className={`flex-1 transition-all duration-300 ${selectedProduct ? 'mr-[320px]' : ''}`}>
        
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Stock Health Monitor</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Real-time inventory distribution and AI anomaly tracking</p>
        </header>

        {/* Summary Strip (Clickable Filters) */}
        {!loading && data && (
          <div className="flex flex-wrap gap-4 mb-8">
            {Object.keys(HEALTH_COLORS).map(status => {
              const info = HEALTH_COLORS[status];
              const Icon = info.icon;
              const isActive = selectedStatuses[status];
              const count = currentSummary[status] || 0;
              
              return (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all shadow-sm
                    ${isActive 
                      ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900' 
                      : 'bg-gray-50 dark:bg-gray-900 border-transparent opacity-60 hover:opacity-100 grayscale hover:grayscale-0'
                    }`}
                >
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: info.bg }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{info.label}</div>
                    <div className="text-xl font-black text-gray-900 dark:text-white leading-none mt-1">{count}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Heatmap Grid */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8 min-h-[300px]">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Inventory Distribution Heatmap</h2>
          
          {loading ? (
             <div className="flex justify-center items-center py-24">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
             </div>
          ) : visibleProducts.length === 0 ? (
             <div className="text-center py-24 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg">
                No products match the selected health statuses.
             </div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
              {visibleProducts.map(product => {
                const isOutOfStock = product.health_status === 'out_of_stock';
                const isSelected = selectedProduct?.product_id === product.product_id;
                
                return (
                  <div
                    key={product.product_id}
                    onClick={() => handleCellClick(product)}
                    className={`group relative w-full aspect-square rounded-lg flex flex-col items-center justify-center p-2 cursor-pointer transition-transform hover:scale-105
                      ${isOutOfStock ? 'animate-pulse ring-2 ring-red-500 ring-offset-2 dark:ring-offset-gray-800' : 'shadow-inner'}
                      ${isSelected ? 'ring-4 ring-blue-500 ring-offset-2 dark:ring-offset-gray-800' : ''}
                    `}
                    style={{ backgroundColor: getCellBackground(product) }}
                  >
                    <span className="text-[10px] sm:text-xs font-bold text-white text-center line-clamp-2 leading-tight drop-shadow-md">
                      {product.name}
                    </span>
                    <span className="text-xs sm:text-sm font-black text-white mt-1 drop-shadow-md">
                      {product.current_stock}
                    </span>
                    
                    {/* Hover Tooltip (Pure CSS) */}
                    <div className="absolute hidden group-hover:block z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white rounded-lg shadow-xl p-4 text-left pointer-events-none after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-8 after:border-transparent after:border-t-gray-900">
                      <div className="font-bold text-sm mb-1 line-clamp-1">{product.name}</div>
                      <div className="text-xs text-gray-400 mb-2 font-mono">{product.sku}</div>
                      <div className="flex justify-between items-center text-xs border-t border-gray-700 pt-2 mb-1">
                        <span className="text-gray-400">Current Stock</span>
                        <span className="font-bold">{product.current_stock}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-gray-400">Reorder Level</span>
                        <span className="font-bold">{product.reorder_level}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">Idle Days</span>
                        <span className="font-bold">{product.days_since_last_movement ?? 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Timeline Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FiActivity className="text-blue-500"/>
              Stock Health Trends
            </h2>
            <div className="flex items-center gap-2">
              {[30, 60, 90].map(days => (
                <button
                  key={days}
                  onClick={() => setTimelineDays(days)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                    timelineDays === days 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                  }`}
                >
                  {days} Days
                </button>
              ))}
            </div>
          </div>
          
          <div className="w-full h-80">
            {timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.2} />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => {
                      const d = new Date(val);
                      return `${d.getDate()}/${d.getMonth()+1}`;
                    }}
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#1f2937', color: '#fff', border: 'none', borderRadius: '0.5rem', fontSize: '0.875rem' }}
                    labelFormatter={(val) => new Date(val).toLocaleDateString()}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  
                  <Area type="monotone" dataKey="healthy" stackId="1" stroke={HEALTH_COLORS.healthy.fill} fill={HEALTH_COLORS.healthy.fill} name="Healthy" />
                  <Area type="monotone" dataKey="warning" stackId="1" stroke={HEALTH_COLORS.warning.fill} fill={HEALTH_COLORS.warning.fill} name="Warning" />
                  <Area type="monotone" dataKey="critical" stackId="1" stroke={HEALTH_COLORS.critical.fill} fill={HEALTH_COLORS.critical.fill} name="Critical" />
                  <Area type="monotone" dataKey="dead_stock" stackId="1" stroke={HEALTH_COLORS.dead_stock.fill} fill={HEALTH_COLORS.dead_stock.fill} name="Dead Stock" />
                  <Area type="monotone" dataKey="out_of_stock" stackId="1" stroke={HEALTH_COLORS.out_of_stock.fill} fill={HEALTH_COLORS.out_of_stock.fill} name="Out of Stock" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Loading timeline...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar Details Panel */}
      <div 
        className={`fixed top-0 right-0 h-full w-[320px] bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out z-40 overflow-y-auto ${selectedProduct ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {selectedProduct && (
          <div className="p-6 h-full flex flex-col">
            <div className="flex justify-between items-start mb-8">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {selectedProduct.category}
                </span>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1 leading-tight">
                  {selectedProduct.name}
                </h2>
                <p className="text-sm font-mono text-gray-500 mt-1">{selectedProduct.sku}</p>
              </div>
              <button 
                onClick={() => setSelectedProduct(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <FiX className="w-5 h-5"/>
              </button>
            </div>

            <div className="flex items-center gap-4 mb-8 bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center text-white"
                style={{ backgroundColor: getCellBackground(selectedProduct) }}
              >
                <span className="text-2xl font-black">{selectedProduct.current_stock}</span>
              </div>
              <div>
                <span className={`text-sm font-bold uppercase tracking-wider ${HEALTH_COLORS[selectedProduct.health_status].text}`}>
                  {HEALTH_COLORS[selectedProduct.health_status].label}
                </span>
                <p className="text-xs text-gray-500 mt-1">Reorder Level: {selectedProduct.reorder_level}</p>
                {selectedProduct.active_alert && (
                  <p className="text-xs text-red-500 font-semibold mt-1 flex items-center gap-1">
                    <FiAlertTriangle/> Alert Active
                  </p>
                )}
              </div>
            </div>

            <div className="mb-8 flex-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">30-Day Activity (Simulated)</h3>
              <div className="h-48 w-full bg-white dark:bg-gray-800">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mockHistory} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis dataKey="day" tick={false} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#1f2937', color: '#fff', border: 'none', borderRadius: '0.5rem', fontSize: '0.75rem' }} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="IN" fill="#3b82f6" stackId="a" />
                    <Bar dataKey="OUT" fill="#ef4444" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-gray-500 items-center gap-1 mt-2 flex justify-center text-center">
                <FiInfo className="inline"/> Idle for {selectedProduct.days_since_last_movement ?? '∞'} days
              </p>
            </div>

            {(selectedProduct.health_status === 'critical' || selectedProduct.health_status === 'out_of_stock') && (
              <button
                onClick={() => navigate('/reorder')}
                className="w-full py-4 mt-auto bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-500/30 flex items-center justify-center gap-2"
              >
                Create Reorder <FiActivity/>
              </button>
            )}
            
            {selectedProduct.health_status === 'dead_stock' && (
               <button
                 className="w-full py-4 mt-auto bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2"
               >
                 Mark for Liquidation <FiArchive/>
               </button>
            )}
          </div>
        )}
      </div>

      {/* Overlay Backdrop for Mobile/Smaller screens when Sidebar is open */}
      {selectedProduct && (
        <div 
          className="fixed inset-0 bg-black/20 z-30 lg:hidden backdrop-blur-sm"
          onClick={() => setSelectedProduct(null)}
        />
      )}
      
    </div>
  );
}
