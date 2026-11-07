// Node has no browser cookie jar. Use the same login and CSRF flow in release checks.
async function loginAdmin(base, password, origin = base) {
  const response = await fetch(base + '/api/admin/session/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }), signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw Error('Admin login failed (HTTP ' + response.status + ')');
  return {
    Origin: origin,
    Cookie: response.headers.get('Set-Cookie').split(';')[0],
    'X-Admin-CSRF': (await response.json()).csrf,
  };
}

module.exports = { loginAdmin };
