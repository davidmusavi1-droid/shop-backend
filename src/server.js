const express = require('express');
const cors = require('cors');

const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const paymentRouter = require('./routes/payment');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
app.use(require('./routes/storefront'));
app.use(express.static('public'));
app.use('/api', (req, res, next) => { res.set('X-Robots-Tag', 'noindex'); next(); });
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payment', paymentRouter);

app.use((req, res) => res.status(404).type('html').send(require('./lib/storefront').errorPage('صفحه پیدا نشد')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'خطای سرور' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`سرور روی پورت ${PORT} اجرا شد`));
