// Base URL: use empty string so nginx proxy handles /api/* in production,
// fall back to explicit host for local dev outside Docker.
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function request(path, options = {}) {
  const url = BASE_URL ? `${BASE_URL}${path}` : path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw Object.assign(new Error(error.detail || 'Request failed'), { status: res.status, data: error });
  }
  return res.json();
}

export const getProducts = () => request('/api/products');
export const getProduct = (id) => request(`/api/products/${id}`);
export const placeOrder = (body) => request('/api/orders', { method: 'POST', body: JSON.stringify(body) });
export const getOrder = (id) => request(`/api/orders/${id}`);
export const getOrders = () => request('/api/orders');
