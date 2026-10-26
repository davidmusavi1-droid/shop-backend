// Read-only production check. No customer data or account credentials needed.
(async () => {
  const health = await fetch('https://motifdress.com/health', { signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store' });
  if (health.status !== 200) throw Error('Health status ' + health.status);
  const body = await health.json();
  if (body.ok !== true || body.contentReady !== true) throw Error('Database readiness failed');
  const home = await fetch('https://motifdress.com/', { signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store' });
  if (home.status !== 200 || !(await home.text()).includes('MOTIF')) throw Error('Storefront unavailable');
  console.log('PASS: MOTIF HTTPS health, database readiness and home');
})().catch(() => { console.error('MOTIF availability check failed'); process.exitCode = 1; });
