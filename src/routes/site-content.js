const router=require('express').Router();
const requireAdmin=require('../middleware/requireAdmin');
const content=require('../lib/site-content');
function error(err,res,next) {
  if(['P2021','P2022'].includes(err.code))return res.status(503).json({error:'جدول تنظیمات آماده نیست؛ راهنمای استقرار مدیریت صفحهٔ اصلی را اجرا کنید.'});
  if(['P2034','P2002'].includes(err.code))return res.status(409).json({error:'تنظیمات تغییر کرده؛ دوباره بارگذاری کنید.'});
  if(!err.statusCode)return res.status(503).json({error:'دریافت یا ذخیرهٔ تنظیمات موقتاً ممکن نیست؛ دوباره تلاش کنید.'});
  next(err);
}
router.get('/',async(req,res,next)=>{res.set('Cache-Control','no-store');try{res.json(await content.published());}catch(err){error(err,res,next);}});
router.get('/admin',requireAdmin,async(req,res,next)=>{res.set('Cache-Control','no-store');try{res.json(await content.getAdmin());}catch(err){error(err,res,next);}});
for(const action of ['draft','publish','restore'])router.post('/admin/'+action,requireAdmin,async(req,res,next)=>{
  res.set('Cache-Control','no-store');try{res.json(await content.change(action,req.body));}catch(err){error(err,res,next);}
});
module.exports=router;
