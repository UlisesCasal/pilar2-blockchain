const COORDINATOR = '/api/coordinator';
const POOL = '/api/pool';

export async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  getStatus: () => fetchJSON(`${COORDINATOR}/status`),
  getChain: () => fetchJSON(`${COORDINATOR}/chain`),
  getBlock: (hash) => fetchJSON(`${COORDINATOR}/chain/${hash}`),
  getLot: (lotId) => fetchJSON(`${COORDINATOR}/chain/lot/${lotId}`),
  getEntities: () => fetchJSON(`${COORDINATOR}/entities`),
  signTransaction: (entity, transaction) =>
    fetch(`${COORDINATOR}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, transaction }),
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
