import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiZap, FiPlay, FiCheck, FiX, FiCheckCircle } from 'react-icons/fi';
import { fetchAutoReorderPreview, executeAutoReorder, approvePO, receivePO, fetchAutoPOs } from '../api/purchaseOrders';

const formatINR = (value) => {
  if (value == null || isNaN(value)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(value);
};

export default function AutoReorderPage() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('draft');
  const [actionLoading, setActionLoading] = useState({}); // { po_id: boolean }

  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastRunFormatted, setLastRunFormatted] = useState("Never"); // We can format this based on the recent fetched POs if we want

  // Toast State
  const [toastMessage, setToastMessage] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);

  const modalRef = useRef(null);

  useEffect(() => {
    loadPOs();
  }, []);

  const loadPOs = async () => {
    setLoading(true);
    try {
      const data = await fetchAutoPOs();
      setPurchaseOrders(data || []);
      
      // Calculate last run based on the most recent auto PO
      if (data && data.length > 0) {
        // Sort by created_date desc
        const sorted = [...data].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        const lastCreated = new Date(sorted[0].created_date);
        const diffMs = new Date() - lastCreated;
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        
        if (diffHrs < 1) {
          const diffMins = Math.floor(diffMs / (1000 * 60));
          setLastRunFormatted(`${diffMins} minutes ago`);
        } else if (diffHrs < 24) {
          setLastRunFormatted(`${diffHrs} hours ago`);
        } else {
          setLastRunFormatted(`${Math.floor(diffHrs/24)} days ago`);
        }
      }
    } catch (error) {
      console.error("Failed to load POs", error);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message) => {
    setToastMessage(message);
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setToastMessage(null), 300); // clear after slide out
    }, 4000);
  };

  // Preview Logic
  const handleRunPreview = async () => {
    setPreviewLoading(true);
    setShowPreview(true);
    try {
      const data = await fetchAutoReorderPreview();
      setPreviewData(data);
    } catch (error) {
      console.error("Failed to load preview", error);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Execute Logic
  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      const data = await executeAutoReorder();
      showToast(`${data.pos_created || 0} purchase orders created successfully`);
      setIsModalOpen(false);
      setShowPreview(false);
      setPreviewData(null);
      loadPOs(); // Refresh table
    } catch (error) {
      console.error("Failed to execute auto-reorder", error);
    } finally {
      setIsExecuting(false);
    }
  };

  // Inline table actions
  const handleApprove = async (id) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await approvePO(id);
      // Optimistic update
      setPurchaseOrders(prev => prev.map(po => po.id === id ? { ...po, status: 'sent' } : po));
    } catch (error) {
      console.error("Failed to approve PO", error);
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleReceive = async (id) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      const data = await receivePO(id);
      const receivedDate = data?.purchase_order?.received_date || new Date().toISOString();
      // Optimistic update
      setPurchaseOrders(prev => prev.map(po => po.id === id ? { ...po, status: 'received', received_date: receivedDate } : po));
    } catch (error) {
      console.error("Failed to receive PO", error);
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  // Modal accessibility
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const filteredPOs = purchaseOrders.filter(po => po.status === activeTab);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'draft': return <span className="px-2 py-1 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded text-xs font-semibold">Draft</span>;
      case 'sent': return <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded text-xs font-semibold">Sent</span>;
      case 'received': return <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded text-xs font-semibold">Received</span>;
      default: return null;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen relative overflow-hidden">
      
      {/* Toast Notification */}
      <div className={`fixed top-4 right-4 z-50 transition-all duration-300 ease-in-out transform ${toastVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
        {toastMessage && (
          <div className="bg-green-50 text-green-800 border border-green-200 shadow-lg rounded-lg p-4 flex items-center gap-3">
            <FiCheckCircle className="w-5 h-5 text-green-500" />
            <span className="font-semibold text-sm">{toastMessage}</span>
          </div>
        )}
      </div>

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Auto-Reorder Engine</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Smart procurement automation</p>
      </header>

      {/* Top Action Strip */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
        <div className="flex gap-4">
          <button
            onClick={handleRunPreview}
            disabled={previewLoading || isExecuting}
            className="flex items-center gap-2 px-5 py-2.5 border-2 border-blue-500 text-blue-600 dark:text-blue-400 dark:border-blue-400 font-semibold rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition shadow-sm disabled:opacity-50"
          >
            {previewLoading ? <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div> : <FiPlay />}
            Run Preview
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={isExecuting}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition shadow-sm disabled:opacity-50"
          >
            {isExecuting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <FiZap />}
            Execute Auto-Reorder
          </button>
        </div>
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 px-4 py-2 rounded-lg">
          Last auto-reorder: {lastRunFormatted}
        </div>
      </div>

      {/* Preview Panel (Animated) */}
      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${showPreview ? 'max-h-[1000px] mb-8 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="bg-white dark:bg-gray-800 border-l-4 border-l-blue-500 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Preview: {previewData ? previewData.pos_created : 0} purchase orders would be created
              </h2>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">
                <FiX className="w-5 h-5"/>
              </button>
            </div>

            {previewLoading ? (
              <div className="py-12 flex justify-center">
                 <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : previewData && previewData.orders && previewData.orders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900 border-y border-gray-200 dark:border-gray-700">
                      <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Product Name</th>
                      <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Vendor</th>
                      <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Qty</th>
                      <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {previewData.orders.map((order, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                        <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">{order.product_name}</td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{order.vendor_name}</td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{order.quantity}</td>
                        <td className="py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">{formatINR(order.estimated_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : previewData && previewData.pos_created === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                {previewData.message || "All stock levels are healthy."}
              </div>
            ) : null}

            {previewData && previewData.orders && previewData.orders.length > 0 && (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleExecute}
                  disabled={isExecuting}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition disabled:opacity-50 shadow-md"
                >
                  {isExecuting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                  Confirm & Execute
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Auto POs Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Auto-Generated Purchase Orders</h2>
          <div className="flex space-x-6">
            {['draft', 'sent', 'received'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-bold capitalize border-b-2 transition-colors ${
                  activeTab === tab 
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-24 flex justify-center">
             <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredPOs.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            No {activeTab} auto-generated purchase orders found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-100/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">PO #</th>
                  <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Vendor</th>
                  <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Cost</th>
                  <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                  {activeTab === 'received' && (
                     <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Received</th>
                  )}
                  {activeTab !== 'received' && (
                     <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Exp. Delivery</th>
                  )}
                  <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredPOs.map((po) => {
                  const isActionLoading = actionLoading[po.id];
                  
                  return (
                    <tr key={po.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                      <td className="py-4 px-6 text-sm font-semibold text-gray-900 dark:text-white">#{po.id}</td>
                      <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-300">{po.vendor_name || `Vendor ${po.vendor_id}`}</td>
                      <td className="py-4 px-6 text-sm font-semibold text-gray-900 dark:text-white">{formatINR(po.total_amount)}</td>
                      <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400">{new Date(po.created_date).toLocaleDateString()}</td>
                      
                      {activeTab === 'received' && (
                        <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400">
                          {po.received_date ? new Date(po.received_date).toLocaleDateString() : '-'}
                        </td>
                      )}
                      {activeTab !== 'received' && (
                         <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400">
                           {po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : 'N/A'}
                         </td>
                      )}

                      <td className="py-4 px-6">{getStatusBadge(po.status)}</td>
                      
                      <td className="py-4 px-6 text-right">
                        {activeTab === 'draft' && (
                          <button
                            onClick={() => handleApprove(po.id)}
                            disabled={isActionLoading}
                            className="bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60 px-3 py-1.5 rounded text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center ml-auto gap-2 min-w-[90px]"
                          >
                            {isActionLoading && <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>}
                            Approve
                          </button>
                        )}
                        {activeTab === 'sent' && (
                          <button
                            onClick={() => handleReceive(po.id)}
                            disabled={isActionLoading}
                            className="bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60 px-3 py-1.5 rounded text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center ml-auto gap-2 min-w-[140px]"
                          >
                            {isActionLoading && <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>}
                            Mark as Received
                          </button>
                        )}
                        {activeTab === 'received' && (
                          <span className="text-sm text-gray-400 dark:text-gray-500 italic">No actions</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {isModalOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={() => !isExecuting && setIsModalOpen(false)}
          />
          <div 
            ref={modalRef}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 z-50 w-full max-w-md"
            role="dialog"
            aria-modal="true"
            tabIndex="-1"
          >
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Create Auto Purchase Orders?</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              This will create draft POs for all products currently below their reorder level.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isExecuting}
                className="px-4 py-2 font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExecute}
                disabled={isExecuting}
                className="flex items-center gap-2 px-4 py-2 font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50 min-w-[100px] justify-center"
              >
                {isExecuting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Confirm'}
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
