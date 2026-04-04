import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

const PurchaseOrders = () => {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ message: '', type: '' });
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAISuggestionsModal, setShowAISuggestionsModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null); // Used for details modal

  const fetchPOs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/purchase-orders');
      setPurchaseOrders(response.data);
    } catch (err) {
      showToast('Failed to load purchase orders', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPOs();
  }, [fetchPOs]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: '' }), 4000);
  };

  const handleStatusAction = async (id, action) => {
    try {
      await api.post(`/purchase-orders/${id}/${action}`);
      showToast(`Purchase order marked as ${action === 'send' ? 'sent' : 'received'}`);
      fetchPOs();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to update status', 'error');
    }
  };

  const handleOpenDetails = async (id) => {
    try {
      const resp = await api.get(`/purchase-orders/${id}`);
      setSelectedPO(resp.data);
    } catch (e) {
      showToast('Failed to load PO details', 'error');
    }
  };

  const getStatusBadge = (status) => {
    const s = status.toLowerCase();
    if (s === 'draft') return <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Draft</span>;
    if (s === 'sent') return <span className="bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Sent</span>;
    if (s === 'received') return <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Received</span>;
    return <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">{status}</span>;
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast */}
      {toast.message && (
        <div className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 flex items-center gap-2 ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">Purchase Orders</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAISuggestionsModal(true)}
            className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 transition-colors shadow-sm font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            AI Suggest Reorders
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Create PO
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">PO ID</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">Vendor</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600 text-center">Status</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">Created Date</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">Expected Delivery</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600 text-right">Total Amount</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="7" className="py-12 text-center text-gray-500">Loading purchase orders...</td></tr>
              ) : purchaseOrders.length === 0 ? (
                <tr><td colSpan="7" className="py-12 text-center text-gray-500">No purchase orders found.</td></tr>
              ) : (
                purchaseOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6 font-medium text-blue-600 cursor-pointer" onClick={() => handleOpenDetails(po.id)}>
                      #{po.po_number || po.id.toString().padStart(3, '0')}
                    </td>
                    <td className="py-4 px-6 font-medium text-gray-800">{po.vendor?.name || po.vendor_name || po.vendor_id}</td>
                    <td className="py-4 px-6 text-center">{getStatusBadge(po.status)}</td>
                    <td className="py-4 px-6 text-gray-500">{new Date(po.created_date || po.created_at || new Date()).toLocaleDateString()}</td>
                    <td className="py-4 px-6 text-gray-500">{po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : '-'}</td>
                    <td className="py-4 px-6 text-right font-mono font-bold">${(po.total_amount || 0).toFixed(2)}</td>
                    <td className="py-4 px-6">
                      <div className="flex justify-end gap-2">
                        {po.status.toLowerCase() === 'draft' && (
                          <button onClick={() => handleStatusAction(po.id, 'send')} className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded text-xs font-bold transition-colors">
                            Send to Vendor
                          </button>
                        )}
                        {po.status.toLowerCase() === 'sent' && (
                          <button onClick={() => handleStatusAction(po.id, 'receive')} className="bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded text-xs font-bold transition-colors">
                            Mark Received
                          </button>
                        )}
                        <button onClick={() => handleOpenDetails(po.id)} className="text-gray-500 hover:text-blue-600 font-medium text-sm px-2">
                          View Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <CreatePOModal 
          close={() => setShowCreateModal(false)}
          onSuccess={() => { fetchPOs(); showToast('Purchase order created successfully'); setShowCreateModal(false); }}
          onError={(m) => showToast(m, 'error')}
        />
      )}

      {showAISuggestionsModal && (
        <AISuggestedReordersModal
          close={() => setShowAISuggestionsModal(false)}
          onCreated={(createdCount) => {
            fetchPOs();
            showToast(createdCount === 1 ? 'Draft purchase order created' : `${createdCount} draft purchase orders created`);
          }}
          onOpenPO={handleOpenDetails}
          onError={(message) => showToast(message, 'error')}
        />
      )}

      {selectedPO && (
        <PODetailsModal
          po={selectedPO}
          close={() => setSelectedPO(null)}
          getStatusBadge={getStatusBadge}
        />
      )}
    </div>
  );
};

// ============================================
// Create PO Modal (Large)
// ============================================
const CreatePOModal = ({ close, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [items, setItems] = useState([{ product_id: '', quantity: 1, unit_price: 0 }]);

  useEffect(() => {
    Promise.all([api.get('/vendors'), api.get('/inventory/products')])
      .then(([vRes, pRes]) => { setVendors(vRes.data); setProducts(pRes.data); })
      .catch((e) => console.error("Failed fetching for PO form", e));
  }, []);

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    
    // Auto fill unit price if product selected
    if (field === 'product_id') {
      const p = products.find(prod => prod.id === value);
      if (p && p.cost_price) newItems[index].unit_price = p.cost_price;
    }
    setItems(newItems);
  };

  const addItem = () => setItems([...items, { product_id: '', quantity: 1, unit_price: 0 }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const totalAmount = items.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendorId) return onError('Please select a vendor');
    if (items.some(i => !i.product_id)) return onError('Please select a product for all lines');
    
    setLoading(true);
    try {
      await api.post('/purchase-orders', {
        vendor_id: Number(vendorId),
        expected_delivery: expectedDelivery || null,
        line_items: items.map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
        })),
      });
      onSuccess();
    } catch (err) {
      onError(err.response?.data?.detail || 'Failed to create PO');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:p-12 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-full flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
          <h3 className="text-xl font-bold text-gray-800">Create Purchase Order</h3>
          <button onClick={close} className="text-gray-400 hover:text-gray-600 transition-colors">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 flex-1 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
              <select required value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
                <option value="">Select Vendor...</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery</label>
              <input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
            </div>
          </div>

          <div>
            <h4 className="text-sm border-b pb-2 mb-4 font-bold text-gray-800 uppercase tracking-wide">Line Items</h4>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="flex flex-col md:flex-row gap-3 items-end bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <div className="flex-1 w-full relative">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Product</label>
                    <select required value={item.product_id} onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                      <option value="">Select Product...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                  </div>
                  <div className="w-full md:w-24">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Qty</label>
                    <input type="number" min="1" required value={item.quantity} onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"/>
                  </div>
                  <div className="w-full md:w-32">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Unit Price ($)</label>
                    <input type="number" step="0.01" min="0" required value={item.unit_price} onChange={(e) => handleItemChange(idx, 'unit_price', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"/>
                  </div>
                  <div className="w-full md:w-32 pb-1.5 font-mono text-sm font-semibold flex items-center justify-between">
                    <span className="text-gray-500 text-xs mr-2">Total:</span> 
                    ${(item.quantity * item.unit_price).toFixed(2)}
                  </div>
                  <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1} className="p-2 text-red-500 hover:bg-red-50 rounded disabled:opacity-30 mb-0.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              ))}
            </div>
            
            <button type="button" onClick={addItem} className="mt-4 text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              Add Row
            </button>
          </div>
          
          <div className="mt-8 pt-4 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-xl font-medium text-gray-800">
              Total Amount: <span className="font-bold font-mono ml-2">${totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={close} className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={loading} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center disabled:opacity-50">
                {loading ? 'Submitting...' : 'Submit PO'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

const AISuggestedReordersModal = ({ close, onCreated, onOpenPO, onError }) => {
  const [loading, setLoading] = useState(true);
  const [creatingAll, setCreatingAll] = useState(false);
  const [creatingIndex, setCreatingIndex] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [createdPOs, setCreatedPOs] = useState([]);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.post('/ai/suggest-reorder');
      setSuggestions(Array.isArray(response.data?.purchase_orders) ? response.data.purchase_orders : []);
    } catch (err) {
      onError(err.response?.data?.detail || 'Failed to load AI reorder suggestions');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const markCreated = (orders) => {
    setCreatedPOs((prev) => [...prev, ...orders.filter((order) => !prev.some((existing) => existing.id === order.id))]);
    setSuggestions((prev) => prev.filter((suggestion) => !orders.some((order) => order.vendor_id === suggestion.vendor_id)));
    if (orders.length > 0) {
      onCreated(orders.length);
    }
  };

  const createSuggestions = async (selectedSuggestions) => {
    const response = await api.post('/ai/create-suggested-orders', {
      suggestions: selectedSuggestions,
    });
    return Array.isArray(response.data?.created_purchase_orders) ? response.data.created_purchase_orders : [];
  };

  const handleCreateAll = async () => {
    if (suggestions.length === 0) return;
    setCreatingAll(true);
    try {
      const created = await createSuggestions(suggestions);
      markCreated(created);
    } catch (err) {
      onError(err.response?.data?.detail || 'Failed to create draft purchase orders');
    } finally {
      setCreatingAll(false);
    }
  };

  const handleCreateOne = async (suggestion, index) => {
    setCreatingIndex(index);
    try {
      const created = await createSuggestions([suggestion]);
      markCreated(created);
    } catch (err) {
      onError(err.response?.data?.detail || 'Failed to create draft purchase order');
    } finally {
      setCreatingIndex(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:p-12 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-full flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h3 className="text-xl font-bold text-gray-800">AI Suggested Reorders</h3>
            <p className="text-sm text-gray-500 mt-1">Vendor-grouped draft purchase order recommendations based on low stock and recent outbound movement.</p>
          </div>
          <button onClick={close} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-white">
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="rounded-xl border border-purple-100 bg-purple-50/50 p-5 animate-pulse">
                  <div className="h-5 w-40 bg-purple-100 rounded mb-4"></div>
                  <div className="h-4 w-full bg-purple-100 rounded mb-2"></div>
                  <div className="h-4 w-5/6 bg-purple-100 rounded"></div>
                </div>
              ))}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-gray-500">
              No reorder suggestions are available right now.
            </div>
          ) : (
            <div className="space-y-4">
              {suggestions.map((suggestion, index) => (
                <div key={`${suggestion.vendor_id}-${index}`} className="rounded-xl border border-purple-200 bg-purple-50/40 p-5 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-purple-700">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                        <h4 className="text-lg font-bold text-gray-900">{suggestion.vendor_name || `Vendor #${suggestion.vendor_id}`}</h4>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Estimated total spend: ${Number(suggestion.estimated_total_spend || 0).toFixed(2)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCreateOne(suggestion, index)}
                      disabled={creatingAll || creatingIndex !== null}
                      className="self-start rounded-lg bg-white px-4 py-2 text-sm font-medium text-purple-700 border border-purple-200 hover:bg-purple-100 disabled:opacity-50"
                    >
                      {creatingIndex === index ? 'Creating...' : 'Create'}
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {suggestion.items?.map((item, itemIndex) => (
                      <div key={`${item.product_id}-${itemIndex}`} className="rounded-lg bg-white border border-purple-100 px-4 py-3">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-800">{item.product_name}</p>
                            <p className="text-sm text-gray-500 mt-1">{item.reason}</p>
                          </div>
                          <div className="text-sm text-gray-600 md:text-right">
                            <div>Qty: <span className="font-semibold text-gray-900">{item.suggested_quantity}</span></div>
                            <div>Est. unit: <span className="font-semibold text-gray-900">${Number(item.unit_price_estimate || 0).toFixed(2)}</span></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {createdPOs.length > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-5">
              <h4 className="text-sm font-bold uppercase tracking-wide text-green-800">Created Draft POs</h4>
              <div className="mt-3 flex flex-wrap gap-3">
                {createdPOs.map((po) => (
                  <button
                    key={po.id}
                    type="button"
                    onClick={() => onOpenPO(po.id)}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-green-700 border border-green-200 hover:bg-green-100"
                  >
                    #{String(po.id).padStart(3, '0')} {po.vendor_name ? `- ${po.vendor_name}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Powered by Claude
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={close} className="px-5 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">
              Close
            </button>
            <button
              type="button"
              onClick={handleCreateAll}
              disabled={loading || suggestions.length === 0 || creatingAll || creatingIndex !== null}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg disabled:opacity-50"
            >
              {creatingAll ? 'Creating...' : 'Create All as Draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PO Details Modal (Slide-over style panel inside a modal overlay)
// ============================================
const PODetailsModal = ({ po, close, getStatusBadge }) => {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col animate-[slideIn_0.3s_ease-out]">
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-start bg-gray-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">PO #{po.po_number || po.id.toString().padStart(3, '0')}</h2>
            <p className="text-sm text-gray-500 mt-1">Created on {new Date(po.created_date || po.created_at).toLocaleDateString()}</p>
          </div>
          <button onClick={close} className="bg-white p-2 rounded-full shadow-sm hover:bg-gray-50 text-gray-500 border border-gray-200">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <div className="flex flex-wrap gap-8 p-6 bg-gray-50 rounded-xl border border-gray-200 shadow-inner">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Status</p>
              {getStatusBadge(po.status)}
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Vendor</p>
              <p className="font-semibold text-gray-800">{po.vendor?.name || 'Unknown'}</p>
              <p className="text-sm text-gray-500">{po.vendor?.email}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Expected</p>
              <p className="font-semibold text-gray-800">{po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : 'TBD'}</p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Line Items</h3>
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100/50">
                <tr>
                  <th className="py-2 px-3 font-semibold text-gray-600">Product</th>
                  <th className="py-2 px-3 justify-center text-center font-semibold text-gray-600">Qty</th>
                  <th className="py-2 px-3 font-semibold text-gray-600 text-right">Unit Price</th>
                  <th className="py-2 px-3 font-semibold text-gray-600 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {((po.line_items || po.items) || []).map((item, i) => (
                  <tr key={i}>
                    <td className="py-4 px-3">
                      <div className="font-medium text-gray-800">{item.product?.name || item.product_name || `Product #${item.product_id}`}</div>
                      <div className="text-xs text-gray-500">{item.product?.sku}</div>
                    </td>
                    <td className="py-4 px-3 text-center font-semibold">{item.quantity}</td>
                    <td className="py-4 px-3 text-right text-gray-600">${Number(item.unit_price).toFixed(2)}</td>
                    <td className="py-4 px-3 text-right font-mono font-bold text-gray-800">
                      ${(item.quantity * item.unit_price).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200">
                <tr>
                  <td colSpan="3" className="py-4 px-3 text-right font-bold text-gray-600 uppercase text-xs tracking-wider">Total Amount:</td>
                  <td className="py-4 px-3 text-right font-mono font-bold text-xl text-blue-600">
                    ${(po.total_amount || 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html:`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}}/>
    </div>
  );
};

export default PurchaseOrders;
