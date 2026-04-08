import api from './axios';

export const fetchAllScorecards = async () => {
  const response = await api.get('/vendors/scorecards');
  // Backend returns { vendors: [...] }
  return response.data?.vendors ?? response.data;
};

export const fetchVendorScorecard = async (vendorId) => {
  const response = await api.get(`/vendors/${vendorId}/scorecard`);
  return response.data;
};

export const fetchVendorPriceHistory = async (vendorId) => {
  const response = await api.get(`/vendors/${vendorId}/price-history`);
  // Backend returns { vendor_id, products: [{name, price_history: [{date, unit_price}]}] }
  // Flatten to array of { product_name, date, unit_price } for the pivot in VendorScorecard
  const products = response.data?.products ?? [];
  const flat = [];
  products.forEach(p => {
    (p.price_history ?? []).forEach(entry => {
      flat.push({ product_name: p.name, date: entry.date, unit_price: entry.unit_price });
    });
  });
  return flat;
};
