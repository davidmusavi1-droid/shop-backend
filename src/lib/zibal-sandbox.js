const { createZibalGateway } = require('./zibal');

const callbackPath = '/api/payment/sandbox/verify';

function sandboxSettings(env) {
  if (env.NODE_ENV !== 'test' || env.MOTIF_CHECKOUT_PREVIEW !== 'true' ||
      env.MOTIF_ZIBAL_PROVIDER !== 'sandbox' || env.ZIBAL_MERCHANT || env.ZIBAL_CALLBACK_URL) {
    throw Error('Invalid Zibal sandbox configuration');
  }
  const origin = new URL(env.MOTIF_ZIBAL_SANDBOX_ORIGIN);
  const database = new URL(env.DATABASE_URL);
  const productionHost = origin.hostname === 'motifdress.com' || origin.hostname.endsWith('.motifdress.com');
  const isolatedDatabase = database.hostname === 'motif-checkout-test-db' && database.pathname === '/postgres' ||
    ['localhost', '127.0.0.1'].includes(database.hostname) && database.pathname === '/motif_sandbox';
  const maxTomans = Number(env.MOTIF_ZIBAL_SANDBOX_MAX_TOMANS);
  if (origin.protocol !== 'https:' || origin.href !== origin.origin + '/' || origin.username || origin.password ||
      productionHost || env.ADMIN_ORIGIN !== origin.origin ||
      !['postgres:', 'postgresql:'].includes(database.protocol) || !isolatedDatabase || database.search || database.hash ||
      (database.port && database.port !== '5432') ||
      !Number.isSafeInteger(maxTomans) || maxTomans < 1 || maxTomans > 2147483647) {
    throw Error('Zibal sandbox requires an isolated database and HTTPS origin');
  }
  return { callbackUrl: origin.origin + callbackPath, maxTomans };
}

function assertSandboxEnvironment(env) {
  if (env.MOTIF_ZIBAL_PROVIDER === 'sandbox') sandboxSettings(env);
}

function configureSandboxZibal(env, fetchImpl = fetch) {
  let settings;
  try { settings = sandboxSettings(env); }
  catch { return null; }
  const gateway = createZibalGateway({
    // Zibal's official Drupal plugin selects this merchant in test mode.
    merchant: 'zibal',
    callbackUrl: settings.callbackUrl,
    async transport(url, payload) {
      const response = await fetchImpl(url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw Error('Zibal sandbox HTTP request failed');
      const data = await response.json();
      if (!data || typeof data !== 'object' || !Number.isInteger(data.result)) {
        throw Error('Invalid Zibal sandbox response');
      }
      return data;
    },
  });
  return { ...settings, gateway };
}

module.exports = { assertSandboxEnvironment, configureSandboxZibal };
