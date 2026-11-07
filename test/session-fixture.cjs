function memoryDb() {
  const rows = new Map();
  function matches(row, filter) {
    return Object.entries(filter).every(([field, rule]) => {
      if (field === 'OR') return rule.some(condition => matches(row, condition));
      if (typeof rule === 'string') return row[field] === rule;
      return Object.entries(rule).every(([op, value]) =>
        op === 'gt' ? row[field] > value : op === 'lt' ? row[field] < value : row[field] <= value);
    });
  }
  const selected = where => [...rows.values()].filter(row => matches(row, where));
  return {
    rows,
    $transaction: ops => Promise.all(ops),
    adminSession: {
      findFirst: async ({ where }) => selected(where)[0] ?? null,
      updateMany: async ({ where, data }) => {
        const matched = selected(where);
        for (const row of matched) rows.set(row.tokenHash, { ...row, ...data });
        return { count: matched.length };
      },
      deleteMany: async ({ where }) => {
        const matched = selected(where);
        for (const row of matched) rows.delete(row.tokenHash);
        return { count: matched.length };
      },
      create: async ({ data }) => rows.set(data.tokenHash, data),
    },
  };
}

async function mockBrowserSession(page) {
  let active = false;
  await page.route('**/api/admin/session**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/login')) active = true;
    if (!active) return route.fulfill({ status: 401, json: { code: 'SESSION_REQUIRED' } });
    if (path.endsWith('/logout')) {
      active = false;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: { csrf: 'test-csrf', recoveryKey: 'motif-admin-recovery-v2-test', remainingMs: 3_600_000 } });
  });
}

module.exports = { memoryDb, mockBrowserSession };
