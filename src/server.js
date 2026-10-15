const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requestContext, errorHandler, logEvent } = require('./lib/http-security');
const prisma = require('./lib/prisma');
const contentSchema = require('./lib/prepare-content');

const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const paymentRouter = require('./routes/payment');

const app = express();
app.disable('x-powered-by');
// Railway terminates HTTPS at its reverse proxy. Never trust arbitrary hops.
app.set('trust proxy', 1);
app.use(requestContext);
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید' } }));
app.use(express.json({limit:'256kb'}));

app.get('/health', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { await contentSchema.ready(prisma);res.json({ok:true,contentReady:true}); }
  catch { res.status(503).json({ok:false,contentReady:false}); }
});
app.use(require('./routes/storefront'));
app.use(express.static('public'));
app.use('/api', (req, res, next) => { res.set('X-Robots-Tag', 'noindex'); next(); });
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/site', require('./routes/site-content'));
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payment', paymentRouter);

app.use((req, res) => res.status(404).type('html').send(require('./lib/storefront').errorPage('صفحه پیدا نشد')));

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
// Startup is the final guard even when platform pre-deploy hooks are skipped.
contentSchema.prepare(prisma).then(()=>{
  console.log('Content schema readiness verified');
  const server = app.listen(PORT, () => logEvent('server_started'));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  let stopping = false;
  function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    logEvent('server_stopping', { signal });
    const deadline = setTimeout(() => process.exit(1), 25000);
    deadline.unref();
    server.close(async () => {
      try { await prisma.$disconnect(); clearTimeout(deadline); }
      catch { process.exitCode = 1; }
    });
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}).catch(err=>{
  console.error('Content schema preparation failed',err.code||'UNKNOWN');
  process.exitCode=1;
  prisma.$disconnect();
});
