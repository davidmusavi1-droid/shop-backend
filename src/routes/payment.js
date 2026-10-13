const express = require('express');
const router = express.Router();

// Fail closed until a real gateway request and server-side verification are implemented.
function unavailable(req, res) {
  return res.status(503).json({ error: 'درگاه پرداخت هنوز فعال نشده است', code: 'PAYMENT_NOT_CONFIGURED' });
}
router.post('/request/:orderId', unavailable);
router.get('/verify', unavailable);
module.exports = router;
