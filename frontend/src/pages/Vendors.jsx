import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

const Vendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ message: '', type: '' });
  
  // Modal states: { type: 'add'|'edit'|'delete'|null, vendor: null }
  const [modalState, setModalState] = useState({ type: null, vendor: null });

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/vendors');
      setVendors(response.data);
    } catch (err) {
      showToast('Failed to load vendors', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: '' }), 4000);
  };

  const close = () => setModalState({ type: null, vendor: null });

  return (
    <div className="space-y-6 relative">
      {/* Toast */}
      {toast.message && (
        <div className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 flex items-center gap-2 transition-opacity ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">Vendor Management</h2>
        <button
          onClick={() => setModalState({ type: 'add', vendor: null })}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Vendor
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">Company Name</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">Contact Person</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">Phone</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">Email</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600">Payment Terms</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600 text-center">Products</th>
                <th className="py-3 px-6 text-sm font-semibold text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-gray-500">
                    <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle strokeWidth="4" stroke="currentColor" r="10" cy="12" cx="12" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75"></path></svg>
                    Loading vendors...
                  </td>
                </tr>
              ) : vendors.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-gray-500">No vendors found.</td>
                </tr>
              ) : (
                vendors.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6 font-medium text-gray-800">{vendor.name}</td>
                    <td className="py-4 px-6 text-gray-600">{vendor.contact_person || '—'}</td>
                    <td className="py-4 px-6 text-gray-600">{vendor.phone || '—'}</td>
                    <td className="py-4 px-6 text-gray-600">{vendor.email || '—'}</td>
                    <td className="py-4 px-6 text-gray-600">{vendor.payment_terms || '—'}</td>
                    <td className="py-4 px-6 text-center">
                      <span className="inline-flex items-center justify-center bg-gray-100 text-gray-600 font-bold px-2 py-1 rounded w-8">
                        {vendor.products_count || 0}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setModalState({ type: 'edit', vendor })}
                          className="text-gray-400 hover:text-blue-600 p-2 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                        <button
                          onClick={() => setModalState({ type: 'delete', vendor })}
                          className="text-gray-400 hover:text-red-600 p-2 transition-colors"
                          title="Delete"
                        >
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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

      {modalState.type && (
        <VendorModal 
          modalState={modalState} 
          close={close} 
          onSuccess={(msg) => { fetchVendors(); showToast(msg); close(); }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
    </div>
  );
};

// ============================================
// Internal Modals Component
// ============================================
const VendorModal = ({ modalState, close, onSuccess, onError }) => {
  const { type, vendor } = modalState;
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(vendor || {
    name: '', contact_person: '', phone: '', email: '', payment_terms: '', address: ''
  });

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (type === 'delete') {
        await api.delete(`/vendors/${vendor.id}`);
        onSuccess('Vendor deleted successfully');
      } else if (type === 'add') {
        await api.post('/vendors', formData);
        onSuccess('Vendor added successfully');
      } else if (type === 'edit') {
        await api.put(`/vendors/${vendor.id}`, formData);
        onSuccess('Vendor updated successfully');
      }
    } catch (err) {
      if (type === 'delete' && err.response?.status === 400) {
        onError(err.response.data.detail || 'Cannot delete vendor because they have associated products.');
      } else {
        onError(err.response?.data?.detail || err.message || 'Operation failed');
      }
    } finally {
      setLoading(false);
    }
  };

  if (type === 'delete') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Vendor</h3>
          <p className="text-sm text-gray-500 mb-6">
            Are you sure you want to delete <strong>{vendor?.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex justify-center gap-3">
            <button onClick={close} className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 text-white font-medium rounded-lg bg-red-600 hover:bg-red-700 flex items-center disabled:opacity-50">
              {loading ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-bold text-gray-800">{type === 'add' ? 'Add Vendor' : 'Edit Vendor'}</h3>
          <button onClick={close} className="text-gray-400 hover:text-gray-600 transition-colors">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="col-span-2">
              <label className="block font-medium text-gray-700 mb-1">Company Name *</label>
              <input required name="name" value={formData.name} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block font-medium text-gray-700 mb-1">Contact Person</label>
              <input name="contact_person" value={formData.contact_person} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1">Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block font-medium text-gray-700 mb-1">Payment Terms</label>
              <input placeholder="e.g. Net 30" name="payment_terms" value={formData.payment_terms} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block font-medium text-gray-700 mb-1">Address</label>
              <textarea name="address" rows="2" value={formData.address || ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"></textarea>
            </div>
          </div>
          <div className="mt-8 flex gap-3 justify-end">
            <button type="button" onClick={close} className="px-5 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 flex items-center">
              {loading && <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>}
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Vendors;
