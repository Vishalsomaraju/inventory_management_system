import api from './axios';

export const fetchAutoReorderPreview = async () => {
  const response = await api.get('/purchase-orders/auto-reorder/preview');
  return response.data;
};

export const executeAutoReorder = async () => {
  const response = await api.post('/purchase-orders/auto-reorder');
  return response.data;
};

export const approvePO = async (id) => {
  const response = await api.patch(`/purchase-orders/${id}/approve`);
  return response.data;
};

export const receivePO = async (id) => {
  const response = await api.patch(`/purchase-orders/${id}/receive`);
  return response.data;
};

export const fetchAutoPOs = async () => {
  const response = await api.get('/purchase-orders', {
    params: { source: 'auto' }
  });
  return response.data;
};
