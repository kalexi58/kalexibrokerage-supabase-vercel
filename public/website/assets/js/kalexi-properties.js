(function(){
"use strict";
const API="/api/website";
const fallback="../website/assets/images/hero-kalexi-brokerage.webp";
const money=(v,c)=>v==null?"Price on request":new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(v)+" "+(c||"");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function load(){
 const r=await fetch(API,{headers:{"Accept":"application/json"}});
 if(!r.ok)throw new Error("Unable to load listings");
 const j=await r.json();return j.listings||[];
}
function card(p){
 const img=p.images?.[0]?.url||"assets/images/hero-kalexi-brokerage.webp";
 return `<article class="listing-card"><a href="property.html?id=${encodeURIComponent(p.id)}"><img loading="lazy" src="${esc(img)}" alt="${esc(p.title)}"><div class="body"><small>${esc(p.sector)} · ${esc(p.location||"Uganda")}</small><h3>${esc(p.title)}</h3><p class="listing-price">${esc(money(p.price,p.currency))}</p><p>${esc((p.description||"").slice(0,150))}</p><strong>View details →</strong></div></a></article>`;
}
async function renderList(){
 const host=document.querySelector("[data-property-list]");
 if(!host)return;
 try{const items=await load();host.innerHTML=items.length?items.map(card).join(""):'<div class="public-empty">There are currently no published properties. Please check again soon.</div>';}
 catch(e){host.innerHTML='<div class="public-empty">Listings are temporarily unavailable. Please contact Kalexi Brokerage.</div>';}
}
async function renderDetail(){
 const host=document.getElementById("property-detail");if(!host)return;
 try{
 const id=new URLSearchParams(location.search).get("id");if(!id)throw new Error();
 const r=await fetch(API+"?id="+encodeURIComponent(id));const j=await r.json();const p=j.listings?.[0];if(!p)throw new Error();
 host.innerHTML=`<h1>${esc(p.title)}</h1><p>${esc(p.sector)} · ${esc(p.location||"Uganda")}</p><h2>${esc(money(p.price,p.currency))}</h2><div class="detail-grid">${(p.images||[]).map(i=>`<img src="${esc(i.url)}" alt="${esc(i.caption||p.title)}">`).join("")}</div><p>${esc(p.description||"Contact Kalexi Brokerage for further details.")}</p><p>Availability: ${esc(p.availability||"Subject to confirmation")}</p><a class="btn btn--primary" href="contact.html?interest=${encodeURIComponent(p.title)}">Enquire about this opportunity</a>`;
 }catch(e){host.innerHTML="<h1>Listing unavailable</h1><p>This opportunity may have been withdrawn.</p>";}
}
async function showroom(){
 const photo=document.getElementById("photo");if(!photo)return;
 const details=document.getElementById("details");const counter=document.getElementById("counter");
 let items=[],index=0;
 async function refresh(){
  try{items=await load();if(!items.length){details.innerHTML="<h1>No published opportunities yet</h1><p>New verified Kalexi listings will appear here automatically.</p>";photo.removeAttribute("src");counter.textContent="Waiting for listings";return;}index=index%items.length;show();}
  catch(e){details.innerHTML="<h1>Showroom connection unavailable</h1><p>Please check the system connection.</p>";}
 }
 function show(){
  const p=items[index];const img=p.images?.[0]?.url;
  photo.style.opacity="0";
  setTimeout(()=>{if(img)photo.src=img;else photo.removeAttribute("src");photo.alt=p.title;details.innerHTML=`<p>${esc(p.sector)} · ${esc(p.location||"Uganda")}</p><h1>${esc(p.title)}</h1><div id="price">${esc(money(p.price,p.currency))}</div><p>${esc(p.description||"Contact Kalexi Brokerage for details.")}</p><p>Availability: ${esc(p.availability||"Subject to confirmation")}</p>`;photo.style.opacity="1";},350);
  counter.textContent=`Opportunity ${index+1} of ${items.length}`;
 }
 await refresh();
 setInterval(()=>{if(items.length){index=(index+1)%items.length;show();}},9000);
 setInterval(refresh,60000);
}
document.addEventListener("DOMContentLoaded",()=>{renderList();renderDetail();showroom();});
})();
