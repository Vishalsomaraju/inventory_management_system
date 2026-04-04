import { useEffect, useMemo, useState } from 'react';

import api from '../api/axios';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import Toast from '../components/Toast';


function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.detail || fallback;
}


function emptyProductForm() {
  return {
    name: '',
    sku: '',
    category: '',
    unit: '',
    current_stock: 0,
    reorder_level: 0,
    reorder_quantity: 0,
    vendor_id: '',
  };
}


export default function InventoryPage() {
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [filters, setFilters] = useState({ search: '', category: '', lowStock: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [stockProduct, setStockProduct] = useState(null);
  const [productForm, setProductForm] = useState(emptyProductForm());
  const [stockForm, setStockForm] = useState({ type: 'IN', quantity: 1, notes: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const categories = useMemo(() => {
    const values = [...new Set(products.map((item) => item.category).filter(Boolean))];
    return values.sort();
  }, [products]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [productsResponse, vendorsResponse] = await Promise.all([
        api.get('/inventory/products', {
          params: {
            search: filters.search || undefined,
            category: filters.category || undefined,
            low_stock: filters.lowStock || undefined,
          },
        }),
        api.get('/vendors'),
      ]);
      setProducts(productsResponse.data);
      setVendors(vendorsResponse.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load inventory'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filters.search, filters.category, filters.lowStock]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, type, message });
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    setProductForm(emptyProductForm());
    setProductModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || '',
      unit: product.unit || '',
      current_stock: product.current_stock ?? 0,
      reorder_level: product.reorder_level ?? 0,
      reorder_quantity: product.reorder_quantity ?? 0,
      vendor_id: product.vendor_id || '',
    });
    setProductModalOpen(true);
  };

  const openStockModal = (product) => {
    setStockProduct(product);
    setStockForm({ type: 'IN', quantity: 1, notes: '' });
    setStockModalOpen(true);
  };

  const handleSaveProduct = async () => {
    setSaving(true);
    try {
      const payload = {
        ...productForm,
        current_stock: Number(productForm.current_stock),
        reorder_level: Number(productForm.reorder_level),
        reorder_quantity: Number(productForm.reorder_quantity),
        vendor_id: productForm.vendor_id ? Number(productForm.vendor_id) : null,
      };

      if (editingProduct) {
        await api.put(`/inventory/products/${editingProduct.id}`, payload);
        showToast('Product updated successfully');
      } else {
        await api.post('/inventory/products', payload);
        showToast('Product created successfully');
      }

      setProductModalOpen(false);
      await loadData();
    } catch (saveError) {
      showToast(getErrorMessage(saveError, 'Failed to save product'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`Delete product "${product.name}"?`)) {
      return;
    }

    try {
      await api.delete(`/inventory/products/${product.id}`);
      showToast('Product deleted successfully');
      await loadData();
    } catch (deleteError) {
      showToast(getErrorMessage(deleteError, 'Failed to delete product'), 'error');
    }
  };

  const handleAdjustStock = async () => {
    setSaving(true);
    try {
      await api.post(`/inventory/products/${stockProduct.id}/stock`, {
        type: stockForm.type,
        quantity: Number(stockForm.quantity),
        notes: stockForm.notes,
      });
      setStockModalOpen(false);
      showToast('Stock adjusted successfully');
      await loadData();
    } catch (stockError) {
      showToast(getErrorMessage(stockError, 'Failed to adjust stock'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner label="Loading inventory..." />;
  }

  return (
    <div className="space-y-6">
      <Toast {...toast} onClose={() => setToast((current) => ({ ...current, show: false }))} />

      <div className="flex flex-col gap-4 rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Search</label>
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
              placeholder="Search name, SKU, category"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
            <select
              value={filters.category}
              onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={filters.lowStock}
              onChange={(event) => setFilters((current) => ({ ...current, lowStock: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Low Stock Only
          </label>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-800"
        >
          Add Product
        </button>
      </div>

      {error ? <div className="rounded-2xl bg-rose-50 dark:bg-rose-900/20 px-5 py-4 text-sm text-rose-700 dark:text-rose-400">{error}</div> : null}

      <div className="overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                {['Name', 'SKU', 'Category', 'Unit', 'Stock', 'Reorder Level', 'Vendor', 'Actions'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((product) => (
                <tr
                  key={product.id}
                  className={product.current_stock <= product.reorder_level ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-white dark:bg-slate-800'}
                >
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{product.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{product.sku}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{product.category || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{product.unit || '-'}</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-white">{product.current_stock}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{product.reorder_level}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{product.vendor_name || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEditModal(product)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Edit
                      </button>
                      <button type="button" onClick={() => openStockModal(product)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Adjust Stock
                      </button>
                      <button type="button" onClick={() => handleDeleteProduct(product)} className="rounded-lg border border-rose-200 dark:border-rose-900/50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!products.length ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-slate-500">
                    No products found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={productModalOpen}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
        onClose={() => setProductModalOpen(false)}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setProductModalOpen(false)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Cancel
            </button>
            <button type="button" onClick={handleSaveProduct} disabled={saving} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
              {saving ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ['name', 'Name'],
            ['sku', 'SKU'],
            ['category', 'Category'],
            ['unit', 'Unit'],
          ].map(([field, label]) => (
            <div key={field}>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
              <input
                value={productForm[field]}
                onChange={(event) => setProductForm((current) => ({ ...current, [field]: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
              />
            </div>
          ))}
          {[
            ['current_stock', 'Current Stock'],
            ['reorder_level', 'Reorder Level'],
            ['reorder_quantity', 'Reorder Quantity'],
          ].map(([field, label]) => (
            <div key={field}>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
              <input
                type="number"
                value={productForm[field]}
                onChange={(event) => setProductForm((current) => ({ ...current, [field]: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
              />
            </div>
          ))}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Vendor</label>
            <select
              value={productForm.vendor_id}
              onChange={(event) => setProductForm((current) => ({ ...current, vendor_id: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
            >
              <option value="">No vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={stockModalOpen}
        title={stockProduct ? `Adjust Stock: ${stockProduct.name}` : 'Adjust Stock'}
        onClose={() => setStockModalOpen(false)}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setStockModalOpen(false)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Cancel
            </button>
            <button type="button" onClick={handleAdjustStock} disabled={saving} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
              {saving ? 'Submitting...' : 'Apply Adjustment'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
              <select
                value={stockForm.type}
                onChange={(event) => setStockForm((current) => ({ ...current, type: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
              >
                <option value="IN">IN</option>
                <option value="OUT">OUT</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Quantity</label>
              <input
                type="number"
                min="1"
                value={stockForm.quantity}
                onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
            <textarea
              value={stockForm.notes}
              onChange={(event) => setStockForm((current) => ({ ...current, notes: event.target.value }))}
              className="min-h-28 w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
