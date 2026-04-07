import api from './axios';


function redirectToLogin() {
  localStorage.removeItem('token');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}


function withAuthHeaders(config = {}) {
  const token = localStorage.getItem('token');
  return {
    ...config,
    headers: {
      ...(config.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}


function normalizeError(error, fallback) {
  if (error?.response?.status === 401) {
    redirectToLogin();
  }

  const detail =
    error?.response?.data?.detail ||
    error?.response?.data?.error ||
    error?.message ||
    fallback;

  return new Error(detail);
}


export async function fetchPnL(year) {
  try {
    const response = await api.get('/analytics/pnl', withAuthHeaders({ params: { year } }));
    return response.data;
  } catch (error) {
    throw normalizeError(error, 'Failed to fetch P&L dashboard');
  }
}


export async function fetchPnLCategories(year, month) {
  try {
    const params = month ? { year, month } : { year };
    const response = await api.get('/analytics/pnl/categories', withAuthHeaders({ params }));
    return response.data;
  } catch (error) {
    throw normalizeError(error, 'Failed to fetch category breakdown');
  }
}
