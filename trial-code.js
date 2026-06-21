// ════════════════════════════════════════════════════════════════
// features/trial-code.js
// Student-facing free trial: checking trial availability, starting
// a trial session, countdown display, and expiry handling.
// Admin-side trial activation/deactivation lives in admin-panel.js
// — this file is the student-facing redemption half only.
// Extracted from index.html (split, June 2026). Logic unchanged
// except where noted below.
//
// DEPENDENCIES (must load before this file):
//   - core/session-state.js (S)
//   - core/ui-helpers.js    (toast)
//   - features/access-codes.js (WORKER_URL constant)
//
// FIX APPLIED: this file originally used a third, independently-
// declared worker URL variable named `WU` instead of WORKER_URL —
// same cosmetic inconsistency found and normalized elsewhere in
// this project. Normalized here too.
// ════════════════════════════════════════════════════════════════

// ── TRIAL STATE ───────────────────────────────────────────────────
var _trialTimer=null, _trialWarned=false, _trialEndTime=null;

// ── CHECK TRIAL CODE STATUS (on page load) ────────────────────────────
async function checkTrialCode(){
  try{
    var r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_appSecret:APP_SECRET,action:'get-trial-code'})});
    var d=await r.json();
    if(d.active){
      var cd=document.getElementById('trial-countdown');
      if(cd){cd.style.display='block';cd.textContent='FREE';cd.style.fontSize='18px';}
      window._pendingTrialExpiry=d.expiresAt;
      setTrialStatusBar(true);
    } else {
      setTrialStatusBar(false);
    }
  }catch(e){}
}

// ── SHOW/UPDATE TRIAL COUNTDOWN UI ─────────────────────────────────────
function showTrialCard(expiresAt){
  // Called only after client taps Start Free Trial
  _trialEndTime=expiresAt;
  var c=document.getElementById('trial-card');
  if(c) c.style.display='block';
  var cd=document.getElementById('trial-countdown');
  if(cd){cd.style.fontSize='28px';}
  updateTrialCountdown();
  if(_trialTimer) clearInterval(_trialTimer);
  _trialTimer=setInterval(updateTrialCountdown,1000);
}

function updateTrialCountdown(){
  var rem=Math.max(0,Math.ceil((_trialEndTime-Date.now())/1000));
  var m=Math.floor(rem/60),s=rem%60;
  var el=document.getElementById('trial-countdown');
  if(el){el.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;el.className=rem<=120?'warning':'';}
  if(rem===120&&!_trialWarned){_trialWarned=true;toast('Warning: Trial ends in 2 minutes! Get full access for $5/week.','inf');}
  if(rem===0){clearInterval(_trialTimer);showTrialExpired();}
}

// ── START TRIAL SESSION ────────────────────────────────────────────────
async function startTrial(){
  var fp = typeof getDeviceFingerprint==='function' ? getDeviceFingerprint() : 'unknown';
  try{
    var r1=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'get-trial-code',t:Date.now()})});
    var trial=await r1.json();
    if(!trial.active){toast('No active trial at the moment.','err');return;}

    var storedCode = localStorage.getItem('_currentTrialCode');
    var isSameCode = S.code === trial.code;
    var isStillValid = S.codeExpiry && Math.ceil((new Date(S.codeExpiry)-Date.now())/1000)>0;
    if(storedCode && storedCode !== trial.code){
      S.code=''; S.codeExpiry=null;
    }
    if(isSameCode && isStillValid && (!storedCode || storedCode===trial.code)){
      showPage('page-profile');
      return;
    }

    var r2=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'validate-trial-code',code:trial.code,fingerprint:fp})});
    var data=await r2.json();
    if(!data.valid){
      if(data.error==='already_used'||data.error==='expired'){showTrialExpired();return;}
      toast(data.message||'Trial not available','err');return;
    }
    S.code=trial.code; S.codeType='Trial'; S.codeExpiry=new Date(data.expiresAt);
    localStorage.setItem('saa_expiry_'+trial.code, data.expiresAt);
    localStorage.setItem('_currentTrialCode', trial.code);
    showTrialCard(data.expiresAt);
    var btn=document.querySelector('#trial-card .btn-trial');
    if(btn) btn.textContent='Continue Trial →';
    showPage('page-profile');
    toast('Trial started! You have '+data.minutes+' minutes of free access.','ok');
  }catch(e){toast('Cannot connect to server. Please check your internet.','err');}
}

// ── TRIAL EXPIRY HANDLING ───────────────────────────────────────────────
function showTrialExpired(){
  S.code='';S.codeType='';S.codeExpiry=null;
  document.getElementById('trial-expired-overlay').style.display='flex';
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');p.style.display='none';});
}

setInterval(function(){
  if(!S.code||!S.code.startsWith('TRIAL-')||!S.codeExpiry) return;
  if(Math.ceil((new Date(S.codeExpiry)-Date.now())/1000)<=0) showTrialExpired();
},5000);

function setTrialStatusBar(active){
  var bar=document.getElementById('trial-status-bar');
  if(!bar) return;
  if(active){
    bar.style.background='rgba(16,185,129,0.12)';
    bar.style.color='#10b981';
    bar.textContent='&#128994; ACTIVE';
    bar.innerHTML='&#128994; ACTIVE';
  } else {
    bar.style.background='rgba(239,68,68,0.1)';
    bar.style.color='#ef4444';
    bar.innerHTML='&#128308; INACTIVE';
  }
}
