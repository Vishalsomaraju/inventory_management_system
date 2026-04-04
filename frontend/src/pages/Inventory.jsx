import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

const Inventory = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isLowStock, setIsLowStock] = useState(searchParams.get('filter') === 'low_stock');
  
  // Modal & Form State
  const [modalState, setModalState] = useState({ type: null, product: null });
  const [vendors, setVendors] = useState([]);
  
  // Toast
  const [toast, setToast] = useState({ message: '', type: '' });

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Update URL if low stock filter changes
  useEffect(() => {
    if (isLowStock) {
      setSearchParams({ filter: 'low_stock' });
    } else {
      setSearchParams({});
    }
  }, [isLowStock, setSearchParams]);

  // Fetch Products
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      // Backend should ideally handle these filters, but we can also pass them.
      // E.g. params: { search: debouncedSearch, category: categoryFilter, low_stock: isLowStock }
      // The prompt says "Re-fetch when search/filter changes"
      const response = await api.get('/inventory/products', {
        params: {
          search: debouncedSearch || undefined,
          category: categoryFilter || undefined,
          low_stock: isLowStock || undefined
        }
      });
      // Fallback in case the API doesn't support the filters natively yet, we can also filter frontend
      // But passing params is better.
      setProducts(response.data);
    } catch (err) {
      showToast('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, categoryFilter, isLowStock]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Fetch Vendors for modal
  useEffect(() => {
    if (modalState.type === 'add' || modalState.type === 'edit') {
      const fetchVendors = async () => {
        try {
          const response = await api.get('/vendors');
          setVendors(response.data);
        } catch (e) {
          console.error("Failed to load vendors", e);
        }
      };
      fetchVendors();
    }
  }, [modalState.type]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: '' }), 3000);
  };

  const categories = useMemo(() => {
    const cats = products.map(p => p.category).filter(Boolean);
    return [...new Set(cats)];
  }, [products]);

  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const getStockColor = (stock, reorder) => {
    if (stock <= reorder) return 'text-red-600 bg-red-100';
    if (stock > reorder * 2) return 'text-green-700 bg-green-100';
    return 'text-amber-600 bg-amber-100';
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast */}
      {toast.message && (
        <div className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 transition-opacity flex items-center gap-2 ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        }`}>
          {toast.type === 'error' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          )}
          {toast.message}
        </div>
      )}

      {/* Top Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-1 gap-4 items-center w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Search by name or SKU..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="py-2 pl-3 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-700"
          >
            <option value="">All Categories</option>
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <button
            onClick={() => setIsLowStock(!isLowStock)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors border ${
              isLowStock ? 'bg-amber-100 border-amber-200 text-amber-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Low Stock Only
          </button>
        </div>
        {canEdit && (
          <button
            onClick={() => setModalState({ type: 'add', product: null })}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium whitespace-nowrap"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Product
          </button>
        )}
      </div>

      {/* Table Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">Product Name</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">SKU</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">Category</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600 text-right">Stock (Unit)</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600 text-right">Reorder Lvl</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">Vendor</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-gray-500">
                    <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading products...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-gray-500">
                    No products found matching your criteria.
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6 font-medium text-gray-800">{product.name}</td>
                    <td className="py-4 px-6 text-gray-500">{product.sku}</td>
                    <td className="py-4 px-6 text-gray-500">{product.category}</td>
                    <td className="py-4 px-6 text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${getStockColor(product.current_stock, product.reorder_level)}`}>
                        {product.current_stock} {product.unit}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right text-gray-500">{product.reorder_level}</td>
                    <td className="py-4 px-6 text-gray-500">{product.vendor?.name || product.vendor_id || '—'}</td>
                    <td className="py-4 px-6">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => setModalState({ type: 'stock-in', product })}
                          className="bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded text-xs font-semibold transition-colors"
                          title="Stock In"
                        >
                          + IN
                        </button>
                        <button
                          onClick={() => setModalState({ type: 'stock-out', product })}
                          className="bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded text-xs font-semibold transition-colors"
                          title="Stock Out"
                        >
                          - OUT
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => setModalState({ type: 'edit', product })}
                            className="text-gray-400 hover:text-blue-600 p-1.5 transition-colors"
                            title="Edit Product"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {modalState.type && (
        <Modal 
          modalState={modalState} 
          setModalState={setModalState} 
          onSuccess={() => {
            fetchProducts();
            showToast(`Successfully ${modalState.type === 'edit' || modalState.type === 'add' ? 'saved product' : 'updated stock'}!`);
          }}
          onError={(err) => showToast(err, 'error')}
          vendors={vendors}
        />
      )}
    </div>
  );
};

export default Inventory;

// ============================================
// Internal Modal Component
// ============================================
const Modal = ({ modalState, setModalState, onSuccess, onError, vendors }) => {
  const { type, product } = modalState;
  const isStockUpdate = type === 'stock-in' || type === 'stock-out';
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(
    isStockUpdate 
      ? { quantity: 1, notes: '' }
      : product 
        ? { ...product } 
        : { name: '', sku: '', category: '', unit: '', current_stock: 0, reorder_level: 0, vendor_id: '' }
  );

  const close = () => setModalState({ type: null, product: null });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: e.target.type === 'number' ? Number(value) : value 
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isStockUpdate) {
        if (type === 'stock-out' && formData.quantity > product.current_stock) {
          throw new Error('Quantity exceeds current stock!');
        }
        await api.post(`/inventory/products/${product.id}/${type}`, {
          quantity: formData.quantity,
          notes: formData.notes
        });
      } else {
        if (type === 'add') {
          await api.post('/inventory/products', formData);
        } else if (type === 'edit') {
          await api.put(`/inventory/products/${product.id}`, formData);
        }
      }
      onSuccess();
      close();
    } catch (err) {
      onError(err.response?.data?.detail || err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" disableautofocus="true">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-bold text-gray-800">
            {type === 'stock-in' ? `Stock In: ${product.name}` :
             type === 'stock-out' ? `Stock Out: ${product.name}` :
             type === 'add' ? 'Add New Product' :
             `Edit Product: ${product.name}`}
          </h3>
          <button onClick={close} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {isStockUpdate ? (
              <>
                <div className="flex justify-between items-center mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Current Stock</span>
                  <span className="font-bold text-lg text-gray-900">{product.current_stock} {product.unit}</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    name="quantity"
                    min="1"
                    required
                    value={formData.quantity}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                  <textarea
                    name="notes"
                    rows="2"
                    value={formData.notes || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </>
            ) : (
              // Add / Edit Product Form
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" name="name" required value={formData.name || ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                  <input type="text" name="sku" required value={formData.sku || ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input type="text" name="category" required value={formData.category || ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit of Measure</label>
                  <input type="text" name="unit" required placeholder="e.g. pcs, kg, boxes" value={formData.unit || ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                  <input type="number" name="reorder_level" min="0" required value={formData.reorder_level || ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
                {type === 'add' && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Initial Stock</label>
                    <input type="number" name="current_stock" min="0" required value={formData.current_stock || ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                  <select name="vendor_id" value={formData.vendor_id || ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
                    <option value="">Select a vendor...</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-8 flex gap-3 justify-end">
            <button type="button" onClick={close} className="px-5 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className={`px-5 py-2 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center ${
                type === 'stock-out' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              } disabled:opacity-50`}
            >
              {loading && <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>}
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
