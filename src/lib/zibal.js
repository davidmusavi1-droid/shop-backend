const origin = 'https://gateway.zibal.ir';

function toRials(tomans) {
  if (!Number.isSafeInteger(tomans) || tomans <= 0 || !Number.isSafeInteger(tomans * 10)) {
    throw new RangeError('Invalid payment amount');
  }
  return tomans * 10;
}

function trackId(value) {
  const digits = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return typeof digits === 'string' && /^[1-9]\d{0,15}$/.test(digits) && Number.isSafeInteger(Number(digits)) ? digits : null;
}

// Official v1 request, verify and inquiry. The application only wires the mock transport.
function createZibalGateway({ merchant, callbackUrl, transport }) {
  const invoke = (operation, values) => transport(origin + '/v1/' + operation, { merchant, ...values });
  return {
    request(amount) { return invoke('request', { amount, callbackUrl }); },
    verify(id) { return invoke('verify', { trackId: Number(id) }); },
    inquiry(id) { return invoke('inquiry', { trackId: Number(id) }); },
    redirect(id) { return origin + '/start/' + id; },
  };
}

module.exports = { toRials, trackId, createZibalGateway };
