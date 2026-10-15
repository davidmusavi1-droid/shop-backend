const express = require('express');
const prisma = require('../lib/prisma');
const view = require('../lib/storefront');
const router = express.Router();
const query = {where:{isActive:true,variants:{some:{stock:{gt:0}}}},include:{variants:true},orderBy:{createdAt:'desc'}};
router.get('/index.html', (req,res)=>res.redirect(301,'/'));
router.get('/robots.txt', (req,res)=>res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: '+view.ORIGIN+'/sitemap.xml\n'));
router.get('/sitemap.xml',async(req,res)=>{
  res.set('Cache-Control','no-store');
  try {res.type('application/xml').send(view.sitemap(await prisma.product.findMany(query)));}
  catch(err){console.error('Sitemap generation failed');res.status(503).type('text/plain').send('Sitemap temporarily unavailable');}
});
router.get('/',async(req,res)=>{
  res.set('Cache-Control','no-store');
  try {res.type('html').send(view.renderHome(await prisma.product.findMany(query)));}
  catch(err){console.error('Catalog rendering failed');res.status(503).type('html').send(view.errorPage('دریافت محصولات موقتاً ممکن نیست'));}
});
router.get('/products/:id',async(req,res)=>{
  res.set('Cache-Control','no-store');
  try {
    const p=await prisma.product.findUnique({where:{id:req.params.id},include:{variants:true}});
    if(!p||!view.inStock(p))return res.status(404).type('html').send(view.errorPage('محصول موجود یا قابل نمایش نیست'));
    if(req.path.endsWith('/'))return res.redirect(301,view.productPath(p.id));
    res.type('html').send(view.renderProduct(p));
  }catch(err){console.error('Product rendering failed');res.status(503).type('html').send(view.errorPage('دریافت محصول موقتاً ممکن نیست'));}
});
module.exports=router;
