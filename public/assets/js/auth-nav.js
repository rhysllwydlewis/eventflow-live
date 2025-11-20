
(async function(){
  async function me(){ try{ const r=await fetch('/api/auth/me'); return (await r.json()).user; } catch(_){ return null; } }
  const user = await me();
  const auth = document.getElementById('nav-auth');
  const dash = document.getElementById('nav-dashboard');
  const signout = document.getElementById('nav-signout');
  const burger = document.getElementById('burger');
  const nav = document.querySelector('.nav');
  if(burger){ burger.addEventListener('click',()=>{ nav.style.display = nav.style.display==='none' ? 'flex' : 'none'; }); }
  if(user){
    if(auth) auth.style.display='none';
    if(dash){ dash.style.display=''; dash.href = user.role==='admin' ? '/admin' : (user.role==='supplier' ? '/dashboard/supplier' : '/dashboard/customer'); }
    if(signout){ signout.style.display=''; signout.addEventListener('click', async (e)=>{ e.preventDefault(); await fetch('/api/auth/logout',{method:'POST'}); location.href='/'; }); }
  }else{
    if(auth) auth.style.display='';
    if(dash) dash.style.display='none';
    if(signout) signout.style.display='none';
  }
})();
