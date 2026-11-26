// Official contract: https://kavenegar.com/rest.html#verifylookup
// No network request occurs until the owner-approved SMS switch is enabled.
function liveTrackingReady(env = process.env) {
  return env.MOTIF_TRACKING_PROVIDER === 'kavenegar' &&
    env.MOTIF_TRACKING_SMS_ENABLED === 'true' &&
    typeof env.MOTIF_TRACKING_OTP_SECRET === 'string' && env.MOTIF_TRACKING_OTP_SECRET.length >= 32 &&
    /^[a-z0-9-]{1,100}$/i.test(env.KAVENEGAR_TEMPLATE || '') &&
    /^[a-z0-9]{20,256}$/i.test(env.KAVENEGAR_API_KEY || '');
}
function createKavenegarProvider(env = process.env, transport = globalThis.fetch) {
  if (!liveTrackingReady(env)) return null;
  const key = env.KAVENEGAR_API_KEY, template = env.KAVENEGAR_TEMPLATE;
  return { async send({ receptor, token }) {
    if (!liveTrackingReady(env) || !/^09\d{9}$/.test(receptor) || !/^\d{6}$/.test(token)) throw Error('SMS unavailable');
    try {
      const response = await transport('https://api.kavenegar.com/v1/' + key + '/verify/lookup.json', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ receptor, token, template, type: 'sms' }).toString(),
      });
      const data = await response.json();
      if (!response.ok || data?.return?.status !== 200 ||
          !Array.isArray(data.entries) || data.entries.length !== 1 ||
          !Number.isSafeInteger(data.entries[0].messageid) || data.entries[0].messageid <= 0) throw Error();
      // Never retain/log the provider response: it contains the OTP and phone.
    } catch { throw Error('SMS unavailable'); } // No retry: timeout may already have incurred a charge.
  } };
}
module.exports = { liveTrackingReady, createKavenegarProvider };
