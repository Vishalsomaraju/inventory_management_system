import { useEffect, useState } from 'react';

import api from '../api/axios';
import Modal from '../components/Modal';
import { HeaderSkeleton, TableSkeleton } from '../components/Skeleton';
import Toast from '../components/Toast';


function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.detail || fallback;
}


function emptyVendorForm() {
  return {
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    payment_terms: '',
  };
}


export default function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [form, setForm] = useState(emptyVendorForm());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const loadVendors = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/vendors');
      setVendors(response.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load vendors'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVendors();
  }, []);

  const showToast = (message, type = 'success') => setToast({ show: true, type, message });

  const openCreateModal = () => {
    setEditingVendor(null);
    setForm(emptyVendorForm());
    setModalOpen(true);
  };

  const openEditModal = (vendor) => {
    setEditingVendor(vendor);
    setForm({
      name: vendor.name || '',
      contact_person: vendor.contact_person || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      payment_terms: vendor.payment_terms || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingVendor) {
        await api.put(`/vendors/${editingVendor.id}`, form);
        showToast('Vendor updated successfully');
      } else {
        await api.post('/vendors', form);
        showToast('Vendor created successfully');
      }
      setModalOpen(false);
      await loadVendors();
    } catch (saveError) {
      showToast(getErrorMessage(saveError, 'Failed to save vendor'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vendor) => {
    if (!window.confirm(`Delete vendor "${vendor.name}"?`)) {
      return;
    }

    try {
      await api.delete(`/vendors/${vendor.id}`);
      showToast('Vendor deleted successfully');
      await loadVendors();
    } catch (deleteError) {
      showToast(getErrorMessage(deleteError, 'Failed to delete vendor'), 'error');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <HeaderSkeleton />
        <TableSkeleton rows={5} cols={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toast {...toast} onClose={() => setToast((current) => ({ ...current, show: false }))} />

      <div className="flex items-center justify-between rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Vendors</h2>
          <p className="text-sm text-slate-500">Manage supplier records and contact details.</p>
        </div>
        <button type="button" onClick={openCreateModal} className="rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white">
          Add Vendor
        </button>
      </div>

      {error ? <div className="rounded-2xl bg-rose-50 dark:bg-rose-900/20 px-5 py-4 text-sm text-rose-700 dark:text-rose-400">{error}</div> : null}

      <div className="overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                {['Name', 'Contact Person', 'Phone', 'Email', 'Payment Terms', 'Actions'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendors.map((vendor) => (
                <tr key={vendor.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{vendor.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{vendor.contact_person || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{vendor.phone || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{vendor.email || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{vendor.payment_terms || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openEditModal(vendor)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(vendor)} className="rounded-lg border border-rose-200 dark:border-rose-900/50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!vendors.length ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-500">
                    No vendors found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        title={editingVendor ? 'Edit Vendor' : 'Add Vendor'}
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
              {saving ? 'Saving...' : 'Save Vendor'}
            </button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ['name', 'Name'],
            ['contact_person', 'Contact Person'],
            ['phone', 'Phone'],
            ['email', 'Email'],
            ['payment_terms', 'Payment Terms'],
          ].map(([field, label]) => (
            <div key={field} className={field === 'payment_terms' ? 'md:col-span-2' : ''}>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
              <input
                value={form[field]}
                onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm"
              />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
