const smartTest = process.env.MOTIF_SMART_PANEL
  ? require('./lib/smart-panel/test-environment').assertTestEnvironment()
  : null;
const express = require('express');
const cors = require('cors');
const prisma = require('./lib/prisma');
const productSchema = require('./lib/prepare-products');
const contentSchema = require('./lib/prepare-content');

const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const paymentRouter = require('./routes/payment');

const app = express();
app.use(cors());
app.use(express.json({limit:'256kb'}));

app.get('/health', async (req, res) => {
  try { await contentSchema.ready(prisma);res.json({ok:true,contentReady:true}); }
  catch { res.status(503).json({ok:false,contentReady:false}); }
});
app.use(require('./routes/storefront'));
app.use(express.static('public', { setHeaders(res, path) {
  if (path.endsWith('/admin.html')) {
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "frame-ancestors 'none'");
  }
} }));
app.use('/api', (req, res, next) => { res.set('X-Robots-Tag', 'noindex'); next(); });
app.use('/api/admin/session', require('./routes/admin-session')(require('./middleware/requireAdmin').sessions));
if (smartTest) {
  const requireAdmin = require('./middleware/requireAdmin');
  const panel = require('./routes/smart-panel');
  app.use('/api/admin/smart-panel', requireAdmin, panel.createRouter(prisma, smartTest));
  app.use('/smart-panel', panel.assets());
}
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/site', require('./routes/site-content'));
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payment', paymentRouter);

app.use((req, res) => res.status(404).type('html').send(require('./lib/storefront').errorPage('صفحه پیدا نشد')));

app.use((err, req, res, next) => {
  if (req.path.startsWith('/api/admin/session')) {
    console.error('Admin session request failed', err.code || err.type || 'UNKNOWN');
    const status = err.statusCode || 500;
    return res.status(status).json({ error: status >= 500 ? 'بررسی نشست موقتاً ممکن نیست.' : 'درخواست نشست نامعتبر است.' });
  }
  if (req.path.startsWith('/api/admin/smart-panel')) {
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    return res.status(status).json({ code: 'INVALID_REQUEST', error: 'درخواست پنل آزمایشی معتبر نیست.' });
  }
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'خطای سرور' });
});

const PORT = process.env.PORT || 4000;
// Startup is the final guard even when platform pre-deploy hooks are skipped.
(async () => {
  if (smartTest) await require('./lib/smart-panel/test-environment').verifyTestDatabase(prisma, smartTest);
  await productSchema.prepare(prisma);
  await contentSchema.prepare(prisma);
  require('./lib/admin-session').settings(process.env);
  await prisma.adminSession.findFirst({ select: { tokenHash: true } });
  console.log('Content schema readiness verified');
  const listening = () => console.log(`سرور روی پورت ${PORT} اجرا شد`);
  if (smartTest) app.listen(smartTest.port, '127.0.0.1', listening);
  else app.listen(PORT, listening);
})().catch(err=>{
  console.error('Content schema preparation failed',err.code||'UNKNOWN');
  process.exitCode=1;
  prisma.$disconnect();
});

