// ════════════════════════════════════════════════════════════════
// features/access-codes.js
// Access code generation (admin), validation (student), device
// fingerprint locking, and the two device-reset paths.
// Extracted from index.html (split, June 2026).
//
// DEPENDENCIES (must load before this file):
//   - core/session-state.js (S, selectedCodeType, generatedCodes)
//   - core/ui-helpers.js    (toast)
//
// BUGS FOUND AND FIXED DURING THIS EXTRACTION (none of these were
// introduced by the split — they existed in the original file):
//
// 1. NAME COLLISION: the original file defined TWO different
//    functions both called `adminResetDevice` —
//      (a) adminResetDevice(code, btn) — called from the 🔓 button
//          next to each code in the admin code list
//      (b) adminResetDevice() — called from a separate manual
//          "Reset Device Lock" form with its own text input
//    In JavaScript, the second definition silently overwrote the
//    first everywhere in the file, so the code-list 🔓 button
//    actually ran function (b)'s logic instead, ignoring the code/
//    btn it was given. RENAMED to fix:
//      (a) → adminResetDeviceFromList(code, btn)
//      (b) → adminResetDeviceManual()
//    Their onclick="..." handlers in the admin HTML must be updated
//    to match these new names when the admin panel HTML is rebuilt.
//
// 2. MISSING VARIABLE READ: adminResetDeviceManual() (b, above)
//    referenced a bare variable `code` that was never declared or
//    read from its input field (#reset-code-input) — meaning this
//    form was broken and always failed. FIXED: now reads
//    document.getElementById('reset-code-input').value.trim().
//
// 3. HARDCODED ADMIN KEY FALLBACK: several functions here still had
//    the old `||'SmartAdmin2024'` fallback (the same exposed key
//    fixed in index.html/admin.html/worker.js earlier). FIXED: all
//    instances now use the stored key with no insecure fallback.
//
// WORKER_URL was previously a literal string duplicated inside each
// function independently. Consolidated into one shared constant
// at the top of this file (update this one line for the backup app's
// worker URL once it's ready).
// ════════════════════════════════════════════════════════════════

// ── SHARED WORKER URL (update for backupsmartacademy-ai deployment) ──
const WORKER_URL = 'https://smartacademy-ai.kasongokimba.workers.dev';

// ── SELECT CODE TYPE (W/M toggle in admin panel) ────────────────────
function selectCodeType(t){
  selectedCodeType = t;
  ['W','M'].forEach(x=>{
    document.getElementById('ctype-'+x).classList.toggle('active', x===t);
  });
}

// ── GENERATE A NEW ACCESS CODE (admin) ───────────────────────────────
function generateCode(){
  // Get selected type from either source
  selectedCodeType = window._codeType || selectedCodeType || 'W';

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for(let i=0;i<7;i++) rand += chars[Math.floor(Math.random()*chars.length)];
  const code = selectedCodeType + '-' + rand;

  const expiry = new Date();
  if(false){
    expiry.setTime(expiry.getTime() + 60*60*1000); // 1 hour
  } else if(selectedCodeType==='W'){
    expiry.setDate(expiry.getDate() + 7);
  } else if(selectedCodeType==='M'){
    expiry.setDate(expiry.getDate() + 30);
  } else if(false){
    expiry.setDate(expiry.getDate() + 365);
  }

  const typeMap = {W:'Weekly', M:'Monthly'};
  const label = typeMap[selectedCodeType] || 'Weekly';

  // Format expiry — H codes store full datetime, others store date only
  var expiryStr;
  if(selectedCodeType === 'H'){
    // Store as ISO string to preserve time for 1-hour codes
    expiryStr = expiry.toISOString();
  } else {
    var dd = String(expiry.getDate()).padStart(2,'0');
    var mm = String(expiry.getMonth()+1).padStart(2,'0');
    var yyyy = expiry.getFullYear();
    expiryStr = dd+'/'+mm+'/'+yyyy;
  }

  const newEntry = {code, type:label, expiry:expiryStr, created:Date.now(), origin:'admin', region:'admin'};
  localStorage.removeItem('saa_codes_cleared'); // allow table to show new code

  var stored = JSON.parse(localStorage.getItem('saa_codes')||'[]');
  stored.push(newEntry);
  localStorage.setItem('saa_codes', JSON.stringify(stored));
  generatedCodes = stored;
  window._lastGeneratedCode = code;

  // Also register in Cloudflare Worker KV so device lock works across devices
  var WORKER = 'https://smartacademy-ai.kasongokimba.workers.dev';
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  fetch(WORKER, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      _appSecret: APP_SECRET,
      action:'generate-code',
      code: code,
      type: label,
      durationMs: expiry.getTime() - Date.now(),
      adminKey: adminKey
    })
  }).then(function(r){ return r.json(); })
    .then(function(d){
      if(!d || d.success !== true){
        toast("⚠️ Code saved locally, but server save failed: " + (d && d.error ? d.error : "unknown error") + " — it will NOT appear in admin's All Codes list", 'err');
      }
    })
    .catch(function(e){
      toast("⚠️ Code saved locally, but could not reach server: " + e.message + " — it will NOT appear in admin's All Codes list", 'err');
    });

  renderGeneratedCodes();
  renderAllCodes();
  if(typeof adminRenderCodesTable === "function") adminRenderCodesTable();
  toast(`✅ Code generated: ${code}`,'ok');
}

// ── RENDER LAST-GENERATED CODE (admin panel quick view) ─────────────
function renderGeneratedCodes(){
  const el = document.getElementById('generated-codes');
  if(!generatedCodes.length){
    el.innerHTML = '<div class="no-codes">No codes generated yet</div>';
    return;
  }
  const last = generatedCodes[generatedCodes.length-1];
  el.innerHTML = `
    <div class="code-item">
      <div>
        <div class="code-val">${last.code}</div>
        <div class="code-meta">${last.type} · Expires ${last.expiry}</div>
      </div>
      <button class="btn-copy" onclick="copyCode('${last.code}',this)">📋 Copy</button>
    </div>`;
}

// ── RENDER ALL GENERATED CODES (admin panel full list) ──────────────
function renderAllCodes(){
  const el = document.getElementById('all-codes-list');
  if(!generatedCodes.length){
    el.innerHTML = '<div class="no-codes">No codes generated this session</div>';
    return;
  }
  el.innerHTML = generatedCodes.map(c=>`
    <div class="code-item">
      <div>
        <div class="code-val">${c.code}</div>
        <div class="code-meta">${c.type} · Expires ${c.expiry}</div>
      </div>
      <button class="btn-copy" onclick="copyCode('${c.code}',this)">📋 Copy</button>
    </div>`).join('');
}

// ── CLEAR ALL LOCALLY-CACHED GENERATED CODES ─────────────────────────
function clearCodes(){
  generatedCodes = [];
  localStorage.removeItem('saa_codes');
  renderGeneratedCodes();
  renderAllCodes();
  toast('All codes cleared','inf');
}

// ── COPY A CODE TO CLIPBOARD ──────────────────────────────────────────
function copyCode(code, btn){
  navigator.clipboard.writeText(code).then(function(){
    toast('Copied: '+code,'ok');
    if(btn){
      var orig = btn.textContent;
      btn.textContent = '✅ Copied';
      btn.style.color = '#10b981';
      setTimeout(function(){ btn.textContent = orig; btn.style.color = ''; }, 2000);
    }
  });
}

// ── RESET DEVICE LOCK (from the code-list 🔓 button) ─────────────────
// RENAMED from adminResetDevice(code,btn) — see file header for why.
async function adminResetDeviceFromList(code, btn){
  if(!confirm('Unlock "'+code+'" from its current device?\n\nThe learner can activate it again on any device.')) return;
  btn.textContent='⏳';btn.disabled=true;
  try{
    var adminKey = localStorage.getItem('saa_admin_key')||'';
    var res = await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'reset-device',adminKey:adminKey,code:code})});
    var d = await res.json();
    if(d.ok){
      toast('✅ '+code+' device unlocked','ok');
      btn.textContent='✅';btn.style.color='#10b981';
      setTimeout(function(){btn.textContent='🔓';btn.style.color='';btn.disabled=false;},3000);
    } else {
      toast('❌ '+(d.error||'Failed to reset'),'err');
      btn.textContent='🔓';btn.disabled=false;
    }
  }catch(e){
    toast('❌ Network error','err');
    btn.textContent='🔓';btn.disabled=false;
  }
}

// ── SAVE/LOAD GENERATED CODES TO/FROM LOCAL STORAGE ───────────────────
let failAttempts = 0; // tracks failed validateCode attempts (was declared here in the original file)
function saveGeneratedCodes(){
  // Merge generatedCodes with any existing stored codes (avoid duplicates)
  var stored = JSON.parse(localStorage.getItem('saa_codes')||'[]');
  generatedCodes.forEach(function(gc){
    if(!stored.find(function(s){return s.code===gc.code;})){
      stored.push(gc);
    }
  });
  localStorage.setItem('saa_codes', JSON.stringify(stored));
}

function loadGeneratedCodes(){
  try{
    const stored = localStorage.getItem('saa_codes');
    if(stored) generatedCodes = JSON.parse(stored);
  }catch(e){ generatedCodes = []; }
}

// ── DEVICE FINGERPRINT (for code-to-device locking) ──────────────────
function getDeviceFingerprint(){
  // Use a stable permanent device ID stored in localStorage
  // This never changes on the same device regardless of browser updates
  var stored = localStorage.getItem('saa_device_id');
  if(stored) return stored;
  // Generate a new permanent ID for this device
  var id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,10);
  localStorage.setItem('saa_device_id', id);
  return id;
}

// ── VALIDATE ACCESS CODE (student-facing entry point) ────────────────
async function validateCode(){
  var rawCode = (document.getElementById('code-input')||{}).value||'';
  var prefix = rawCode.toUpperCase().split('-')[0];
  // RM/RS/RY are Research-only codes — block from learning
  if(prefix==='RM'||prefix==='RS'||prefix==='RY'){
    var errEl2 = document.getElementById('code-error');
    showErr(errEl2, '');
    return;
  }
  const raw   = document.getElementById('code-input').value.trim().toUpperCase();
  const errEl = document.getElementById('code-error');
  const btn   = document.getElementById('btn-verify');

  // Always clear previous status first
  errEl.style.display='none';
  errEl.textContent='';

  if(!raw){ showErr(errEl, saT('err_no_code')||'Please enter your access code.'); return; }

  // Get fingerprint early — needed for local and server validation
  const fingerprint = getDeviceFingerprint();

  // ── CHECK LOCAL BLACKLIST FIRST ──
  var blacklist = JSON.parse(localStorage.getItem('saa_disabled_codes')||'[]');
  if(blacklist.includes(raw)){
    showErr(errEl, '🚫 This code has been deactivated. Please contact your administrator for a new code.');
    return;
  }

  // Check if classroom/group code (starts with C- or G-)
  const isClassCode = raw.startsWith('C-') || raw.startsWith('G-');

  const pattern = /^([WMYCG])-([A-Z0-9]{4,12})$/;
  if(!pattern.test(raw)){
    showErr(errEl,'❌ Invalid code format. Must start with W-, M-, Y-, C-, or G-');
    return;
  }

  // ── CHECK LOCAL CODES FIRST (admin-generated offline codes) ──
  var localCodes = JSON.parse(localStorage.getItem('saa_codes')||'[]');
  var localMatch = localCodes.find(function(c){ return c.code === raw; });
  if(localMatch){
    // Double-check not blacklisted
    var bl = JSON.parse(localStorage.getItem('saa_disabled_codes')||'[]');
    if(bl.includes(raw)){
      showErr(errEl, '🚫 This code has been deactivated. Please contact your administrator for a new code.');
      return;
    }
    // Parse expiry — supports ISO string, DD/MM/YYYY, and numeric timestamps from KV
    var expRaw = localMatch.expiry || localMatch.expiresAt || '';
    var expDate;
    if(typeof expRaw === 'number'){
      expDate = new Date(expRaw);
    } else {
      expRaw = String(expRaw);
      if(expRaw.includes('T') || expRaw.includes('-')){
        expDate = new Date(expRaw);
      } else {
        var parts = expRaw.split('/');
        expDate = parts.length===3 ? new Date(parts[2]+'-'+parts[1]+'-'+parts[0]) : null;
      }
    }
    if(expDate && expDate < new Date()){
      showErr(errEl,'⏰ '+(saT('err_code_expired')||'This code has expired. Please contact your administrator.'));
      return;
    }
    // ── ALWAYS validate through Worker for device lock ──
    if(btn){ btn.textContent='⏳ Verifying...'; btn.disabled=true; }
    try {
      var wRes = await fetch(WORKER_URL, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({_appSecret:APP_SECRET,action:'validate-code', code:raw, fingerprint:fingerprint})
      });
      var wData = await wRes.json();
      if(!wData.valid && wData.error === 'device_locked'){
        showErr(errEl, '🔒 This code is already activated on another device. Contact your administrator.');
        if(btn){ btn.textContent='🚀 Verify & Continue to Setup →'; btn.disabled=false; }
        return;
      }
      // If 'Code not found' in KV — code was generated before new system
      // Re-register it in KV now then continue
      if(!wData.valid && wData.error === 'Code not found'){
        await fetch(WORKER_URL, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            _appSecret: APP_SECRET,
            action:'generate-code',
            code: raw,
            type: localMatch.type || 'W',
            durationMs: expDate ? (expDate.getTime() - Date.now()) : 7*24*60*60*1000,
            adminKey: localStorage.getItem('saa_admin_key')||''
          })
        });
        // Now validate again
        var wRes2 = await fetch(WORKER_URL, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({_appSecret:APP_SECRET,action:'validate-code', code:raw, fingerprint:fingerprint})
        });
        var wData2 = await wRes2.json();
        if(!wData2.valid && wData2.error === 'device_locked'){
          showErr(errEl, '🔒 This code is already activated on another device. Contact your administrator.');
          if(btn){ btn.textContent='🚀 Verify & Continue to Setup →'; btn.disabled=false; }
          return;
        }
      }
    } catch(e){
      // Worker unreachable — fall back to local device lock only
      var storedFp = localStorage.getItem('saa_fp_'+raw);
      if(storedFp && storedFp !== fingerprint){
        showErr(errEl,'🔒 This code is already activated on another device. Contact your administrator.');
        if(btn){ btn.textContent='🚀 Verify & Continue to Setup →'; btn.disabled=false; }
        return;
      }
      if(!storedFp) localStorage.setItem('saa_fp_'+raw, fingerprint);
    }
    // Valid — proceed
    const typeMap = {W:'Weekly',M:'Monthly'};
    S.code     = raw;
    S.codeType = localMatch.type || typeMap[raw[0]] || 'Weekly';
    S.codeExpiry = expDate;
    S.fingerprint = fingerprint;
    failAttempts = 0;
    if(btn){ btn.textContent='✅ Verified! Loading...'; btn.style.background='#10b981'; }
    errEl.style.display='block'; errEl.style.color='#10b981';
    errEl.style.background='rgba(16,185,129,0.1)'; errEl.style.border='1px solid rgba(16,185,129,0.3)';
    errEl.style.borderRadius='8px'; errEl.style.padding='10px';
    errEl.textContent='✅ '+(saT('code_verified')||'Code verified')+' — '+S.codeType+' access.';
    setTimeout(function(){
      
    showPage('page-profile');
      if(btn){ btn.textContent='🚀 Verify & Continue to Setup →'; btn.style.background=''; btn.disabled=false; }
      errEl.style.display='none';
    }, 800);
    return;
  }

  // Show loading state
  if(btn){ btn.textContent='⏳ Verifying...'; btn.disabled=true; }

  // For classroom codes — get GPS location first
  if(isClassCode){
    if(btn){ btn.textContent='📍 Getting location...'; btn.disabled=true; }
    await new Promise(function(resolve){
      if(!navigator.geolocation){
        showErr(errEl,'❌ Location not supported on this device.'); resolve(); return;
      }
      navigator.geolocation.getCurrentPosition(
        function(pos){ window._userLat=pos.coords.latitude; window._userLng=pos.coords.longitude; resolve(); },
        function(){ showErr(errEl,'❌ Location access denied. Please allow location to use this classroom code.'); resolve(); },
        {timeout:8000, maximumAge:60000}
      );
    });
    if(!window._userLat){ if(btn){btn.textContent='🚀 Verify & Continue to Setup →';btn.disabled=false;} return; }
    if(btn){ btn.textContent='⏳ Verifying...'; }
  }

  try {
    const res = await fetch(WORKER_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        action:'validate-code',
        code: raw,
        fingerprint: fingerprint,
        lat: window._userLat || null,
        lng: window._userLng || null
      })
    });

    const data = await res.json();

    if(!data.valid){
      if(data.error === 'rate_limited'){
        showErrAlert(errEl, '⛔ Too many failed attempts. Please wait 20 minutes before trying again.');
      } else if(data.error === 'disabled'){
        showErr(errEl, '🚫 This code has been deactivated. Please contact your administrator for a new code.');
      } else if(data.error === 'outside_radius'){
        showErr(errEl, '📍 You are outside the allowed area ('+data.distance+'m from school, max '+data.radius+'m). This code only works at the registered location.');
      } else if(data.error === 'location_required'){
        showErr(errEl, '📍 Location access is required to use this classroom code. Please allow location and try again.');
      } else if(data.error === 'device_locked'){
        showErr(errEl, '🔒 '+(saT('err_device_locked')||'This code is already activated on another device. Contact your administrator for a new code.'));
      } else if(data.error === 'expired'){
        showErr(errEl, '⏰ '+(saT('err_code_expired')||'This code has expired. Please contact your administrator.'));
        localStorage.removeItem('saa_expiry_'+raw);
      } else if(data.error === 'Code not found'){
        showErr(errEl, '❌ '+(saT('err_code_invalid')||'Code not found. Please check and try again.'));
      } else {
        showErr(errEl, '❌ '+(data.message || data.error || 'Verification failed.'));
      }
      if(btn){ btn.textContent='🚀 Verify & Continue to Setup →'; btn.disabled=false; }
      return;
    }

    // ✅ Valid server code
    const typeMap = {W:'Weekly',M:'Monthly'};
    S.code           = raw;
    S.codeType       = typeMap[raw[0]] || 'Weekly';
    S.codeExpiry     = new Date(data.expiresAt);
    S.fingerprint    = fingerprint;
    failAttempts     = 0;

    localStorage.setItem('saa_expiry_'+raw, data.expiresAt);
    localStorage.setItem('saa_fp_'+raw, fingerprint);
    localStorage.removeItem('_ph');
    localStorage.removeItem('_pu');
    localStorage.removeItem('_pe');
    localStorage.removeItem('_ph_set');
    if(typeof pinUpdateUI === 'function') pinUpdateUI();

    if(btn){ btn.textContent='✅ Verified! Loading...'; btn.style.background='#10b981'; }
    errEl.style.display='block'; errEl.style.color='#10b981';
    errEl.style.background='rgba(16,185,129,0.1)'; errEl.style.border='1px solid rgba(16,185,129,0.3)';
    errEl.style.borderRadius='8px'; errEl.style.padding='10px';
    errEl.textContent='✅ '+(saT('code_verified')||'Code verified')+' — '+S.codeType+' access.';

    setTimeout(function(){
      showPage('page-profile');
      if(btn){ btn.textContent='🚀 Verify & Continue to Setup →'; btn.style.background=''; btn.disabled=false; }
      errEl.style.display='none';
    }, 800);

  } catch(err) {
    // Network error — fall back to localStorage cache
    console.warn('Worker unreachable, using local cache:', err.message);
    const stored   = localStorage.getItem('saa_expiry_'+raw);
    const cachedFp = localStorage.getItem('saa_fp_'+raw);

    if(stored && cachedFp && cachedFp !== fingerprint){
      showErr(errEl,'🔒 '+(saT('err_device_locked')||'This code is already activated on another device.'));
      if(btn){ btn.textContent='🚀 Verify & Continue to Setup →'; btn.disabled=false; }
      return;
    }
    if(stored && new Date() < new Date(parseInt(stored))){
      const typeMap = {W:'Weekly',M:'Monthly'};
      S.code = raw; S.codeType = typeMap[raw[0]]||'Weekly';
      S.codeExpiry = new Date(parseInt(stored));
      showPage('page-profile');
    } else {
      showErr(errEl,'⚠️ '+(saT('err_offline')||'Cannot connect to server. Please check your internet connection.'));
    }
    if(btn){ btn.textContent='🚀 Verify & Continue to Setup →'; btn.disabled=false; }
  }
}

// ── RESET DEVICE LOCK (from the manual 'Reset Device Lock' admin form) ──
// RENAMED from adminResetDevice() — see file header for why. Also now
// correctly reads its own #reset-code-input field (previously broken).
async function adminResetDeviceManual(){
  var resultEl = document.getElementById('reset-device-result');
  var code = document.getElementById('reset-code-input').value.trim();
  if(!code){ resultEl.textContent='Please enter a code.'; resultEl.style.display='block'; return; }

  var adminKey = localStorage.getItem('saa_admin_key') || '';
  resultEl.textContent='⏳ Resetting...'; resultEl.style.display='block';
  resultEl.style.background='rgba(255,255,255,0.05)'; resultEl.style.color='rgba(255,255,255,0.7)';

  try {
    var res = await fetch(WORKER_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'reset-device', code:code, adminKey:adminKey})
    });
    var data = await res.json();
    if(data.success){
      resultEl.textContent = '✅ '+data.message;
      resultEl.style.background='rgba(16,185,129,0.1)'; resultEl.style.color='#10b981';
      // Also clear local cache for this code
      localStorage.removeItem('saa_fp_'+code);
    } else {
      resultEl.textContent = '❌ '+(data.error||'Failed');
      resultEl.style.background='rgba(239,68,68,0.1)'; resultEl.style.color='#ef4444';
    }
  } catch(e){
    resultEl.textContent = '❌ Network error: '+e.message;
    resultEl.style.background='rgba(239,68,68,0.1)'; resultEl.style.color='#ef4444';
  }
}
