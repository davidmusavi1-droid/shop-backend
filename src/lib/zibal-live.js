const { createZibalGateway } = require('./zibal');

const callback = 'https://motifdress.com/api/payment/verify';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function configureLiveZibal(env, fetchImpl = fetch) {
  if (env.NODE_ENV !== 'production' || env.MOTIF_CHECKOUT_PREVIEW !== 'true' ||
      env.MOTIF_ZIBAL_PROVIDER !== 'live') return null;
  const merchant = env.ZIBAL_MERCHANT?.trim();
  const orderId = env.MOTIF_ZIBAL_PILOT_ORDER_ID?.trim();
  const maxTomans = Number(env.MOTIF_ZIBAL_PILOT_MAX_TOMANS);
  if (!merchant || /^(zibal|mock)$/i.test(merchant) || !uuid.test(orderId || '') ||
      env.ZIBAL_CALLBACK_URL !== callback ||
      !Number.isSafeInteger(maxTomans) || maxTomans < 1 || maxTomans > 2147483647) return null;
  const gateway = createZibalGateway({
    merchant,
    callbackUrl: callback,
    async transport(url, payload) {
      const response = await fetchImpl(url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw Error('Zibal HTTP request failed');
      const data = await response.json();
      if (!data || typeof data !== 'object' || !Number.isInteger(data.result)) {
        throw Error('Invalid Zibal response');
      }
      return data;
    },
  });
  return { orderId, maxTomans, gateway };
}

module.exports = { configureLiveZibal };
