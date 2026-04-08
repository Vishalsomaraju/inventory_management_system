import api from './axios';

export const fetchAllScorecards = async () => {
  const response = await api.get('/vendors/scorecards');
  return response.data;
};

export const fetchVendorScorecard = async (vendorId) => {
  const response = await api.get(`/vendors/${vendorId}/scorecard`);
  return response.data;
};

export const fetchVendorPriceHistory = async (vendorId) => {
  const response = await api.get(`/vendors/${vendorId}/price-history`);
  return response.data;
};
