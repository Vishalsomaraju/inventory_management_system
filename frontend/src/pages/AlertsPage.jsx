import { useEffect, useState } from 'react';

import api from '../api/axios';
import { HeaderSkeleton, TableSkeleton } from '../components/Skeleton';
import Toast from '../components/Toast';


function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.detail || fallback;
}


export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const loadAlerts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/inventory/alerts');
      setAlerts(response.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load alerts'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const handleResolve = async (alertId) => {
    try {
      await api.put(`/inventory/alerts/${alertId}/resolve`);
      setToast({ show: true, type: 'success', message: 'Alert resolved successfully' });
      await loadAlerts();
    } catch (resolveError) {
      setToast({ show: true, type: 'error', message: getErrorMessage(resolveError, 'Failed to resolve alert') });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <HeaderSkeleton hasButton={false} />
        <TableSkeleton rows={5} cols={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toast {...toast} onClose={() => setToast((current) => ({ ...current, show: false }))} />

      <div className="rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Active Alerts</h2>
        <p className="text-sm text-slate-500">Resolve low stock alerts after the issue has been handled.</p>
      </div>

      {error ? <div className="rounded-2xl bg-rose-50 dark:bg-rose-900/20 px-5 py-4 text-sm text-rose-700 dark:text-rose-400">{error}</div> : null}

      <div className="overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                {['Product Name', 'SKU', 'Current Stock', 'Reorder Level', 'Triggered At', 'Actions'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{alert.product_name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{alert.sku}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{alert.current_stock}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{alert.reorder_level}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {alert.triggered_at ? new Date(alert.triggered_at).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => handleResolve(alert.id)} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                      Resolve
                    </button>
                  </td>
                </tr>
              ))}
              {!alerts.length ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-500">
                    No active alerts.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
