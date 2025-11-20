
const LS_PLAN_LOCAL='eventflow_local_plan';
function lsGet(){ try{ return JSON.parse(localStorage.getItem(LS_PLAN_LOCAL)||'[]'); }catch(_){ return []; } }
function lsSet(a){ localStorage.setItem(LS_PLAN_LOCAL, JSON.stringify(a||[])); }
function addLocal(id){ const p=lsGet(); if(!p.includes(id)){ p.push(id); lsSet(p); } }
function removeLocal(id){ lsSet(lsGet().filter(x=>x!==id)); }

async function me(){ try{ const r=await fetch('/api/auth/me'); return (await r.json()).user; } catch(_){ return null; } }
async function listSuppliers(params={}){ const q=new URLSearchParams(params).toString(); const r=await fetch('/api/suppliers'+(q?('?'+q):'')); const d=await r.json(); return d.items||[]; }

function supplierCard(s,user){
  const img=(s.photos&&s.photos[0])||'/assets/images/collage-venue.svg';
  const showAddAccount = !!user && user.role==='customer';
  const alreadyLocal = lsGet().includes(s.id);
  const addBtn = showAddAccount
    ? `<button class="cta" data-add="${s.id}">Add to my plan</button>`
    : `<button class="cta" data-add-local="${s.id}" ${alreadyLocal?'disabled':''}>${alreadyLocal?'Added':'Add to my plan'}</button>`;
  return `<div class="card supplier-card">
    <img src="${img}" alt="${s.name} image"><div>
      <h3>${s.name}</h3>
      <div class="small">${s.location||''} · <span class="badge">${s.category}</span> ${s.price_display?`· ${s.price_display}`:''}</div>
      <p class="small">${s.description_short||''}</p>
      <div class="form-actions">${addBtn}<a class="cta secondary" href="/supplier.html?id=${encodeURIComponent(s.id)}">View details</a></div>
    </div></div>`;
}

async function initHome(){
  const wrap=document.getElementById('featured-packages'); if(!wrap) return;
  const r=await fetch('/api/packages/featured'); const d=await r.json(); const items=d.items||[];
  wrap.innerHTML = items.length? items.map(p=>`<div class="card pack">
    <img src="${p.image}" alt="${p.title} image">
    <div>
      <h3>${p.title}</h3>
      <div class="small"><span class="badge">${p.price}</span></div>
      <p class="small">Supplier: <a href="/supplier.html?id=${encodeURIComponent(p.supplierId)}">${p.supplierId.slice(0,8)}</a></p>
    </div>
  </div>`).join('') : `<div class="card"><p class="small">No featured packages yet.</p></div>`;
}

async function initResults(){
  const user = await me();
  const container = document.getElementById('results');
  const count = document.getElementById('resultCount');
  const filters = { category:'', price:'', q:'' };
  async function render(){
    const items = await listSuppliers(filters);
    count.textContent = `${items.length} supplier${items.length===1?'':'s'} found`;
    container.innerHTML = items.map(s=>supplierCard(s,user)).join('') || `<div class="card"><p>No suppliers found.</p></div>`;
    container.querySelectorAll('[data-add]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-add');
        const r = await fetch('/api/plan', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({supplierId:id})});
        if(!r.ok){ alert('Sign in as a customer to save to your account.'); return; }
        btn.textContent='Added'; btn.disabled=true;
      });
    });
    container.querySelectorAll('[data-add-local]').forEach(btn=>{
      btn.addEventListener('click', ()=>{ addLocal(btn.getAttribute('data-add-local')); btn.textContent='Added'; btn.disabled=true; });
    });
  }
  document.getElementById('filterCategory').addEventListener('change', e=>{ filters.category=e.target.value||''; render(); });
  document.getElementById('filterPrice').addEventListener('change', e=>{ filters.price=e.target.value||''; render(); });
  document.getElementById('filterQuery').addEventListener('input', e=>{ filters.q=e.target.value||''; render(); });
  render();
}

async function initSupplier(){
  const user=await me();
  const params=new URLSearchParams(location.search); const id=params.get('id');
  const r=await fetch('/api/suppliers/'+encodeURIComponent(id)); if(!r.ok){ document.getElementById('supplier-container').innerHTML='<div class="card"><p>Not found.</p></div>'; return; }
  const s=await r.json();
  const pkgs=await (await fetch(`/api/suppliers/${encodeURIComponent(id)}/packages`)).json();
  const img=(s.photos&&s.photos[0])||'/assets/images/hero-venue.svg';
  const gallery=(s.photos||[]).slice(1).map(u=>`<img loading="lazy" src="${u}" alt="${s.name}">`).join('');
  const facts = `<div class="small">${s.website?`<a href="${s.website}" target="_blank" rel="noopener">Website</a> · `:''}${s.license||''} ${s.maxGuests?`· Max ${s.maxGuests} guests`:''}</div>`;
  const amenities = (s.amenities||[]).map(a=>`<span class="badge">${a}</span>`).join(' ');
  const packagesHtml = (pkgs.items||[]).map(p=>`
    <div class="card pack">
      <img src="${p.image}" alt="${p.title} image">
      <div><h3>${p.title}</h3><div class="small"><span class="badge">${p.price}</span></div><p class="small">${p.description||''}</p></div>
    </div>`).join('') || `<div class="card"><p class="small">No approved packages yet.</p></div>`;
  document.getElementById('supplier-container').innerHTML=`
    <div class="card"><div class="supplier-card">
      <img src="${img}" alt="${s.name} image"><div>
        <h1>${s.name}</h1><div class="small">${s.location||''} · <span class="badge">${s.category}</span> ${s.price_display?`· ${s.price_display}`:''}</div>
        ${facts}
        <div class="small" style="margin-top:8px">${amenities}</div>
        <p style="margin-top:8px">${s.description_long||s.description_short||''}</p>
        <div class="form-actions" style="margin-top:8px">
          <button class="cta" id="add">Add to my plan</button>
          <button class="cta secondary" id="start-thread">Start conversation</button>
        </div>
      </div></div></div>
    <section class="section"><h2>Gallery</h2><div class="cards">${gallery||'<div class="card"><p class="small">No additional photos.</p></div>'}</div></section>
    <section class="section"><h2>Packages</h2><div class="cards">${packagesHtml}</div></section>`;
  document.getElementById('add').addEventListener('click', async ()=>{
    if(user?.role==='customer'){ await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({supplierId:s.id})}); alert('Added to your plan.'); }
    else { addLocal(s.id); alert('Added locally. Sign in as a customer to save to your account.'); }
  });
  document.getElementById('start-thread').addEventListener('click', async ()=>{
    if(!user){ location.href='/auth.html'; return; }
    const r=await fetch('/api/threads/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({supplierId:s.id})}); const d=await r.json();
    if(!r.ok){ alert(d.error||'Could not start conversation'); return; }
    alert('Conversation started. Visit your dashboard to continue.');
  });
}

async function initPlan(){
  const user = await me();
  const container = document.getElementById('plan-list');
  const notes = document.getElementById('plan-notes');
  const saveBtn = document.getElementById('save-notes');
  const status = document.getElementById('notes-status');
  const cloud = document.getElementById('cloud-status');
  const modal=document.getElementById('modal'); const modalEmails=document.getElementById('modal-emails'); const modalMsg=document.getElementById('modal-message'); const openMail=document.getElementById('open-mail'); const closeModal=document.getElementById('close-modal'); const exportCsv=document.getElementById('export-csv'); const messageAll=document.getElementById('message-all');
  cloud.textContent = user?.role==='customer' ? 'Signed in — plan saved to your account.' : 'Not signed in as customer — saved locally in this browser.';
  let items=[];
  if(user?.role==='customer'){ const r=await fetch('/api/plan'); const d=await r.json(); items=d.items||[]; const nr=await fetch('/api/notes'); const nd=await nr.json(); notes.value=nd.text||''; }
  else{ const ids=lsGet(); const all=await listSuppliers({}); items=all.filter(s=>ids.includes(s.id)); notes.value=localStorage.getItem('plan_notes')||''; }
  function render(){
    if(!items.length){
      container.innerHTML='<div class="card"><p>Your plan is currently empty.</p></div>';
      const percentEl = document.getElementById('plan-progress-percent');
      const ring = document.querySelector('.plan-ring-value');
      const breakdown = document.getElementById('plan-progress-breakdown');
      if(percentEl) percentEl.textContent = '0%';
      if(ring) ring.style.strokeDashoffset = 301.6;
      if(breakdown) breakdown.textContent = 'No suppliers added yet.';
      return;
    }

    container.innerHTML = items.map(s=>`<div class="card supplier-card">
      <img src="${(s.photos&&s.photos[0])||'/assets/images/collage-venue.svg'}" alt="${s.name} image">
      <div>
        <h3>${s.name}</h3>
        <div class="small">${s.location||''} · <span class="badge">${s.category}</span></div>
        <p class="small">${s.description_short||''}</p>
        <div class="form-actions">
          <a class="cta secondary" href="/supplier.html?id=${encodeURIComponent(s.id)}">View details</a>
          <button class="cta secondary" data-remove="${s.id}">Remove</button>
        </div>
      </div>
    </div>`).join('');

    // Experimental v4: update plan progress & confetti on first non-empty state
    const categories = ['Venues','Catering','Photography','Entertainment'];
    const present = new Set((items||[]).map(s=>s.category).filter(Boolean));
    let score = 0;
    categories.forEach(cat=>{ if(present.has(cat)) score += 25; });
    const percentEl = document.getElementById('plan-progress-percent');
    const ring = document.querySelector('.plan-ring-value');
    const breakdown = document.getElementById('plan-progress-breakdown');
    if(percentEl){
      percentEl.textContent = score + '%';
    }
    if(ring){
      const max = 301.6;
      const offset = max - (max * score/100);
      ring.style.strokeDashoffset = offset;
    }
    if(breakdown){
      const listed = categories.map(cat=> present.has(cat) ? `<strong>${cat}</strong>` : `<span style="opacity:.55">${cat}</span>`).join(' · ');
      breakdown.innerHTML = `Categories covered so far: ${listed}`;
    }
    if(!window.__EF_CONFETTI_USED && score>0){
      window.__EF_CONFETTI_USED = true;
      if(typeof efConfetti==='function') efConfetti();
    }

    container.querySelectorAll('[data-remove]').forEach(btn=>btn.addEventListener('click', async ()=>{
      const id=btn.getAttribute('data-remove');
      if(user?.role==='customer'){
        await fetch('/api/plan/'+encodeURIComponent(id), {method:'DELETE'});
        items=items.filter(x=>x.id!==id);
        render();
      } else {
        removeLocal(id);
        items=items.filter(x=>x.id!==id);
        render();
      }
    }));
  }  render();
  saveBtn.addEventListener('click', async ()=>{ if(user?.role==='customer'){ await fetch('/api/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ text: notes.value })}); status.textContent='Saved to account'; } else { localStorage.setItem('plan_notes', notes.value||''); status.textContent='Saved locally'; } setTimeout(()=> status.textContent='', 1500); });
  messageAll.addEventListener('click', ()=>{ const emails=items.map(s=>s.email).filter(Boolean); modalEmails.textContent=emails.join(', '); modal.style.display='flex'; modalMsg.value='Hello,\\n\\nI’m planning an event and would like to check your availability and pricing.\\n\\nEvent details:\\n• Type: \\n• Date: \\n• Location: \\n• Guests: \\n\\nThanks,\\n'; });
  closeModal.addEventListener('click', ()=> modal.style.display='none');
  openMail.addEventListener('click', ()=>{ const emails=items.map(s=>s.email).filter(Boolean); const body=modalMsg.value.replace(/\\n/g,'%0D%0A'); location.href=`mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent('EventFlow enquiry')}&body=${body}`; });
  exportCsv.addEventListener('click', ()=>{ const header=['Supplier Name','Category','Email','Location','Price Display']; const rows=items.map(s=>[s.name,s.category,s.email,s.location,s.price_display||'']); const csv=[header,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\\n'); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='eventflow-enquiries.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
}

async function renderThreads(targetEl){
  const r=await fetch('/api/threads/my'); if(!r.ok){ document.getElementById(targetEl).innerHTML='<p class="small">Sign in.</p>'; return; }
  const d=await r.json(); const items=d.items||[];
  const wrap=document.getElementById(targetEl);
  if(!items.length){ wrap.innerHTML='<p class="small">No conversations yet.</p>'; return; }
  wrap.innerHTML = items.map(t=>`<div class="card"><div class="small"><strong>${t.supplierName || t.supplierId}</strong> — Last: ${(t.last && t.last.text? t.last.text.replace(/</g,'&lt;').slice(0,60)+'…' : 'No messages')}</div><div class="form-actions" style="margin-top:8px"><button class="cta secondary" data-open="${t.id}">Open</button></div></div>`).join('');
  wrap.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>openThread(btn.getAttribute('data-open'))));
}
async function openThread(id){
  const modal=document.createElement('div'); modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50';
  modal.innerHTML = `<div style="background:#fff;border-radius:12px;max-width:820px;width:100%;padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3>Conversation</h3><button class="cta secondary" id="close">Close</button></div>
    <div id="thread-messages" class="section" style="max-height:420px;overflow:auto"><p class="small">Loading…</p></div>
    <div class="form-row"><textarea id="thread-text" rows="3" placeholder="Write a message…"></textarea></div>
    <div class="form-actions"><button class="cta" id="send">Send</button></div>
  </div>`;
  document.body.appendChild(modal);
  async function load(){ const r=await fetch(`/api/threads/${encodeURIComponent(id)}/messages`); const d=await r.json(); const list=d.items||[]; const box=modal.querySelector('#thread-messages'); box.innerHTML=list.map(m=>`<div class="card"><div class="small">${new Date(m.createdAt).toLocaleString()} · <strong>${m.fromRole}</strong></div><p>${m.text.replace(/</g,'&lt;')}</p></div>`).join('') || '<p class="small">No messages yet.</p>'; box.scrollTop=box.scrollHeight; }
  modal.querySelector('#send').addEventListener('click', async ()=>{ const text=modal.querySelector('#thread-text').value.trim(); if(!text) return; await fetch(`/api/threads/${encodeURIComponent(id)}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})}); modal.querySelector('#thread-text').value=''; await load(); });
  modal.querySelector('#close').addEventListener('click', ()=> modal.remove());
  await load();
}

async function initDashCustomer(){ await renderThreads('threads-cust'); }
async function initDashSupplier(){
  async function api(path, opts){ const r=await fetch(path, opts||{}); if(!r.ok) throw new Error((await r.json()).error||'Request failed'); return r.json(); }
  const supWrap=document.getElementById('my-suppliers'); const pkgWrap=document.getElementById('my-packages'); const select=document.getElementById('pkg-supplier');
  async function loadSuppliers(){ const d=await api('/api/me/suppliers'); supWrap.innerHTML = (d.items||[]).map(s=>`<div class="supplier-card card" style="margin-bottom:10px">
      <img src="${(s.photos&&s.photos[0])||'/assets/images/collage-venue.svg'}">
      <div>
        <h3>${s.name} ${s.approved?'<span class="badge">Approved</span>':'<span class="badge" style="background:#FFF5E6;color:#8A5A00">Awaiting review</span>'}</h3>
        <div class="small">${s.location||'Location not set'} · <span class="badge">${s.category}</span> ${s.price_display?`· ${s.price_display}`:''}</div>
        <p class="small">${s.description_short||''}</p>
        <div class="listing-health">
          <div class="listing-health-bar">
            <div class="listing-health-fill"></div>
          </div>
          <div class="listing-health-label">Listing health: calculating…</div>
        </div>
      </div>
    </div>`).join('') || '<p class="small">No profiles yet.</p>';


    // Experimental v4: listing health score
    (d.items||[]).forEach((s, idx)=>{
      const card = supWrap.children[idx];
      if(!card) return;
      let score = 0;
      if(s.photos && s.photos.length >= 1) score += 20;
      if(s.photos && s.photos.length >= 3) score += 20;
      const longText = (s.description_long||s.description_short||'').trim();
      if(longText.length >= 120) score += 20;
      if(s.amenities && s.amenities.length) score += 20;
      if(s.maxGuests && s.maxGuests > 0) score += 20;
      const clamped = Math.max(0, Math.min(score, 100));
      const fill = card.querySelector('.listing-health-fill');
      const label = card.querySelector('.listing-health-label');
      if(fill){
        fill.style.transform = `scaleX(${clamped/100})`;
      }
      if(label){
        label.textContent = `Listing health: ${clamped}/100`;
      }
    });

    select.innerHTML = (d.items||[]).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  }
  async function loadPackages(){ const d=await api('/api/me/packages'); pkgWrap.innerHTML = (d.items||[]).map(p=>`<div class="pack card" style="margin-bottom:10px"><img src="${p.image}"><div><h3>${p.title} ${p.approved?'<span class="badge">Approved</span>':'<span class="badge" style="background:#FFF5E6;color:#8A5A00">Awaiting review</span>'}</h3><div class="small"><span class="badge">${p.price}</span></div><p class="small">${p.description||''}</p></div></div>`).join('') || '<p class="small">No packages yet.</p>'; }
  document.getElementById('sup-create').addEventListener('click', async ()=>{
    const b={ name:document.getElementById('sup-name').value.trim(), category:document.getElementById('sup-category').value, location:document.getElementById('sup-location').value.trim(), price_display:document.getElementById('sup-price').value.trim(), description_short:document.getElementById('sup-short').value.trim(), description_long:document.getElementById('sup-long').value.trim(), website:document.getElementById('sup-website').value.trim(), license:document.getElementById('sup-license').value.trim(), amenities:document.getElementById('sup-amenities').value.trim(), maxGuests:document.getElementById('sup-max').value.trim(), photos:document.getElementById('sup-photos').value };
    const status=document.getElementById('sup-status'); status.textContent='Saving…';
    try{ await api('/api/me/suppliers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}); status.textContent='Saved (awaiting admin approval)'; await loadSuppliers(); }
    catch(e){ status.textContent=e.message; }
  });
  document.getElementById('pkg-create').addEventListener('click', async ()=>{
    const supplierId=document.getElementById('pkg-supplier').value; const title=document.getElementById('pkg-title').value.trim(); const price=document.getElementById('pkg-price').value.trim(); const description=document.getElementById('pkg-desc').value.trim(); const image=document.getElementById('pkg-image').value.trim();
    const status=document.getElementById('pkg-status'); status.textContent='Creating…';
    try{ await api('/api/me/packages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({supplierId,title,price,description,image})}); status.textContent='Package created (awaiting admin approval)'; await loadPackages(); }
    catch(e){ status.textContent=e.message; }
  });
  await loadSuppliers(); await loadPackages(); await renderThreads('threads-sup');
}

async function initAdmin(){
  const metrics=document.getElementById('metrics'); const supWrap=document.getElementById('admin-suppliers'); const pkgWrap=document.getElementById('admin-packages');
  async function fetchJSON(url,opts){ const r=await fetch(url,opts||{}); if(!r.ok) throw new Error((await r.json()).error||'Request failed'); return r.json(); }
  try{ const m=await fetchJSON('/api/admin/metrics'); const c=m.counts; metrics.textContent = `Users: ${c.usersTotal} ( ${Object.entries(c.usersByRole).map(([k,v])=>k+': '+v).join(', ')} ) · Suppliers: ${c.suppliersTotal} · Packages: ${c.packagesTotal} · Threads: ${c.threadsTotal} · Messages: ${c.messagesTotal}`; }catch(e){ metrics.textContent='Forbidden (admin only).'; }
  try{
    const s=await fetchJSON('/api/admin/suppliers');
    supWrap.innerHTML=(s.items||[]).map(x=>`<div class="card" style="margin-bottom:10px">
      <div class="small"><strong>${x.name}</strong> — ${x.category} · ${x.location||''}</div>
      <div class="form-actions"><button class="cta secondary" data-approve="${x.id}" data-val="${x.approved?'false':'true'}">${x.approved?'Hide':'Approve'}</button></div>
    </div>`).join('')||'<p class="small">No suppliers.</p>';
    supWrap.querySelectorAll('[data-approve]').forEach(btn=>btn.addEventListener('click',async()=>{const id=btn.getAttribute('data-approve');const val=btn.getAttribute('data-val')==='true';await fetchJSON('/api/admin/suppliers/'+id+'/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approved:val})});location.reload();}));
  }catch(e){ supWrap.innerHTML='<p class="small">Forbidden (admin only)</p>'; }
  try{
    const p=await fetchJSON('/api/admin/packages');
    pkgWrap.innerHTML=(p.items||[]).map(x=>`<div class="pack card" style="margin-bottom:10px">
      <img src="${x.image}"><div><h3>${x.title}</h3><div class="small"><span class="badge">${x.price}</span> — Supplier ${x.supplierId.slice(0,8)}</div>
      <div class="form-actions"><button class="cta secondary" data-approve="${x.id}" data-val="${x.approved?'false':'true'}">${x.approved?'Hide':'Approve'}</button>
      <button class="cta secondary" data-feature="${x.id}" data-val="${x.featured?'false':'true'}">${x.featured?'Unfeature':'Feature'}</button></div></div></div>`).join('')||'<p class="small">No packages.</p>';
    pkgWrap.querySelectorAll('[data-approve]').forEach(btn=>btn.addEventListener('click',async()=>{const id=btn.getAttribute('data-approve');const val=btn.getAttribute('data-val')==='true';await fetchJSON('/api/admin/packages/'+id+'/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approved:val})});location.reload();}));
    pkgWrap.querySelectorAll('[data-feature]').forEach(btn=>btn.addEventListener('click',async()=>{const id=btn.getAttribute('data-feature');const val=btn.getAttribute('data-val')==='true';await fetchJSON('/api/admin/packages/'+id+'/feature',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({featured:val})});location.reload();}));
  }catch(e){ pkgWrap.innerHTML='<p class="small">Forbidden (admin only)</p>'; }
}

document.addEventListener('DOMContentLoaded', ()=>{
  const page = window.__EF_PAGE__ || (location.pathname.endsWith('suppliers.html')?'results': location.pathname.endsWith('supplier.html')?'supplier': location.pathname.endsWith('plan.html')?'plan': '');
  if(page==='home') initHome();
  if(page==='results') initResults();
  if(page==='supplier') initSupplier();
  if(page==='plan') initPlan();
  if(page==='dash_customer') renderThreads('threads-cust');
  if(page==='dash_supplier') initDashSupplier();
  if(page==='admin') initAdmin();
  if(page==='auth'){ // auth form handlers
    document.getElementById('login-form').addEventListener('submit', async (e)=>{e.preventDefault();const email=document.getElementById('login-email').value.trim();const password=document.getElementById('login-password').value.trim();const status=document.getElementById('login-status');status.textContent='Signing in…';const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const d=await r.json();if(!r.ok){status.textContent=d.error||'Login failed';return;}status.textContent='Signed in';const role=d.user?.role;if(role==='admin')location.href='/admin';else if(role==='supplier')location.href='/dashboard/supplier';else location.href='/dashboard/customer';});
    document.getElementById('register-form').addEventListener('submit', async (e)=>{e.preventDefault();const name=document.getElementById('reg-name').value.trim();const email=document.getElementById('reg-email').value.trim();const password=document.getElementById('reg-password').value.trim();const role=document.querySelector('input[name=\"role\"]:checked').value;const status=document.getElementById('reg-status');status.textContent='Creating account…';const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password,role})});const d=await r.json();if(!r.ok){status.textContent=d.error||'Could not create account';return;}status.textContent='Account created';if(d.user?.role==='supplier')location.href='/dashboard/supplier';else location.href='/dashboard/customer';});
  }
});


// Settings page
async function initSettings(){
  try{
    const r=await fetch('/api/me/settings'); if(!r.ok) throw new Error('Not signed in');
    const d=await r.json(); const cb=document.getElementById('notify'); cb.checked=!!d.notify;
    document.getElementById('save-settings').addEventListener('click', async ()=>{
      const rr=await fetch('/api/me/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notify: document.getElementById('notify').checked})});
      if(rr.ok){ document.getElementById('settings-status').textContent='Saved'; setTimeout(()=>document.getElementById('settings-status').textContent='',1200); }
    });
  }catch(e){
    document.querySelector('main .container').innerHTML = '<div class="card"><p class="small">Sign in to change your settings.</p></div>';
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  if(window.__EF_PAGE__==='settings') initSettings();
});

// simple pageview beacon
fetch('/api/metrics/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'pageview',meta:{path:location.pathname}})}).catch(()=>{});

// Admin charts
async function adminCharts(){
  try{
    const r=await fetch('/api/admin/metrics/timeseries'); if(!r.ok) return;
    const d=await r.json(); const c=document.createElement('canvas'); c.id='chart'; document.querySelector('#metrics').after(c);
    const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/chart.js'; s.onload=()=>{
      const ctx=c.getContext('2d');
      new Chart(ctx,{type:'line',data:{labels:d.days,datasets:[{label:'Pageviews',data:d.pageviews},{label:'Signups',data:d.signups},{label:'Messages',data:d.messages}]}});
    }; document.body.appendChild(s);
  }catch(e){}
}

// Supplier onboarding checklist visual (client side)
function renderSupplierChecklist(wrapper, supplierCount, packageCount){
  const steps=[
    {name:'Create a supplier profile', done:supplierCount>0},
    {name:'Get approved by admin', done:false}, // can't know client-side; show informational
    {name:'Add at least one package', done:packageCount>0}
  ];
  wrapper.innerHTML = '<h3>Onboarding</h3>'+steps.map(s=>`<div class="small">${s.done?'✅':'⬜️'} ${s.name}</div>`).join('');
}

document.addEventListener('DOMContentLoaded', ()=>{
  if(window.__EF_PAGE__==='admin') adminCharts();
  if(window.__EF_PAGE__==='dash_supplier'){
    (async()=>{
      try{
        const me=await fetch('/api/me/suppliers'); const ms=await me.json();
        const pk=await fetch('/api/me/packages'); const mp=await pk.json();
        const box=document.createElement('div'); box.className='card'; box.style.marginTop='16px';
        document.querySelector('main .container').appendChild(box);
        renderSupplierChecklist(box, (ms.items||[]).length, (mp.items||[]).length);
      }catch(e){}
    })();
  }
});


// === Experimental features (EventFlow Experimental v2) ===
const EF_THEME_KEY = 'ef_theme';

function efApplyTheme(theme){
  const root=document.documentElement;
  if(theme==='dark'){
    root.setAttribute('data-theme','dark');
  }else{
    root.removeAttribute('data-theme');
    theme='light';
  }
  try{ localStorage.setItem(EF_THEME_KEY, theme); }catch(_){}
}

function efInitThemeToggle(){
  // restore saved theme
  let stored=null;
  try{ stored=localStorage.getItem(EF_THEME_KEY); }catch(_){}
  if(stored==='dark') efApplyTheme('dark');

  const headerInner=document.querySelector('.header-inner');
  if(!headerInner) return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.id='theme-toggle';
  btn.className='cta ghost';
  const updateLabel=()=>{
    const isDark=document.documentElement.getAttribute('data-theme')==='dark';
    btn.textContent = isDark ? 'Light mode' : 'Dark mode';
  };
  updateLabel();
  btn.addEventListener('click', ()=>{
    const isDark=document.documentElement.getAttribute('data-theme')==='dark';
    efApplyTheme(isDark?'light':'dark');
    updateLabel();
  });
  headerInner.appendChild(btn);
}

// Simple loader overlay: fades out shortly after load
function efInitLoader(){
  const loader=document.getElementById('ef-loader');
  if(!loader) return;
  const hide=()=>{
    loader.classList.add('loader-hidden');
    setTimeout(()=>loader.remove(),400);
  };
  window.addEventListener('load', ()=>{
    setTimeout(hide, 600);
  });
}

// Venue map: uses browser geolocation or postcode to set an embedded map
function efInitVenueMap(){
  const mapFrame=document.getElementById('venue-map');
  if(!mapFrame) return;
  const useBtn=document.getElementById('map-use-location');
  const form=document.getElementById('map-postcode-form');
  const input=document.getElementById('map-postcode');
  const status=document.getElementById('map-status');

  function setStatus(msg){
    if(!status) return;
    status.textContent = msg || '';
  }

  function updateForQuery(q){
    if(!q) return;
    const url = 'https://www.google.com/maps?q=' + encodeURIComponent('wedding venues near ' + q) + '&output=embed';
    mapFrame.src = url;
    setStatus('Showing results near "' + q + '" (powered by Google Maps in your browser).');
  }

  if(useBtn && navigator.geolocation){
    useBtn.addEventListener('click', ()=>{
      setStatus('Requesting your location…');
      navigator.geolocation.getCurrentPosition(
        pos=>{
          const {latitude, longitude} = pos.coords;
          const query = latitude.toFixed(4) + ',' + longitude.toFixed(4);
          updateForQuery(query);
        },
        err=>{
          setStatus('Could not access your location (' + err.message + '). You can type a postcode instead.');
        }
      );
    });
  }

  if(form && input){
    form.addEventListener('submit', (e)=>{
      e.preventDefault();
      const val=input.value.trim();
      if(!val){
        setStatus('Type a postcode first.');
        return;
      }
      updateForQuery(val);
    });
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  try{ efInitThemeToggle(); }catch(_){}
  try{ efInitLoader(); }catch(_){}
  try{ efInitVenueMap(); }catch(_){}
});


// Experimental v3: scroll reveal for .reveal elements
document.addEventListener('DOMContentLoaded', ()=>{
  try{
    const els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if(!('IntersectionObserver' in window) || els.length===0){
      els.forEach(el=>el.classList.add('is-visible'));
      return;
    }
    const obs = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, {threshold:0.18});
    els.forEach(el=>obs.observe(el));
  }catch(_){}
});


// Experimental v4: simple confetti burst
function efConfetti(){
  try{
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    const colors = ['#22C55E','#F97316','#EAB308','#38BDF8','#A855F7','#EC4899'];
    const pieces = 80;
    for(let i=0;i<pieces;i++){
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      const left = Math.random()*100;
      const delay = Math.random()*0.4;
      const dur = 0.7 + Math.random()*0.4;
      const color = colors[Math.floor(Math.random()*colors.length)];
      el.style.left = left + '%';
      el.style.top = (-20 + Math.random()*20) + 'px';
      el.style.backgroundColor = color;
      el.style.animationDelay = delay+'s';
      el.style.animationDuration = dur+'s';
      layer.appendChild(el);
    }
    document.body.appendChild(layer);
    setTimeout(()=>{ layer.remove(); }, 1300);
  }catch(_){}
}
