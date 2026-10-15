const express = require('express');
const cors = require('cors');
const prisma = require('./lib/prisma');
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
app.use(express.static('public'));
app.use('/api', (req, res, next) => { res.set('X-Robots-Tag', 'noindex'); next(); });
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/site', require('./routes/site-content'));
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payment', paymentRouter);

app.use((req, res) => res.status(404).type('html').send(require('./lib/storefront').errorPage('صفحه پیدا نشد')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'خطای سرور' });
});

const PORT = process.env.PORT || 4000;
// Startup is the final guard even when platform pre-deploy hooks are skipped.
contentSchema.prepare(prisma).then(()=>{
  console.log('Content schema readiness verified');
  app.listen(PORT, () => console.log(`سرور روی پورت ${PORT} اجرا شد`));
}).catch(err=>{
  console.error('Content schema preparation failed',err.code||'UNKNOWN');
  process.exitCode=1;
  prisma.$disconnect();
});
