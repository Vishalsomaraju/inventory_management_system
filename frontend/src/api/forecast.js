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


export async function fetchDemandForecast(monthsAhead = 3) {
  try {
    const response = await api.get(
      '/forecast/demand',
      withAuthHeaders({ params: { months_ahead: monthsAhead } }),
    );
    return response.data;
  } catch (error) {
    throw normalizeError(error, 'Failed to fetch demand forecast');
  }
}


export async function fetchSeasonalCalendar() {
  try {
    const response = await api.get('/forecast/seasonal-calendar', withAuthHeaders());
    return response.data;
  } catch (error) {
    throw normalizeError(error, 'Failed to fetch seasonal calendar');
  }
}
