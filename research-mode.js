// ════════════════════════════════════════════════════════════════
// features/research-mode.js
// Research-mode access gate: code entry/unlock, page-range
// selection for uploaded documents, and the master-code admin
// shortcut. This gates access to the DualMind research chat
// feature (features/dualmind.js — not yet extracted).
// Extracted from index.html (split, June 2026). Logic unchanged
// except where noted below.
//
// DEPENDENCIES (must load before this file):
//   - core/session-state.js (S — S.researchCode)
//   - features/access-codes.js (WORKER_URL, getDeviceFingerprint)
//
// BUG FOUND AND FIXED DURING THIS EXTRACTION:
//
// NAME COLLISION (same bug class as adminResetDevice, fixed earlier):
// the original file defined BOTH rgGrant(code) and rgReset() TWICE
// each — once with real logic, once again later with a simplified/
// duplicate body. Per JavaScript's rules, the LATER definition wins,
// silently discarding the earlier one everywhere in the file.
//
//   - rgGrant: the second (winning) definition omitted the code-
//     storage logic (S.researchCode never got set from cost-tracking
//     attribution). FIXED: kept only the first, more complete
//     definition (the one that handles incoming code + input-field
//     fallback). In the original file, every caller passed no
//     arguments anyway, so behavior is very close to before — but
//     S.researchCode now reliably gets set via the input-field
//     fallback path, where previously it never could.
//   - rgReset: both definitions were byte-for-byte identical, so
//     this was redundant code with no behavioral bug. FIXED: kept
//     only one copy.
//
// Five additional functions (rgSelectAllPages, rgClearAllPages,
// rgTogglePage, rgTogglePage_ui, rgUpdateSelectedPages) were found
// as intentionally EMPTY stub functions in the original file
// (e.g. `function rgSelectAllPages(){}`) — preserved as-is, since
// they may be referenced by onclick handlers that expect them to
// exist even though they currently do nothing.
// ════════════════════════════════════════════════════════════════

// ── RESEARCH MASTER CODE (admin convenience shortcut) ────────────────
function saveResearchMasterCode(){
  var inp = document.getElementById('research-master-code-input');
  var status = document.getElementById('research-master-code-status');
  if(!inp) return;
  var code = inp.value.trim().toUpperCase();
  if(!code){ if(status) status.textContent = ''; localStorage.removeItem('saa_research_code'); return; }
  var prefix = code.split('-')[0];
  if(prefix !== 'RM' && prefix !== 'RS' && prefix !== 'RY'){
    if(status){ status.style.color='#ef4444'; status.textContent = '❌ Code must start with RM-, RS-, or RY-'; } return;
  }
  localStorage.setItem('saa_research_code', code);
  if(status){ status.style.color='#10b981'; status.textContent = '✅ Saved: '+code; }
  toast('Research code saved','ok');
}




// ── RESEARCH GATE: GRANT ACCESS (canonical version — see header) ─────
function rgGrant(code){
  sessionStorage.setItem('saa_research_unlocked','1');
  // Store code for cost tracking
  if(code) {
    S.researchCode = code;
    sessionStorage.setItem('saa_current_research_code', code);
  } else {
    // Try to recover from input
    var inp = document.getElementById('rg-code-input');
    var c = inp ? inp.value.trim().toUpperCase() : '';
    if(c && (c.startsWith('RM-')||c.startsWith('RS-')||c.startsWith('RY-'))){
      S.researchCode = c;
      sessionStorage.setItem('saa_current_research_code', c);
    }
  }
  var gate = document.getElementById('research-inline-gate');
  var main = document.getElementById('research-main-content');
  if(gate) gate.style.display = 'none';
  if(main) main.style.display = 'flex';
  
}


// ── RESEARCH GATE: RESET TO LOCKED STATE (canonical version) ─────────
function rgReset(){
  // Called when navigating to research page
  if(sessionStorage.getItem('saa_research_unlocked')==='1'){
    var gate = document.getElementById('research-inline-gate');
    var main = document.getElementById('research-main-content');
    if(gate) gate.style.display = 'none';
    if(main) main.style.display = 'flex';
  } else {
    var gate = document.getElementById('research-inline-gate');
    var main = document.getElementById('research-main-content');
    if(gate) gate.style.display = 'flex';
    if(main) main.style.display = 'none';
    var inp = document.getElementById('rg-code-input');
    var err = document.getElementById('rg-error');
    if(inp) inp.value = '';
    if(err) err.textContent = '';
  }
}


// ══════════════════════════════════════════════
// RESEARCH: Page selector (From/To range)
// ══════════════════════════════════════════════

// ── RESEARCH PAGE SELECTION (range picker for uploaded document) ─────
function rgBuildPageThumbs(){
  // Called after upload — show the range selector
  var selector = document.getElementById('research-page-selector');
  var fromEl = document.getElementById('rg-from-page');
  var toEl = document.getElementById('rg-to-page');
  var total = _researchAllPages.length;
  if(!total) return;
  if(fromEl){ fromEl.max = total; fromEl.value = 1; }
  if(toEl){ toEl.max = total; toEl.value = total; }
  if(selector) selector.style.display = 'block';
  rgUpdatePageRange();
}

function rgUpdatePageRange(){
  var fromEl = document.getElementById('rg-from-page');
  var toEl   = document.getElementById('rg-to-page');
  var status = document.getElementById('rg-range-status');
  var countLbl = document.getElementById('research-page-count-label');
  var total = _researchAllPages.length;
  if(!fromEl || !toEl || !total) return;

  var from = Math.max(1, parseInt(fromEl.value)||1);
  var to   = Math.min(total, parseInt(toEl.value)||total);
  if(from > to) to = from;
  if(to > total) to = total;

  // Clamp inputs
  fromEl.value = from;
  toEl.value   = to;

  var count = to - from + 1;
  _researchImages = _researchAllPages.slice(from-1, to).map(function(p){ return p.b64; });

  if(status) status.textContent = '✅ '+count+' page(s) will be sent to AI';
  if(countLbl) countLbl.textContent = from+' – '+to+' of '+total+' pages';
}

// ── STUB FUNCTIONS (intentionally empty in the original file) ────────
function rgSelectAllPages(){}
function rgClearAllPages(){}
function rgTogglePage(i){}
function rgTogglePage_ui(i,on){}
function rgUpdateSelectedPages(){}

// ── RESEARCH GATE: CODE ENTRY & VALIDATION ────────────────────────────
function rgUnlock(){
  var inp = document.getElementById('rg-code-input');
  var err = document.getElementById('rg-error');
  var code = inp ? inp.value.trim().toUpperCase() : '';

  if(!code){ if(err) err.textContent = 'Please enter your research code.'; return; }

  // Admin bypass
  if(code === 'RM-ADMIN' || code === 'RESEARCH-ADMIN'){
    rgGrant(); return;
  }

  // Check admin-set code
  var saved = (localStorage.getItem('saa_research_code')||'').toUpperCase();
  if(saved && code === saved){ rgGrant(); return; }

  // Format check
  var prefix = code.split('-')[0];
  if(prefix !== 'RM' && prefix !== 'RS' && prefix !== 'RY'){
    if(err) err.textContent = '❌ Code must start with RM-, RS-, or RY-';
    return;
  }

  // Validate via Worker
  if(err) err.textContent = '⏳ Checking...';
  fetch(WORKER_URL,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({_appSecret:APP_SECRET,action:'validate-code',code:code,fingerprint:getDeviceFingerprint()})
  }).then(function(r){return r.json();})
  .then(function(d){
    if(d.valid){ rgGrant(); }
    else{ if(err) err.textContent='❌ '+(d.error||'Invalid code. Try again.'); }
  }).catch(function(){
    // Offline fallback — accept valid format
    rgGrant();
  });
}

// ── RESEARCH MATH RENDERING & UPLOAD MANAGEMENT ───────────────────────
function renderResearchMath(el){
  if(window.MathJax && MathJax.typesetPromise){
    MathJax.typesetPromise([el]).catch(function(){});
  }
}

function clearResearchUpload(){
  _researchImages = [];
  _researchAllPages = [];
  var inp = document.getElementById('research-file-input');
  if(inp) inp.value = '';
  var lbl = document.getElementById('research-file-label');
  var btn = document.getElementById('research-delete-btn');
  var sel = document.getElementById('research-page-selector');
  var thumbs = document.getElementById('research-page-thumbs');
  if(lbl) lbl.textContent = '';
  if(btn) btn.style.display = 'none';
  if(sel) sel.style.display = 'none';
  if(thumbs) thumbs.innerHTML = '';
  toast('Document removed','ok');
}

function updateResearchLangDisplay(selected){
  var disp = document.getElementById('research-lang-selected');
  if(!disp) return;
  disp.innerHTML = selected.map(function(l){
    return '<span style="padding:4px 10px;border-radius:14px;font-size:11px;font-weight:700;background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.35);color:#06b6d4;font-family:DM Sans,sans-serif;">'+l+'</span>';
  }).join('');
}

// ── RESEARCH GATE: OPEN/VERIFY (page-level gate, separate from inline) ──
function openResearchGate(){
  // If already unlocked this session, go straight in
  if(sessionStorage.getItem('saa_research_unlocked') === '1'){
    showPage('page-access'); return;
  }
  var modal = document.getElementById('research-gate-modal');
  if(modal){ modal.style.display = 'flex'; }
  var inp = document.getElementById('research-gate-input');
  if(inp){ inp.value = ''; inp.focus(); }
  var err = document.getElementById('research-gate-error');
  if(err) err.textContent = '';
}

function verifyResearchGate(){
  var inp = document.getElementById('research-gate-input');
  var err = document.getElementById('research-gate-error');
  var code = (inp ? inp.value.trim().toUpperCase() : '');
  if(!code){ if(err) err.textContent = 'Please enter your research code.'; return; }

  // Admin master override
  if(code === 'RESEARCH-ADMIN' || code === 'RM-ADMIN'){
    sessionStorage.setItem('saa_research_unlocked','1');
    S.researchCode = 'RM-ADMIN';
  sessionStorage.setItem('saa_current_research_code', 'RM-ADMIN');
    sessionStorage.setItem('saa_current_research_code','RM-ADMIN');
    document.getElementById('research-gate-modal').style.display = 'none';
    showPage('page-access');
    
    return;
  }

  // Must start with RM, RS, or RY
  var prefix = code.split('-')[0];
  if(prefix !== 'RM' && prefix !== 'RS' && prefix !== 'RY'){
    if(err) err.textContent = '❌ Research codes start with RM-, RS-, or RY-';
    return;
  }

  // Check admin-set research code from localStorage
  var adminResearchCode = localStorage.getItem('saa_research_code') || '';
  if(adminResearchCode && code === adminResearchCode.toUpperCase()){
    sessionStorage.setItem('saa_research_unlocked','1');
    document.getElementById('research-gate-modal').style.display = 'none';
    showPage('page-access');
    
    return;
  }

  // Validate via Worker (existing code validation)
  var btn = document.querySelector('#research-gate-modal button');
  fetch(WORKER_URL, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ _appSecret: APP_SECRET, action:'validate-code', code: code, fingerprint: getDeviceFingerprint() })
  }).then(function(r){ return r.json(); })
  .then(function(d){
    if(d.valid){
      sessionStorage.setItem('saa_research_unlocked','1');
      S.researchCode = code;
      document.getElementById('research-gate-modal').style.display = 'none';
      showPage('page-access');
      
    } else {
      if(err) err.textContent = '❌ ' + (d.error || 'Code not found. Check and try again.');
    }
  }).catch(function(){
    // Offline fallback — accept any properly formatted RM/RS/RY code
    sessionStorage.setItem('saa_research_unlocked','1');
    document.getElementById('research-gate-modal').style.display = 'none';
    showPage('page-access');
    
  });
}
