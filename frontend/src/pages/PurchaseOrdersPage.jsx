import { useEffect, useMemo, useState } from 'react';

import api from '../api/axios';
import Badge from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import Toast from '../components/Toast';


function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.detail || fallback;
}


function emptyLineItem() {
  return { product_id: '', quantity: 1, unit_price: 0 };
}


export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    vendor_id: '',
    expected_delivery: '',
    line_items: [emptyLineItem()],
  });
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [ordersResponse, vendorsResponse, productsResponse] = await Promise.all([
        api.get('/purchase-orders', { params: { status: statusFilter || undefined } }),
        api.get('/vendors'),
        api.get('/inventory/products'),
      ]);
      setOrders(ordersResponse.data);
      setVendors(vendorsResponse.data);
      setProducts(productsResponse.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load purchase orders'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const showToast = (message, type = 'success') => setToast({ show: true, type, message });

  const orderTotal = useMemo(
    () =>
      form.line_items.reduce(
        (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0),
        0,
      ),
    [form.line_items],
  );

  const openCreateModal = () => {
    setForm({
      vendor_id: '',
      expected_delivery: '',
      line_items: [emptyLineItem()],
    });
    setStep(1);
    setModalOpen(true);
  };

  const updateLineItem = (index, field, value) => {
    setForm((current) => ({
      ...current,
      line_items: current.line_items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addLineItem = () => {
    setForm((current) => ({ ...current, line_items: [...current.line_items, emptyLineItem()] }));
  };

  const removeLineItem = (index) => {
    setForm((current) => ({
      ...current,
      line_items: current.line_items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleCreateOrder = async () => {
    setSaving(true);
    try {
      await api.post('/purchase-orders', {
        vendor_id: Number(form.vendor_id),
        expected_delivery: form.expected_delivery || null,
        line_items: form.line_items.map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
        })),
      });
      setModalOpen(false);
      showToast('Purchase order created successfully');
      await loadData();
    } catch (createError) {
      showToast(getErrorMessage(createError, 'Failed to create purchase order'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (orderId, nextStatus) => {
    try {
      await api.put(`/purchase-orders/${orderId}/status`, { status: nextStatus });
      showToast(`Purchase order marked ${nextStatus}`);
      await loadData();
    } catch (statusError) {
      showToast(getErrorMessage(statusError, 'Failed to update purchase order status'), 'error');
    }
  };

  const handleDelete = async (orderId) => {
    if (!window.confirm('Delete this draft purchase order?')) {
      return;
    }

    try {
      await api.delete(`/purchase-orders/${orderId}`);
      showToast('Purchase order deleted successfully');
      await loadData();
    } catch (deleteError) {
      showToast(getErrorMessage(deleteError, 'Failed to delete purchase order'), 'error');
    }
  };

  const badgeColor = (status) => {
    if (status === 'draft') {
      return 'yellow';
    }
    if (status === 'sent') {
      return 'blue';
    }
    if (status === 'received') {
      return 'green';
    }
    return 'gray';
  };

  if (loading) {
    return <LoadingSpinner label="Loading purchase orders..." />;
  }

  return (
    <div className="space-y-6">
      <Toast {...toast} onClose={() => setToast((current) => ({ ...current, show: false }))} />

      <div className="flex flex-col gap-4 rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Purchase Orders</h2>
            <p className="text-sm text-slate-500">Create draft orders and progress them through receipt.</p>
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="received">Received</option>
          </select>
        </div>

        <button type="button" onClick={openCreateModal} className="rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white">
          Create PO
        </button>
      </div>

      {error ? <div className="rounded-2xl bg-rose-50 dark:bg-rose-900/20 px-5 py-4 text-sm text-rose-700 dark:text-rose-400">{error}</div> : null}

      <div className="overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                {['PO ID', 'Vendor', 'Status', 'Date', 'Total', 'Actions'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">#{order.id}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{order.vendor_name || '-'}</td>
                  <td className="px-4 py-3">
                    <Badge color={badgeColor(order.status)}>{order.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {order.created_date ? new Date(order.created_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">${Number(order.total_amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {order.status === 'draft' ? (
                        <button type="button" onClick={() => handleStatusUpdate(order.id, 'sent')} className="rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-semibold text-sky-700">
                          Mark Sent
                        </button>
                      ) : null}
                      {order.status === 'sent' ? (
                        <button type="button" onClick={() => handleStatusUpdate(order.id, 'received')} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                          Mark Received
                        </button>
                      ) : null}
                      {order.status === 'draft' ? (
                        <button type="button" onClick={() => handleDelete(order.id)} className="rounded-lg border border-rose-200 dark:border-rose-900/50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!orders.length ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-500">
                    No purchase orders found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        title="Create Purchase Order"
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-between">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">Running Total: ${orderTotal.toFixed(2)}</div>
            <div className="flex gap-3">
              {step === 2 ? (
                <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Back
                </button>
              ) : null}
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Cancel
              </button>
              {step === 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!form.vendor_id}
                  className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-sky-300"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateOrder}
                  disabled={saving || !form.line_items.every((item) => item.product_id && item.quantity && item.unit_price)}
                  className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-sky-300"
                >
                  {saving ? 'Creating...' : 'Submit PO'}
                </button>
              )}
            </div>
          </div>
        }
      >
        {step === 1 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Vendor</label>
              <select
                value={form.vendor_id}
                onChange={(event) => setForm((current) => ({ ...current, vendor_id: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
              >
                <option value="">Select vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Expected Delivery</label>
              <input
                type="date"
                value={form.expected_delivery}
                onChange={(event) => setForm((current) => ({ ...current, expected_delivery: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {form.line_items.map((item, index) => (
              <div key={`${index}-${item.product_id}`} className="grid gap-4 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Product</label>
                  <select
                    value={item.product_id}
                    onChange={(event) => updateLineItem(index, 'product_id', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.sku})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(event) => updateLineItem(index, 'quantity', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Unit Price</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(event) => updateLineItem(index, 'unit_price', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    disabled={form.line_items.length === 1}
                    className="rounded-xl border border-rose-200 dark:border-rose-900/50 px-4 py-3 text-sm font-semibold text-rose-700 dark:text-rose-400 disabled:border-slate-200 dark:border-slate-700 disabled:text-slate-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <button type="button" onClick={addLineItem} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Add Line Item
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
