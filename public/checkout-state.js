(function(root){
  'use strict';
  const slot='motif-pending-checkout';
  async function request(body,storage){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
    const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    let saved;try{saved=JSON.parse(storage.getItem(slot));}catch{}
    const key=saved?.hash===hash && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.key||'')?saved.key:crypto.randomUUID();
    // Save before POST. A reload after a lost response reuses the same key.
    // Persist only a fingerprint and random capability, never the address/phone.
    storage.setItem(slot,JSON.stringify({hash,key}));
    return {key};
  }
  const api={request,complete:storage=>storage.removeItem(slot)};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MotifCheckoutState=api;
})(typeof window==='object'?window:globalThis);
