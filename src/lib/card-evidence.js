const {createHash}=require('node:crypto');
const {fail}=require('./checkout');
function trackingCode(value){
 if(value===undefined||value==='')return null;
 if(typeof value!=='string')throw fail(400,'کد رهگیری بانکی نامعتبر است');
 const code=value.trim().replace(/[۰-۹٠-٩]/g,d=>String(d.charCodeAt(0)-(d>='۰'?0x6f0:0x660)));
 if(!/^[0-9]{6,40}$/.test(code))throw fail(400,'کد رهگیری بانکی باید ۶ تا ۴۰ رقم باشد');
 return code;
}
const digest=receipt=>receipt?createHash('sha256').update(receipt).digest('hex'):null;
function same(previous,code,hash){return (previous.bankTrackingCode||null)===code&&(previous.receiptDigest||digest(previous.receipt))===hash;}
module.exports={trackingCode,digest,same};
