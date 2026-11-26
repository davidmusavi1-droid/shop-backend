const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function paymentResult(result, { orderNumber, sandbox = false, mock = false } = {}) {
  const paid = result.status === 'PAID';
  const expired = result.status === 'EXPIRED';
  const failed = result.code === 'RETRY_AVAILABLE';
  const label = sandbox ? 'پرداخت آزمایشی زیبال' : mock ? 'پرداخت آزمایشی' : 'پرداخت';
  const title = paid ? label + ' تأیید شد' : expired ? 'رزرو سفارش منقضی شد' : failed ? 'پرداخت تأیید نشد' : label + ' تأیید نشده؛ نتیجه در حال بررسی است';
  const message = paid ? 'پرداخت از سمت سرور تأیید و در سفارش ثبت شد.' : expired ? 'برای خرید دوباره، سفارش تازه ثبت کنید.' : failed ? 'پرداخت موفقی برای این تلاش تأیید نشده است.' : 'دوباره پرداخت نکنید؛ نتیجه نهایی هنوز تأیید نشده است.';
  return '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>نتیجه پرداخت | MOTIF</title><style>body{margin:0;padding:24px;background:#0e1826;color:#fff;font-family:Tahoma,sans-serif;line-height:1.9}main{max-width:620px;margin:40px auto}h1{font-size:1.6rem}code{overflow-wrap:anywhere}a{color:#fff}</style><main><p>MOTIF' + (sandbox || mock ? ' · محیط آزمایشی' : '') + '</p><h1>' + title + '</h1><p>' + message + '</p>' + (orderNumber ? '<p>شماره سفارش: <code dir="ltr">' + escape(orderNumber) + '</code></p>' : '') + '<a href="/cart">بازگشت به فروشگاه و سبد خرید</a></main></html>';
}
module.exports = { paymentResult };
