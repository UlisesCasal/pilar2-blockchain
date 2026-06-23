const COORDINATOR = '/api/coordinator';
const POOL = '/api/pool';

function getToken() {
  return localStorage.getItem('auth_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  login: (entity, password) =>
    fetch(`${COORDINATOR}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, password }),
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Login failed');
      return data;
    }),

  getMe: () =>
    fetch(`${COORDINATOR}/auth/me`, {
      headers: authHeaders(),
    }).then(async (r) => {
      if (!r.ok) throw new Error('Unauthorized');
      return r.json();
    }),

  getStatus: () => fetchJSON(`${COORDINATOR}/status`),
  getChain: () => fetchJSON(`${COORDINATOR}/chain`),
  getBlock: (hash) => fetchJSON(`${COORDINATOR}/chain/${hash}`),
  getLot: (lotId) => fetchJSON(`${COORDINATOR}/chain/lot/${lotId}`),
  getEntities: () => fetchJSON(`${COORDINATOR}/entities`),
  signTransaction: (transaction) =>
    fetch(`${COORDINATOR}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ transaction }),
    }).then((r) => r.json()),
  submitTransaction: (tx) =>
    fetch(`${POOL}/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tx),
    }).then((r) => r.json()),
  getPoolStatus: () => fetchJSON(`${POOL}/status`),
  getPending: () => fetchJSON(`${POOL}/pending`),
  getPendingByLot: (lotId) => fetchJSON(`${POOL}/pending/lot/${lotId}`),
  triggerMining: () =>
    fetch(`${POOL}/mine`, { method: 'POST' }).then((r) => r.json()),
  getScaleStatus: () => fetchJSON(`${POOL}/scale/status`),
  getRabbitStatus: () => fetchJSON(`${COORDINATOR}/rabbitmq/status`),
};
