// ════════════════════════════════════════════════════════════════
// features/navigation.js
// Core app navigation and session lifecycle: page routing
// (showPage — the most depended-upon function in the entire app),
// session start/reset, nav menu, admin login, timers, and quiz
// chip-building. This is foundational infrastructure other
// features call into constantly.
// Extracted from index.html (split, June 2026). Logic unchanged
// except where noted below.
//
// DEPENDENCIES (must load before this file):
//   - core/session-state.js (S, adminLoggedIn)
//   - core/ui-helpers.js    (toast)
//   - core/translations.js  (saApply, saLang — called by showPage)
//   - features/access-codes.js (WORKER_URL constant)
//   - features/payments.js  (switchPayPanel, loadPricingRates,
//     renderMyCodesTable, _pricingData — all called by showPage
//     when navigating to the pricing page)
//   - features/admin-panel.js (loadAnnouncementBanner,
//     adminLoadResearchPrices — called by showPage)
//
// CRITICAL: showPage() is called from nearly every other file in
// this app to switch screens. If this file fails to load, or loads
// in the wrong order relative to its dependencies, the entire app
// breaks. Load this AFTER session-state, ui-helpers, translations,
// access-codes, and payments — but it's fine to load BEFORE quiz.js
// and tutor.js, since those call showPage rather than the reverse.
//
// BUG FOUND AND FIXED DURING THIS EXTRACTION:
// adminLogin() had the same hardcoded-key-poisoning bug already
// found and fixed once before in index.html directly (see earlier
// fixes in this project) — this is a SEPARATE instance of pulling
// the same buggy code from the original source file during this
// extraction pass. FIXED: removed the 'SmartAdmin2024' fallback
// from both places it appeared in this function.
// ════════════════════════════════════════════════════════════════

// ── PAGE ROUTING (most critical function in the app) ─────────────────
function showPage(id){
  // Show marketing links only on landing page
  var marketingLinks = document.querySelectorAll('.nav-marketing');
  marketingLinks.forEach(function(el){
    el.style.display = (id === 'page-landing') ? '' : 'none';
  });
  // Hide Admin button on Research page
  var adminBtn = document.getElementById('nav-admin-btn');
  if(id === 'page-access'){
    // Clear any previous verification status
    var errEl = document.getElementById('code-error');
    var inp   = document.getElementById('code-input');
    var btn   = document.getElementById('btn-verify');
    if(errEl){ errEl.style.display='none'; errEl.textContent=''; }
    if(inp)   inp.value = '';
    if(btn){  btn.textContent='🚀 Verify & Continue to Setup →'; btn.style.background=''; btn.disabled=false; }
  }
  if(id === 'page-progress' && typeof renderProgressPage === 'function'){
    setTimeout(renderProgressPage, 50);
  }
  // Recover results if they show 0/0
  if(id === 'page-results' && window._lastResults){
    setTimeout(function(){
      var scoreEl = document.getElementById('res-score');
      if(scoreEl && (scoreEl.textContent === '0/0' || scoreEl.textContent === '')){
        var r = window._lastResults;
        buildResults(r.c, r.t, r.p);
      }
    }, 200);
  }
  // Announcement banner only shows on the Pricing page — hide it everywhere else
  if(id==='page-pricing'){
    if(typeof loadAnnouncementBanner==='function') loadAnnouncementBanner();
  } else {
    var annBanner = document.getElementById('announcement-banner');
    if(annBanner) annBanner.style.display = 'none';
  }
  if(id==='page-pricing'){ setTimeout(function(){
    if(typeof switchPayPanel==='function') switchPayPanel('intl');
    loadPricingRates();
    setTimeout(renderMyCodesTable, 300);
    // Load research prices from KV
    fetch(WORKER_URL,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({_appSecret:APP_SECRET, action:'get-research-prices'})
    }).then(function(r){ return r.json(); })
    .then(function(data){
      if(data.ok && data.prices && window._pricingData && _pricingData.research){
        if(_pricingData.research && _pricingData.research[0]) _pricingData.research[0][1] = data.prices.rm||20;
      }
      renderPricingPage();
    }).catch(function(){
      if(typeof adminLoadResearchPrices==='function') adminLoadResearchPrices();
      renderPricingPage();
    });
  },50); }
  var nav=document.getElementById('global-nav');
  if(nav){
    if(id==='page-quiz'||id==='page-tutor'){
      nav.style.display='none';
      nav.style.visibility='hidden';
    } else {
      nav.style.display='';
      nav.style.visibility='';
    }
  }
  var tb=document.getElementById('tutor-input-bar');
  if(tb) tb.style.display=(id==='page-tutor')?'block':'none';
  document.querySelectorAll('.page').forEach(p=>{
    p.classList.remove('active');
    p.style.display='none';
  });
  const target=document.getElementById(id);
  if(!target){console.error('showPage: element not found:',id);return;}
  target.classList.add('active');
  target.style.display='block';
  window.scrollTo(0,0);
  // Re-apply language translations on every page switch
  if(typeof saApply === 'function' && typeof saLang !== 'undefined'){
    saApply(saLang);
  }
}

// ── SESSION LIFECYCLE ─────────────────────────────────────────────────
function resetSession(){
  // Clear questions only — keep document loaded
  stopQuizTimer();
  if(window.speechSynthesis) window.speechSynthesis.cancel();
  S.questions  = [];
  S.answers    = [];
  S.streak     = 0;
  S.maxStreak  = 0;
  S.hints      = [];
  S.currentQ   = 0;
  var chatBox = document.getElementById('chat-box');
  var qui     = document.getElementById('question-ui');
  if(chatBox) chatBox.innerHTML = '';
  if(qui)     qui.innerHTML = '';
  showPage('page-profile');
  toast('🗑️ Questions cleared — document still loaded','ok');
}

function exitToHome(){
  stopQuizTimer();
  if(window.speechSynthesis) window.speechSynthesis.cancel();
  if(typeof quizRecognition !== 'undefined' && quizRecognition){ try{ quizRecognition.stop(); }catch(e){} }
  quizAutoRead = false; quizVoiceMode = false;

  // Check code expiry
  if(S.codeExpiry && new Date() > new Date(S.codeExpiry)){
    alert('❌ Your access code has expired. Please contact your administrator for a new code.');
    showPage('page-access');
    return;
  }

  // Clear questions only — keep document and profile
  S.questions = [];
  S.answers   = [];
  S.streak    = 0;
  S.maxStreak = 0;
  S.hints     = [];
  S.currentQ  = 0;

  // Clear UI
  var chatBox = document.getElementById('chat-box');
  var qui     = document.getElementById('question-ui');
  if(chatBox) chatBox.innerHTML = '';
  if(qui)     qui.innerHTML = '';
  var tutorMsgs = document.getElementById('tutor-messages');
  if(tutorMsgs) tutorMsgs.innerHTML = '';

  // Go to session page — document still loaded
  showPage('page-profile');
  toast('← Back to session','ok');
}

function startSession(){
  setTimeout(function(){ renderStreakBadge('streak-badge-study'); }, 500);
  const name = document.getElementById('pf-name').value.trim();
  const level = document.getElementById('pf-level').value;
  const subject = document.getElementById('pf-subject').value.trim();
  // Get language from globe selector (saLang) or fallback to hidden field
  var globeLang = typeof saLang !== 'undefined' ? saLang : 'en';
  var langObj = typeof SA_LANGS !== 'undefined' ? SA_LANGS.find(function(l){return l.c===globeLang;}) : null;
  var lang = langObj ? langObj.n : (document.getElementById('pf-lang').value || 'English');
  // Update hidden field to keep in sync
  var langField = document.getElementById('pf-lang');
  if(langField) langField.value = lang;
  // Only validate identity fields if "With Identity" mode is active
  var identityCard = document.getElementById('identity-card');
  var withIdentity = identityCard && identityCard.style.display !== 'none';
  if(withIdentity){
    if(!name){toast(saT('err_name')||'Please enter your name','err');return;}
    if(!level){toast(saT('err_level')||'Please enter your grade or level','err');return;}
    if(!subject){toast(saT('err_subject')||'Please enter your subject','err');return;}
  }
  if(!S.images.length && !saPDFText){
    if(typeof pdfDoc !== 'undefined' && pdfDoc !== null){
      toast(saT('err_pdf_extract')||'Please click "Use Selected Pages" to extract PDF pages first','err'); return;
    }
    toast(saT('err_no_doc')||'Please upload a document first','err'); return;
  }

  var sessionDate = document.getElementById('pf-date') ? document.getElementById('pf-date').value : '';
  S.name    = withIdentity ? name    : 'Learner';
  S.level   = withIdentity ? level   : 'General';
  S.subject = withIdentity ? subject : 'General';
  S.date    = sessionDate || new Date().toLocaleDateString();
  S.lang    = lang;
  S.diffMode = document.querySelector('.diff-mode-btn.active')?.id?.replace('dmode-','') || 'doc';

  // FULLY clear all previous session data — no old questions can leak
  S.questions  = [];
  S.answers    = [];
  S.streak     = 0;
  S.maxStreak  = 0;
  S.hints      = [];
  S.currentQ   = 0;
  S.retryMode  = false;
  S.studyText  = '';
  S.studyMode  = '';

  // Clear cached offline questions — must not mix with new document
  localStorage.removeItem('saa_offline_session');

  // Navigate directly — no showPage dependency
  document.querySelectorAll('.page').forEach(p=>{
    p.classList.remove('active'); p.style.display='none';
  });
  const qp = document.getElementById('page-quiz');
  qp.classList.add('active'); qp.style.display='block';
  window.scrollTo(0,0);

  buildChips();
  startCodeCountdown();
  startQuizTimer(); // start total session timer
  updateProg();
  initQuiz();
}

// ── NAV MENU ───────────────────────────────────────────────────────────
function toggleMenu(){
  const nav   = document.getElementById('nav-links');
  const btn   = document.getElementById('hamburger');
  const open  = nav.classList.toggle('open');
  btn.classList.toggle('open', open);
  // Close menu when clicking outside
  if(open){
    setTimeout(()=>{
      document.addEventListener('click', closeOnOutside);
    }, 100);
  }
}

function closeMenu(){
  const nav = document.getElementById('nav-links');
  const btn = document.getElementById('hamburger');
  nav.classList.remove('open');
  btn.classList.remove('open');
  document.removeEventListener('click', closeOnOutside);
}

function closeOnOutside(e){
  const nav = document.getElementById('nav-links');
  const btn = document.getElementById('hamburger');
  if(!nav.contains(e.target) && !btn.contains(e.target)){
    closeMenu();
  }
}

// ── ADMIN LOGIN/LOGOUT (overlay open/close + auth) ────────────────────
function openAdmin(){
  const overlay = document.getElementById('admin-overlay');
  overlay.style.display = 'flex';
  overlay.style.zIndex = '99999';
  overlay.classList.add('open');
}

function closeAdmin(){
  const overlay = document.getElementById('admin-overlay');
  overlay.style.display = 'none';
  overlay.classList.remove('open');
}

function adminLogin(){
  var pw = document.getElementById('admin-pw').value;
  if(!pw){ document.getElementById('admin-err').style.display='block'; return; }

  var btn = document.getElementById('admin-login-btn');
  if(btn){ btn.textContent='⏳ Verifying...'; btn.disabled=true; }

  function _openAdminDashboard(){
    adminLoggedIn = true;
    document.getElementById('admin-login-form').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    document.getElementById('admin-err').style.display = 'none';
    var drcLink = document.getElementById('drc-admin-link');
    if(drcLink) drcLink.style.display = 'block';
    checkApiKeyStatus();
    checkPromptStatus();
    try{ generatedCodes = JSON.parse(localStorage.getItem('saa_codes')||'[]'); }catch(e){ generatedCodes=[]; }
    loadGeneratedCodes();
    renderAllCodes();
    adminLoadSettingsFromKV(function(){
      setTimeout(function(){
        if(typeof adminCheckLayout === "function") adminCheckLayout();
        if(typeof adminRenderCodesTable === "function") adminRenderCodesTable();
        if(typeof adminLoadTariffs === "function") adminLoadTariffs();
        if(typeof adminLoadMaintenanceStatus === "function") adminLoadMaintenanceStatus();
      }, 100);
    });
    if(window._adminCostInterval) clearInterval(window._adminCostInterval);
    window._adminCostInterval = setInterval(function(){
      if(adminLoggedIn && typeof adminRenderCodesTable === 'function') adminRenderCodesTable();
    }, 30000);
    toast('✅ Admin access granted','ok');
  if(typeof adminLoadDmStats==='function') setTimeout(adminLoadDmStats,100);
  if(typeof adminLoadResearchPrices==='function') setTimeout(adminLoadResearchPrices,100);
  if(typeof adminLoadCostLimitPct==='function') setTimeout(adminLoadCostLimitPct,150);
  var _rci = document.getElementById('research-master-code-input'); if(_rci) _rci.value = localStorage.getItem('saa_research_code')||'';
  }

  // 5 second timeout — fallback to local check if Worker doesn't respond
  var _timedOut = false;
  var _timeout = setTimeout(function(){
    _timedOut = true;
    if(btn){ btn.textContent='🔐 Access Admin Panel'; btn.disabled=false; }
    // Fallback: local password check
    var localPw = localStorage.getItem('saa_admin_pw') || '';
    if(pw === localPw){
      _openAdminDashboard();
    } else {
      document.getElementById('admin-err').style.display='block';
      document.getElementById('admin-pw').value='';
    }
  }, 5000);

  fetch('https://smartacademy-ai.kasongokimba.workers.dev', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({_appSecret:APP_SECRET, action:'verify-admin-password', password:pw})
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(_timedOut) return; // already handled by timeout
    clearTimeout(_timeout);
    if(btn){ btn.textContent='🔐 Access Admin Panel'; btn.disabled=false; }
    if(!d.valid){
      document.getElementById('admin-err').style.display='block';
      document.getElementById('admin-pw').value='';
      return;
    }
    localStorage.setItem('saa_admin_key', d.adminKey||'');
    _openAdminDashboard();
  })
  .catch(function(){
    if(_timedOut) return;
    clearTimeout(_timeout);
    if(btn){ btn.textContent='🔐 Access Admin Panel'; btn.disabled=false; }
    // Fallback to local check on network error
    var localPw = localStorage.getItem('saa_admin_pw') || '';
    if(pw === localPw){
      _openAdminDashboard();
    } else {
      document.getElementById('admin-err').style.display='block';
      document.getElementById('admin-pw').value='';
    }
  });
}

function adminLogout(){
  adminLoggedIn = false;
  if(window._adminCostInterval){ clearInterval(window._adminCostInterval); window._adminCostInterval=null; }
  document.getElementById('admin-login-form').style.display = 'block';
  document.getElementById('admin-dashboard').style.display = 'none';
  document.getElementById('admin-pw').value = '';
  document.getElementById('admin-err').style.display = 'none';
}

// ── ADMIN: API KEY & PROMPT OVERRIDE MANAGEMENT ───────────────────────
function saveApiKey(){
  const key = document.getElementById('api-key-input').value.trim();
  if(!key){ toast('Please paste your API key first','err'); return; }
  localStorage.setItem('saa_api_key', key);
  document.getElementById('api-status').textContent = '✅ Key saved';
  document.getElementById('api-key-input').value = '••••••••••••••••••••';
  toast('API key saved successfully','ok');
}

function clearApiKey(){
  localStorage.removeItem('saa_api_key');
  document.getElementById('api-key-input').value = '';
  document.getElementById('api-status').textContent = '';
  toast('API key cleared','inf');
}

function savePromptOverride(){
  const val = document.getElementById('prompt-override').value.trim();
  if(!val){ toast('Nothing to save — field is empty','err'); return; }
  localStorage.setItem('saa_prompt_override', val);
  document.getElementById('prompt-status').innerHTML = '<span style="color:#f59e0b">⚠️ Override active — embedded v6.0 prompt is bypassed</span>';
  toast('Prompt override saved','ok');
}

function clearPromptOverride(){
  localStorage.removeItem('saa_prompt_override');
  document.getElementById('prompt-override').value = '';
  document.getElementById('prompt-status').innerHTML = '<span style="color:#10b981">✅ Using embedded v6.0 prompt</span>';
  toast('Override cleared — using full embedded v6.0 prompt','ok');
}

function checkPromptStatus(){
  const ov = localStorage.getItem('saa_prompt_override');
  const el = document.getElementById('prompt-status');
  if(el){
    el.innerHTML = ov
      ? '<span style="color:#f59e0b">⚠️ Override active — embedded v6.0 prompt is bypassed</span>'
      : '<span style="color:#10b981">✅ Using embedded v6.0 prompt</span>';
    if(ov) document.getElementById('prompt-override').value = ov;
  }
}

function checkApiKeyStatus(){
  const k = localStorage.getItem('saa_api_key');
  document.getElementById('api-status').textContent = k ? '✅ Key is saved' : '⚠️ No key saved yet';
}

function getApiKey(){ return localStorage.getItem('saa_api_key') || ''; }

// ── PROFILE/SETUP PAGE OPTIONS ────────────────────────────────────────
function selectDiffMode(mode){
  S.diffMode = mode;
  document.querySelectorAll('.diff-mode-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('dmode-' + mode).classList.add('active');
}

function doGenerateCode(){
  if(_generatingCode){ return; } // prevent double click
  _generatingCode = true;
  setTimeout(function(){ _generatingCode = false; }, 3000); // unlock after 3s
  var type     = window._codeType || 'W';
  var adminKey = localStorage.getItem('saa_admin_key') || '';
  var WORKER   = 'https://smartacademy-ai.kasongokimba.workers.dev';
  var box      = document.getElementById('generated-codes');
  var boxTop   = document.getElementById('generated-codes-top');
  var btn      = document.getElementById('btn-gen-code');

  // Generate code locally first
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var rand = '';
  for(var i=0;i<7;i++) rand += chars[Math.floor(Math.random()*chars.length)];
  var code = type + '-' + rand;

  // Calculate duration — include RM/RS/RY
  var msMap = {
    H:60*60*1000, D:24*60*60*1000,
    W:7*24*60*60*1000, M:30*24*60*60*1000, Y:365*24*60*60*1000,
    RM:30*24*60*60*1000, RS:180*24*60*60*1000, RY:365*24*60*60*1000
  };
  var durationMs = msMap[type] || msMap.W;
  var expiresAt = Date.now() + durationMs;

  // Show loading
  if(btn){ btn.textContent='⏳ Generating...'; btn.disabled=true; }
  var btnTop2 = document.getElementById('btn-gen-code-top');
  if(btnTop2){ btnTop2.textContent='⏳ Generating...'; btnTop2.disabled=true; }
  box.innerHTML = '<div class="no-codes">Registering code...</div>';

  // Helper to display the generated code
  function _showCode(expiresAt){
    var expStr = new Date(expiresAt).toLocaleDateString('en-GB');
    var labelMap = {W:'Weekly',M:'Monthly',RM:'Research 30d'};
    var label = labelMap[type] || type;
    var isResearch = (type==='RM'||type==='RS'||type==='RY');
    var codeColor = isResearch ? '#a78bfa' : '#3b82f6';
    var borderColor = isResearch ? 'rgba(124,58,237,0.4)' : 'rgba(59,130,246,0.3)';
    var stored = JSON.parse(localStorage.getItem('saa_codes')||'[]');
    stored.push({code:code, type:label, expiry:expStr, created:Date.now()});
    localStorage.setItem('saa_codes', JSON.stringify(stored));
    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);border:1px solid '+borderColor+';border-radius:8px;padding:12px 14px;margin-top:8px;">'+
        '<div>'+
          '<div id="gen-code-val" style="font-family:monospace;font-size:20px;font-weight:700;color:'+codeColor+';letter-spacing:3px;">'+code+'</div>'+
          '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:3px;">'+label+' · Expires '+expStr+(isResearch?' · 🔬 Research Pipeline':' · 🔒 Device-locked on first use')+'</div>'+
        '</div>'+
        '<button id="btn-copy-code" style="background:rgba(124,58,237,0.2);border:1px solid '+borderColor+';color:'+codeColor+';padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;font-size:13px;">📋 Copy</button>'+
      '</div>';
    document.getElementById('btn-copy-code').addEventListener('click', function(){
      navigator.clipboard.writeText(code).then(function(){
        document.getElementById('btn-copy-code').textContent = '✅ Copied!';
        setTimeout(function(){ document.getElementById('btn-copy-code').textContent = '📋 Copy'; }, 2000);
      });
    });
    toast('✅ Code '+code+' generated!','ok');
    window._lastGeneratedCode = code;
    if(btn){ btn.textContent='⚡ Generate Access Code'; btn.disabled=false; }
    var btnTop = document.getElementById('btn-gen-code-top');
    if(btnTop){ btnTop.textContent='⚡ Generate Access Code'; btnTop.disabled=false; }
    if(boxTop) boxTop.innerHTML = box.innerHTML;
    if(typeof adminRenderCodesTable === 'function') adminRenderCodesTable();
  }

  // Register in Worker KV using .then() — no async/await needed
  fetch(WORKER, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({_appSecret:APP_SECRET,action:'generate-code',code:code,type:type,durationMs:durationMs,adminKey:adminKey})
  }).then(function(r){ return r.json(); })
  .then(function(data){
    if(!data.success){
      box.innerHTML = '<div style="color:#ef4444;padding:10px;">❌ Error: '+(data.error||'Failed to register')+'</div>';
      if(btn){ btn.textContent='⚡ Generate Access Code'; btn.disabled=false; }
      return;
    }
    _showCode(data.expiresAt || expiresAt);
  }).catch(function(e){
    console.warn('Worker registration failed:', e.message);
    _showCode(expiresAt); // Show code anyway (offline fallback)
  });
  return; // rest handled in .then()
}

function doClearCodes(){
  if(!confirm('Clear all codes from this display? (Codes already shared with students will still work until they expire.)')) return;
  // Clear localStorage
  localStorage.removeItem('saa_codes');
  localStorage.removeItem('saa_saved_codes');
  // Set a flag to prevent auto-refetch from KV
  localStorage.setItem('saa_codes_cleared', '1');
  // Clear generated-codes display
  var box = document.getElementById('generated-codes');
  if(box) box.innerHTML = '<div class="no-codes">No codes generated yet</div>';
  // Clear all-codes-list display
  var allBox = document.getElementById('all-codes-list');
  if(allBox) allBox.innerHTML = '<div class="no-codes">No codes generated this session</div>';
  // Clear in-memory array
  if(typeof generatedCodes !== 'undefined') generatedCodes = [];
  // Show empty table directly
  var tbody = document.getElementById('codes-table-body');
  if(tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:rgba(255,255,255,0.3);font-size:12px;">No codes found</td></tr>';
  toast('Codes cleared from display','ok');
}

function switchUploadTab(tab){
  // Always show BOTH upload sections simultaneously
  var ui=document.getElementById('upload-img-section'); if(ui) ui.style.display='block';
  var up=document.getElementById('upload-pdf-section'); if(up) up.style.display='block';
}

// ── QUIZ TIMER ─────────────────────────────────────────────────────────
function selectTimerDuration(mins){
  _timerMinutes = mins;
  document.querySelectorAll('.timer-opt').forEach(function(el){
    el.style.border = '2px solid #e2e8f0';
    el.style.background = '';
    el.querySelector('div').style.color = 'var(--navy)';
    if(el.querySelector('div:last-child')) el.querySelector('div:last-child').style.color = 'var(--muted)';
  });
  var sel = document.getElementById('topt-'+mins);
  if(sel){
    sel.style.border = '2px solid #1a56db';
    sel.style.background = '#eff6ff';
    var divs = sel.querySelectorAll('div');
    if(divs[0]) divs[0].style.color = '#1a56db';
    if(divs[1]) divs[1].style.color = '#1a56db';
  }
}

function startQuizTimer(){
  stopQuizTimer();
  // Only run if timer was enabled on setup page
  if(!_timerEnabled) return;
  _quizTimerSeconds = (_timerMinutes || 15) * 60;
  _quizTimerWarned  = false;

  var display = document.getElementById('quiz-timer-display');
  if(display) display.style.display = 'inline-block';

  _quizTimerInterval = setInterval(function(){
    _quizTimerSeconds--;
    updateQuizTimerDisplay();
    if(_quizTimerSeconds <= 0){
      stopQuizTimer();
      autoSubmitQuiz();
    } else if(_quizTimerSeconds === 120 && !_quizTimerWarned){
      _quizTimerWarned = true;
      toast('⏰ 2 minutes remaining!','warn');
      var d = document.getElementById('quiz-timer-display');
      if(d){ d.style.color='#ef4444'; d.style.borderColor='rgba(239,68,68,0.4)'; d.style.background='rgba(239,68,68,0.1)'; }
    }
  }, 1000);

  updateQuizTimerDisplay();
}

function updateQuizTimerDisplay(){
  var display = document.getElementById('quiz-timer-display');
  if(!display) return;
  var m = Math.floor(_quizTimerSeconds / 60);
  var s = _quizTimerSeconds % 60;
  display.textContent = '⏰ ' + (m<10?'0':'')+m + ':' + (s<10?'0':'')+s;
  // Turn orange under 5 min
  if(_quizTimerSeconds <= 300 && _quizTimerSeconds > 120){
    display.style.color = '#f59e0b';
    display.style.borderColor = 'rgba(245,158,11,0.4)';
    display.style.background = 'rgba(245,158,11,0.1)';
  }
}

function stopQuizTimer(){
  if(_quizTimerInterval){ clearInterval(_quizTimerInterval); _quizTimerInterval = null; }
  var display = document.getElementById('quiz-timer-display');
  if(display) display.style.display = 'none';
}

// ── QUIZ NAVIGATION CHIPS & CODE EXPIRY COUNTDOWN ─────────────────────
function buildChips(){
  const days = S.codeExpiry ? Math.ceil((S.codeExpiry-new Date())/(1000*60*60*24)) : 365;
  document.getElementById('quiz-chips').innerHTML = [
    ['👤',S.name],['📚',S.subject],['🌍',S.lang],
    ['📝',S.qCount+' Qs'],['🔐', getTimeLeft()]
  ].map(([e,v])=>`<div class="chip">${e} <strong>${v}</strong></div>`).join('');

  // Update session info panel
  const si = id => document.getElementById(id);
  if(si('si-name'))    si('si-name').textContent    = S.name;
  if(si('si-subject')) si('si-subject').textContent = S.subject;
  if(si('si-level'))   si('si-level').textContent   = S.level;
  if(si('si-lang'))    si('si-lang').textContent     = S.lang;
  if(si('si-qcount'))  si('si-qcount').textContent  = S.qCount + ' questions';
  if(si('si-date'))    si('si-date').textContent     = S.date;
}

function getTimeLeft(){
  if(!S.codeExpiry) return '365d left';
  var ms = new Date(S.codeExpiry) - new Date();
  if(ms <= 0) return '⛔ Expired';
  var totalMins = Math.ceil(ms/(1000*60));
  if(totalMins <= 60) return totalMins+'m left';
  var hrs = Math.ceil(ms/(1000*60*60));
  if(hrs <= 24) return hrs+'h left';
  return Math.ceil(ms/(1000*60*60*24))+'d left';
}

function startCodeCountdown(){
  if(_codeCountdownTimer) clearInterval(_codeCountdownTimer);
  _codeCountdownTimer = setInterval(function(){
    if(!S.codeExpiry) return;
    var ms = new Date(S.codeExpiry) - new Date();
    // Update chip
    var chips = document.getElementById('quiz-chips');
    if(chips){
      var chipDivs = chips.querySelectorAll('.chip');
      chipDivs.forEach(function(chip){
        if(chip.textContent.includes('left') || chip.textContent.includes('Expired') || chip.innerHTML.includes('🔐')){
          chip.innerHTML = '🔐 <strong>' + getTimeLeft() + '</strong>';
        }
      });
    }
    // Block if expired
    if(ms <= 0){
      clearInterval(_codeCountdownTimer);
      if(S.quizActive){
        alert('⛔ Your access code has expired. The quiz has ended.');
        showPage('page-access');
      }
    }
  }, 60000); // every 60 seconds
}

// ── AI PROMPT BUILDERS (used by initQuiz in quiz.js) ──────────────────
function buildSystem(){
  // System Prompt v6.0 is now hidden on Cloudflare Worker
  // Browser only sends learner profile and images
  return '';
}

function buildUserMsg(){
  // If Excel/PDF text is loaded, use text only (no images)
  if(saPDFText){
    return [{
      type:'text',
      text:'The following is data from an Excel spreadsheet.\n\n[EXCEL DATA]\n' + saPDFText
    }];
  }

  const diffInstructions = {
    'hard': `YOU MUST FOLLOW THIS RULE: Do NOT ask any question that can be answered from the document images. Read the document ONLY to identify the subject/topic. Then generate ${S.qCount} completely NEW questions on that topic from your own knowledge that are NOT in the document. If a student reads only this document, they should NOT be able to answer these questions without additional study. Every question must come from OUTSIDE the document.`,
    'complex': `YOU MUST FOLLOW THIS RULE: Read the document to identify the base concepts only. Then generate ${S.qCount} HARDER multi-step questions that go significantly BEYOND what is shown in the document. Combine two or more concepts, add extra calculation steps, use real-world application scenarios. Do NOT copy or paraphrase any question from the document.`,
    'doc': S.isNewQRetry ? `Generate ${S.qCount} COMPLETELY NEW and DIFFERENT questions from your previous set, but STRICTLY from what is written in the document images only. Every answer must be found directly in the document. DO NOT generate questions from outside the document.` : `Generate ${S.qCount} questions STRICTLY from what is written in the document images. Every answer must be directly found in the document.`
  };
  const diffInstruction = diffInstructions[S.diffMode] || diffInstructions['doc'];

  const mathSymbolInstruction = `CRITICAL MATH NOTATION RULES — always use these symbols directly:
• Fractions: ALWAYS use LaTeX \\(\\frac{a}{b}\\) format. Write \\(\\frac{2}{4}x^4\\) NOT "(2/4)x^4"
• Integrals: use ∫ symbol. Write ∫(2x-6)⁴ dx NOT "integral of (2x-6)^4*dx"
• Derivatives: write d/dx[f(x)] NOT "the derivative of"
• Limits: write lim(x→a) NOT "the limit as x approaches"
• Trig: use cos, sin, tan, cot, sec, csc (NOT cosine, sine, tangent etc.)
• Greek: use θ, π, α, β, δ, σ, λ, ∞, φ, ω directly (NOT theta, pi, alpha etc.)
• Angles: use ∠ symbol (NOT the word "angle"). Degrees: use °
• Powers: use ² ³ or ^ notation. Write x² NOT "x squared"
• Roots: use √ ∛ symbols (NOT "square root of")
• Never use *dx — write dx with a space: ∫f(x) dx
• For ALL fractions in answers and questions use \\(\\frac{numerator}{denominator}\\)`;

  // OpenAI vision format — content array with text and image_url blocks
  const content = [
    {
      type:'text',
      text:`Read these ${S.images.length} document image(s). ${mathSymbolInstruction} Each question must test a DIFFERENT aspect. Vary question types, vary values, vary what is unknown. Session ID: ${Date.now()}-${Math.random().toString(36).slice(2,10)}. CRITICAL INSTRUCTION: ${diffInstruction} Return ONLY valid JSON as specified.`
    }
  ];

  S.images.forEach((img,i)=>{
    if(img.type === 'excel') return; // skip Excel placeholder
    content.push({
      type:'text',
      text:`--- Page ${i+1} of ${S.images.length} ---`
    });
    content.push({
      type:'image_url',
      image_url:{
        url: img.data,
        detail:'high'
      }
    });
  });

  return content;
}
