// ════════════════════════════════════════════════════════════════
// features/admin-panel.js
// Admin-only controls: settings sync, code management table,
// tariff/pricing editing, maintenance mode, announcement banner,
// PIN recovery tools, trial activation, cost-limit configuration,
// and research-mode pricing.
// Extracted from index.html (split, June 2026). Logic unchanged
// except where noted below.
//
// DEPENDENCIES (must load before this file):
//   - core/session-state.js (S)
//   - core/ui-helpers.js    (toast)
//   - features/access-codes.js (WORKER_URL constant — shared, see below)
//   - features/payments.js (_pricingData, used by tariff-editing)
//
// SCOPE NOTE: admin-related code was scattered across at least 6
// separate, non-contiguous zones of the original 17,000-line file,
// often interleaved with student-facing features. Functions for
// trial-code REDEMPTION (student-facing: checkTrialCode, startTrial,
// showTrialCard) and research-mode unlocking (rgGrant,
// saveResearchMasterCode) were found nearby but are NOT included
// here — they belong with quiz/payments since students use them,
// not admins. Only admin-side trial ACTIVATION (adminActivateTrial,
// adminDeactivateTrial, adminRefreshTrial) is included.
//
// BUGS FOUND AND FIXED DURING THIS EXTRACTION:
//
// 1. Hardcoded admin-key fallback ('SmartAdmin2024'), found in 16
//    separate locations across this zone alone — same vulnerability
//    class fixed everywhere else in this project. FIXED: removed.
//
// 2. adminSaveResearchPrices() sent the literal string 'SmartAdmin2024'
//    directly (not even reading localStorage) — the same independent
//    bug already found and fixed once before in this codebase, but
//    this was a SEPARATE occurrence inside the admin-panel zone.
//    FIXED: now reads the real stored key.
//
// 3. NAMING INCONSISTENCY (not a bug, but cleaned up): three trial-
//    related functions used a third, independently-declared worker
//    URL variable named `WU` (var WU='https://...') instead of the
//    `WORKER_URL` constant used everywhere else. NORMALIZED: all
//    three now use the shared WORKER_URL constant from
//    access-codes.js, so there's one single source of truth for the
//    worker's address instead of three.
// ════════════════════════════════════════════════════════════════

// ── ADMIN LAYOUT & TAB SWITCHING ─────────────────────────────────────
function adminCheckLayout(){
  var isMobile = window.innerWidth < 768;
  var tabs   = document.getElementById('admin-tabs');
  var twoCol = document.getElementById('admin-two-col');
  var colS   = document.getElementById('admin-col-settings');
  var colC   = document.getElementById('admin-col-codes');
  if(!colS||!colC) return;
  if(isMobile){
    if(tabs) tabs.style.display = 'flex';
    if(twoCol) twoCol.style.flexDirection = 'column';
    var isCodesActive = colC.style.display === 'block';
    colS.style.display = isCodesActive ? 'none' : 'block';
    colC.style.display = isCodesActive ? 'block' : 'none';
  } else {
    if(tabs) tabs.style.display = 'none';
    if(twoCol){
      twoCol.style.display = 'flex';
      twoCol.style.flexDirection = 'row';
      twoCol.style.alignItems = 'flex-start';
      twoCol.style.gap = '16px';
    }
    colS.style.display = 'block';
    colS.style.flex = '0 0 380px';
    colS.style.maxWidth = '380px';
    colC.style.display = 'block';
    colC.style.flex = '1';
    colC.style.minWidth = '0';
    if(typeof adminRenderCodesTable === "function") adminRenderCodesTable();
  }
}

function adminTab(tab){
  var colS=document.getElementById('admin-col-settings'),colC=document.getElementById('admin-col-codes'),colD=document.getElementById('admin-col-drc');
  var btnS=document.getElementById('atab-settings'),btnC=document.getElementById('atab-codes'),btnD=document.getElementById('atab-drc');
  [colS,colC,colD].forEach(function(x){if(x)x.style.display='none';});
  [btnS,btnC,btnD].forEach(function(x){if(x){x.style.background='transparent';x.style.color='rgba(255,255,255,0.5)';}});
  if(tab==='settings'){if(colS)colS.style.display='block';if(btnS){btnS.style.background='#1a56db';btnS.style.color='#fff';}
  }else if(tab==='drc'){if(colD)colD.style.display='block';if(btnD){btnD.style.background='#0e7490';btnD.style.color='#fff';}
    var el=document.getElementById('drc-wa-number');if(el)el.value=localStorage.getItem('saa_drc_contact')||'+27761328664';
    // Fetch latest CDF rate from KV
    fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'get-fx-rates'})
    }).then(function(r){return r.json();}).then(function(d){
      var rate = (d.ok&&d.cdf) ? d.cdf : (localStorage.getItem('saa_fx_cdf')||'2800');
      if(d.ok&&d.cdf) localStorage.setItem('saa_fx_cdf', rate.toString());
      var rateEl=document.getElementById('admin-cdf-rate');if(rateEl)rateEl.value=rate;
      var cur=document.getElementById('cdf-current-display');
      if(cur) cur.textContent='Active rate: 1 USD = '+rate+' CDF · $5='+(5*rate).toLocaleString()+' · $10='+(10*rate).toLocaleString()+' · $90='+(90*rate).toLocaleString();
    }).catch(function(){
      var rate=localStorage.getItem('saa_fx_cdf')||'2800';
      var rateEl=document.getElementById('admin-cdf-rate');if(rateEl)rateEl.value=rate;
    });
  }else{if(colC)colC.style.display='block';if(btnC){btnC.style.background='#1a56db';btnC.style.color='#fff';}
    if(typeof adminRenderCodesTable==='function')adminRenderCodesTable();}}


function adminSaveCdfRate(){
  var val = parseFloat(document.getElementById('admin-cdf-rate').value);
  if(!val||val<100){if(typeof toast==='function')toast('Enter a valid rate (e.g. 2800)','err');return;}
  localStorage.setItem('saa_fx_cdf', val.toString());
  // Show preview
  var cur=document.getElementById('cdf-current-display');
  if(cur) cur.textContent='Active rate: 1 USD = '+val+' CDF · $5='+(5*val).toLocaleString()+' · $10='+(10*val).toLocaleString()+' · $90='+(90*val).toLocaleString();
  // Update pricing page
  if(typeof mobUpdateCdfPrices==='function') mobUpdateCdfPrices();
  // Save to KV so all devices get the rate
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({_appSecret:APP_SECRET,action:'save-fx-rates',adminKey:adminKey,cdf:val.toString()})
  }).then(function(r){return r.json();}).then(function(d){
    if(typeof toast==='function') toast('CDF rate saved — '+val+' CDF per $1 ✅','ok');
  }).catch(function(){
    if(typeof toast==='function') toast('Saved locally. Check internet to sync.','ok');
  });
}

// ── CODE STATUS & CODES TABLE RENDERING ──────────────────────────────
function getCodeStatus(code){
  // Check if disabled — via blacklist OR disabled flag on the code object
  var blacklist = JSON.parse(localStorage.getItem('saa_disabled_codes')||'[]');
  if(blacklist.includes(code.code) || code.disabled === true)
    return {label:'Disabled', color:'#ef4444', bg:'rgba(239,68,68,0.12)', border:'rgba(239,68,68,0.3)', key:'disabled'};
  // Check if activated (device locked)
  var locks = JSON.parse(localStorage.getItem('saa_device_locks')||'{}');
  var activated = locks[code.code] ? true : false;
  // Check expiry — handle both string dates and numeric timestamps from KV
  var expRaw2 = code.expiry||code.expiresAt||'';
  var expDate2;
  if(typeof expRaw2 === 'number'){
    expDate2 = new Date(expRaw2);
  } else {
    expRaw2 = String(expRaw2);
    if(expRaw2.includes('T') || (expRaw2.includes('-') && expRaw2.length > 10)){
      expDate2 = new Date(expRaw2);
    } else {
      var expParts2 = expRaw2.split('/');
      expDate2 = expParts2.length===3 ? new Date(expParts2[2]+'-'+expParts2[1]+'-'+expParts2[0]) : null;
    }
  }
  var expired = expDate2 && expDate2 < new Date();
  if(expired)   return {label:'Expired',  color:'#ef4444', bg:'rgba(239,68,68,0.12)',  border:'rgba(239,68,68,0.2)',   key:'expired'};
  if(activated) return {label:'Active',   color:'#10b981', bg:'rgba(16,185,129,0.12)', border:'rgba(16,185,129,0.2)',  key:'active'};
  return              {label:'Not Used',  color:'#06b6d4', bg:'rgba(6,182,212,0.12)',  border:'rgba(6,182,212,0.2)',   key:'unused'};
}

function adminRenderCodesTable(){
  var codes = JSON.parse(localStorage.getItem('saa_codes')||'[]');
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  var tbody = document.getElementById('codes-table-body');
  if(!tbody) return;

  // If no codes in localStorage, try to fetch from Worker KV (unless user just cleared)
  if(codes.length === 0){
    if(localStorage.getItem('saa_codes_cleared') === '1'){
      adminRenderTable([], tbody);
      return;
    }
    fetch('https://smartacademy-ai.kasongokimba.workers.dev', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({_appSecret:APP_SECRET, action:'get-all-codes', adminKey:adminKey})
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.success && d.codes && d.codes.length){
        localStorage.setItem('saa_codes', JSON.stringify(d.codes));
        generatedCodes = d.codes;
        adminRenderCodesTable();
      } else {
        adminRenderTable([], tbody);
      }
    })
    .catch(function(){ adminRenderTable([], tbody); });
    return;
  }

  // Codes exist — render immediately, then fetch costs in background
  adminRenderTable(codes, tbody);

  // Also include disabled codes
  var blacklist = JSON.parse(localStorage.getItem('saa_disabled_codes')||'[]');
  blacklist.forEach(function(disCode){
    var already = codes.find(function(c){ return c.code === disCode; });
    if(!already) codes.push({code:disCode, type:'—', expiry:'—', disabled:true, created:null});
  });

  // Fetch costs from Worker in background and update
  var codeList = codes.map(function(c){ return c.code; });

  // Add any RM/RS/RY codes from localStorage saa_cost_ keys
  Object.keys(localStorage).forEach(function(k){
    if(k.startsWith('saa_cost_')){
      var c = k.replace('saa_cost_','');
      if(codeList.indexOf(c)===-1) codeList.push(c);
    }
  });
  var ssCode = sessionStorage.getItem('saa_current_research_code');
  if(ssCode && codeList.indexOf(ssCode)===-1) codeList.push(ssCode);

  fetch('https://smartacademy-ai.kasongokimba.workers.dev', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({_appSecret:APP_SECRET, action:'get-all-costs', adminKey:adminKey})
  }).then(function(r){ return r.json(); })
  .then(function(data){
    if(data.costs){
      var kvTotal = 0;
      Object.keys(data.costs).forEach(function(code){
        var wc = data.costs[code];
        var lk = 'saa_cost_'+code;
        var ld; try{ ld=JSON.parse(localStorage.getItem(lk)||'null'); }catch(e){ ld=null; }
        if(!ld || (wc.calls||0) >= (ld.calls||0)) localStorage.setItem(lk, JSON.stringify(wc));
        // Add to saa_codes if not already there (for RM codes used on other devices)
        try{
          var allCodes = JSON.parse(localStorage.getItem('saa_codes')||'[]');
          if(!allCodes.some(function(x){ return x.code===code; })){
            allCodes.push({code:code, type:'Research', expiry:'30d', created:Date.now()});
            localStorage.setItem('saa_codes', JSON.stringify(allCodes));
          }
        }catch(e2){}
        // Add to KV total using Worker's cost field if available
        if(wc.cost) kvTotal += wc.cost;
        else if(wc.inputTokens || wc.outputTokens){
          kvTotal += ((wc.inputTokens||0) * 2.50/1000000) + ((wc.outputTokens||0) * 10.00/1000000);
        }
      });
      var totalEl = document.getElementById('admin-total-cost');
      if(totalEl){
        // Use KV total if larger (more accurate across devices)
        var localTotal = (typeof saaTotalCost === 'function') ? (typeof saaTotalCost==='function'?saaTotalCost():0) : 0;
        totalEl.textContent = '$' + (Math.max(kvTotal, localTotal)).toFixed(4);
      }
    } else {
      var totalEl = document.getElementById('admin-total-cost');
      if(totalEl) totalEl.textContent = '$' + ((typeof saaTotalCost === 'function') ? (typeof saaTotalCost==='function'?saaTotalCost():0) : 0).toFixed(4);
    }
    adminRenderTable(codes, tbody);
  }).catch(function(){
    var totalEl = document.getElementById('admin-total-cost');
    if(totalEl) totalEl.textContent = '$' + ((typeof saaTotalCost === 'function') ? (typeof saaTotalCost==='function'?saaTotalCost():0) : 0).toFixed(4);
    adminRenderTable(codes, tbody);
  });
}

function adminRenderTable(codes, tbody){

  // Count by status
  var counts = {total:codes.length, unused:0, active:0, expired:0, disabled:0};
  codes.forEach(function(c){ var s=getCodeStatus(c); if(counts[s.key]!==undefined) counts[s.key]++; });

  // Update badges
  ['total','unused','active','expired'].forEach(function(k){
    var el = document.getElementById('cbadge-'+k);
    if(el) el.textContent = (k.charAt(0).toUpperCase()+k.slice(1))+': '+counts[k];
  });
  var disEl = document.getElementById('cbadge-disabled');
  if(disEl){ disEl.textContent = 'Disabled: '+counts.disabled; disEl.style.display = counts.disabled > 0 ? 'inline-flex' : 'none'; }

  // Filter
  var filtered = codes.filter(function(c){
    if(_adminCodesFilter==='all') return true;
    return getCodeStatus(c).key === _adminCodesFilter;
  });

  if(!filtered.length){
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:rgba(255,255,255,0.3);font-size:12px;">No codes found</td></tr>';
    return;
  }

  var totalCost = (typeof saaTotalCost==='function'?saaTotalCost():0);
  var totalEl = document.getElementById('admin-total-cost');
  if(totalEl) totalEl.textContent = '$' + totalCost.toFixed(4);

  tbody.innerHTML = filtered.map(function(c, idx){
    var s = getCodeStatus(c);
    var isNew = window._lastGeneratedCode && c.code === window._lastGeneratedCode;
    var rowStyle = isNew
      ? 'border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(6,182,212,0.18);animation:rowFlash 2s ease forwards;'
      : 'border-bottom:1px solid rgba(255,255,255,0.06);';

    // Calculate days left
    var daysLeftStr = '';
    var expRaw = c.expiry||c.expiresAt||'';
    var expDate;
    if(typeof expRaw === 'number'){
      expDate = new Date(expRaw);
    } else {
      expRaw = String(expRaw);
      if(expRaw.includes('T') || (expRaw.includes('-') && expRaw.length > 10)){
        expDate = new Date(expRaw);
      } else {
        var expParts = expRaw.split('/');
        expDate = expParts.length===3 ? new Date(expParts[2]+'-'+expParts[1]+'-'+expParts[0]) : null;
      }
    }
    if(s.key === 'expired'){
      daysLeftStr = '<span style="color:#ef4444;font-weight:700;">Expired</span>';
    } else if(s.key === 'active'){
      if(expDate){
        var daysLeft = Math.ceil((expDate - new Date()) / 86400000);
        daysLeftStr = '<span style="color:#10b981;font-weight:700;">'+daysLeft+'d left ✓</span>';
      } else {
        daysLeftStr = '<span style="color:#10b981;font-weight:700;">Active ✓</span>';
      }
    } else {
      if(expDate){
        var daysLeft = Math.ceil((expDate - new Date()) / 86400000);
        daysLeftStr = '<span style="color:#06b6d4;font-weight:600;">'+daysLeft+'d to use</span>';
      } else {
        daysLeftStr = '<span style="color:#06b6d4;font-weight:600;">Not Used</span>';
      }
    }

    var createdStr = c.created ? new Date(c.created).toLocaleDateString(undefined,{day:'numeric',month:'short'}) : '—';

    // Cost for this code
    var costData = (typeof saaGetCost==='function') ? saaGetCost(c.code) : null;
    var limit    = (typeof saaCodeLimit==='function') ? saaCodeLimit(c.code) : 5.50;
    var costStr  = '';
    if(costData && costData.calls > 0){
      var costVal  = costData.cost;
      var pct      = (costVal / limit) * 100;
      var pctDisplay = pct < 0.1 ? pct.toFixed(2) : pct < 1 ? pct.toFixed(1) : Math.round(pct);
      var barPct   = Math.min(pct, 100);
      var costColor = pct < 50 ? '#10b981' : pct < 80 ? '#f59e0b' : '#ef4444';
      costStr = '<div style="font-size:11px;">'
        + '<span style="color:'+costColor+';font-weight:700;">$'+costVal.toFixed(4)+'</span>'
        + ' <span style="color:rgba(255,255,255,0.25);font-size:10px;">/ $'+limit.toFixed(2)+'</span>'
        + '</div>'
        + '<div style="background:rgba(255,255,255,0.08);border-radius:3px;height:3px;width:60px;margin-top:3px;overflow:hidden;">'
        + '<div style="background:'+costColor+';height:100%;width:'+barPct+'%;border-radius:3px;"></div>'
        + '</div>'
        + '<div style="font-size:9px;color:rgba(255,255,255,0.25);margin-top:1px;">'+costData.calls+' calls · '+pctDisplay+'%</div>';
    } else {
      var srcUp = (c.source||c.region||c.origin||'').toString().toUpperCase();
      var isDRC = ['DRC','DRC-DIRECT','CD'].indexOf(srcUp) !== -1;
      var isPF = srcUp === 'PAYFAST' || (costData && (costData.source||'').toUpperCase()==='PAYFAST');
      if(isPF){
        costStr = '<span style="color:#10b981;font-size:11px;font-weight:700;">$0.00</span>'
          + '<div style="font-size:9px;color:rgba(16,185,129,0.5);">💳 PayFast</div>';
      } else if(isDRC){
        costStr = '<span style="color:#f59e0b;font-size:11px;font-weight:700;">$0.00</span>'
          + '<div style="font-size:9px;color:rgba(245,158,11,0.5);">🇨🇩 No AI cost</div>';
      } else {
        costStr = '<span style="color:rgba(255,255,255,0.2);font-size:11px;">—</span>'
          + '<div style="font-size:9px;color:rgba(255,255,255,0.15);">$0 / $'+limit.toFixed(2)+'</div>';
      }
    }

    // Origin
    var originMap = {
      'SA':'🇿🇦 SA', 'ZA':'🇿🇦 SA',
      'DRC':'🇨🇩 DRC', 'CD':'🇨🇩 DRC',
      'INTL':'🌍 Intl', 'INT':'🌍 Intl',
      'payfast':'💳 PayFast',
      'admin':'⚙️ Admin'
    };
    var originRaw = c.region || c.origin || c.source || '';
    var originLabel = originMap[originRaw.toUpperCase()] || originMap[originRaw] || (originRaw ? originRaw : '—');
    var originColor = originRaw.toUpperCase()==='SA'||originRaw.toUpperCase()==='ZA' ? '#34d399'
      : originRaw.toUpperCase()==='DRC'||originRaw.toUpperCase()==='CD' ? '#f59e0b'
      : originRaw.toUpperCase()==='INTL'||originRaw.toUpperCase()==='INT' ? '#06b6d4'
      : originRaw==='payfast' ? '#a78bfa'
      : 'rgba(255,255,255,0.3)';

    return '<tr style="'+rowStyle+'">'
      + '<td style="padding:10px 6px;font-family:\'JetBrains Mono\',monospace;font-size:12px;color:'+(isNew?'#fff':'#06b6d4')+';font-weight:700;">'+(isNew?'✨ ':'')+c.code+'</td>'
      + '<td style="padding:10px 6px;font-size:11px;font-weight:700;color:'+originColor+';">'+originLabel+'</td>'
      + '<td style="padding:10px 6px;font-size:12px;">'+daysLeftStr+'</td>'
      + '<td style="padding:10px 6px;font-size:11px;color:rgba(255,255,255,0.5);">'+createdStr+'</td>'
      + '<td style="padding:10px 6px;">'+costStr+'</td>'
      + '<td style="padding:10px 6px;"><button onclick="copyCode(\''+c.code+'\',this)" style="background:rgba(255,255,255,0.06);border:none;border-radius:6px;color:rgba(255,255,255,0.6);font-size:11px;padding:4px 8px;cursor:pointer;">📋</button>'
      + ' <button onclick="adminResetDevice(\''+c.code+'\',this)" title="Unlock from device" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;color:#ef4444;font-size:11px;padding:4px 8px;cursor:pointer;">🔓</button></td>'
      + '</tr>';
  }).join('');

  // Scroll new code into view
  if(window._lastGeneratedCode){
    setTimeout(function(){
      var rows = document.querySelectorAll('#codes-table-body tr');
      rows.forEach(function(r){
        if(r.innerHTML.indexOf(window._lastGeneratedCode) > -1){
          r.scrollIntoView({behavior:'smooth', block:'center'});
        }
      });
    }, 100);
  }
}

// ── TARIFF / PRICING MANAGEMENT ───────────────────────────────────────
var SAA_DEFAULT_TARIFFS = {W:5, M:10, WC:110, MC:220};

function adminLoadTariffs(){
  var saved = {};
  try{ saved = JSON.parse(localStorage.getItem('saa_tariffs')||'{}'); }catch(e){}
  var keys = ['W','M','WC','MC'];
  keys.forEach(function(k){
    var el = document.getElementById('tariff-'+k);
    if(el) el.value = saved[k] || SAA_DEFAULT_TARIFFS[k] || '';
  });
}

function _doCommitTariffs(){
  var keys = ['W','M','WC','MC'];
  var tariffs = {};
  var valid = true;
  keys.forEach(function(k){
    var el = document.getElementById('tariff-'+k);
    if(!el) return;
    var val = parseFloat(el.value);
    if(!val || val <= 0){ valid = false; return; }
    tariffs[k] = val;
  });
  if(!valid){ toast('❌ All prices must be greater than 0','err'); return; }
  localStorage.setItem('saa_tariffs', JSON.stringify(tariffs));
  Object.assign(CODE_PRICE_MAP, tariffs);
  CODE_PRICE_MAP.HG = tariffs.HC;
  CODE_PRICE_MAP.WG = tariffs.WC;
  CODE_PRICE_MAP.MG = tariffs.MC;
  _pricingData.ind = [
    ['p_1week',  tariffs.W],
    ['p_1month', tariffs.M]
  ];
  _pricingData.grp = [
    ['p_1week',  tariffs.WC],
    ['p_1month', tariffs.MC]
  ];
  var res = document.getElementById('tariff-result');
  if(res){ res.style.display='block'; res.textContent='✅ Tariffs saved! Pricing page updated.'; setTimeout(function(){res.style.display='none';},3000); }
  toast('✅ Tariffs updated','ok');
  if(typeof adminRenderCodesTable==='function') adminRenderCodesTable();
  // Sync to KV
  adminSaveSettingsToKV();
}

function adminSaveTariffs(){
  _doCommitTariffs();
}

// ── MAINTENANCE MODE & ANNOUNCEMENT BANNER ────────────────────────────
function adminToggleMaintenance(goOffline){
  var WORKER   = 'https://smartacademy-ai.kasongokimba.workers.dev';
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  var msg      = goOffline ? ((document.getElementById('maint-msg-input')||{}).value||'') : '';
  var payload  = {_appSecret:APP_SECRET, action:'set-site-status', adminKey:adminKey, online:!goOffline};
  if(msg) payload.message = msg;

  fetch(WORKER, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(d.success){
      toast(goOffline ? '🔧 Site is now in MAINTENANCE mode' : '✅ Site is back ONLINE', goOffline?'err':'ok');
      _updateMaintenanceStatusBar(!goOffline);
    } else {
      toast('❌ '+(d.error||'Failed to update site status'),'err');
    }
  })
  .catch(function(){ toast('❌ Network error','err'); });
}

function adminToggleAnnouncement(showIt){
  var WORKER   = 'https://smartacademy-ai.kasongokimba.workers.dev';
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  var text     = (document.getElementById('announcement-input')||{}).value||'';
  if(showIt && !text.trim()){
    toast('⚠️ Type an announcement message first','err');
    return;
  }
  // IMPORTANT: this does NOT touch the full site online/offline status —
  // it only updates the independent announcement banner fields.
  var payload = {_appSecret:APP_SECRET, action:'set-site-status', adminKey:adminKey, announcement: text, announcementOn: !!showIt};

  fetch(WORKER, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(d.success){
      toast(showIt ? '📢 Announcement banner is now showing' : '✅ Announcement banner hidden', 'ok');
    } else {
      toast('❌ '+(d.error||'Failed to update announcement'),'err');
    }
  })
  .catch(function(){ toast('❌ Network error','err'); });
}

function _updateMaintenanceStatusBar(isOnline){
  var bar = document.getElementById('maint-status-bar');
  if(!bar) return;
  if(isOnline){
    bar.style.background='rgba(16,185,129,0.1)';
    bar.style.border='1px solid rgba(16,185,129,0.4)';
    bar.innerHTML='<span style="font-size:18px;">🟢</span> <strong style="color:#10b981;">ONLINE</strong> <span style="color:rgba(255,255,255,0.4);font-size:12px;">— Site is live and accessible to all users</span>';
  } else {
    bar.style.background='rgba(239,68,68,0.1)';
    bar.style.border='1px solid rgba(239,68,68,0.4)';
    bar.innerHTML='<span style="font-size:18px;">🔴</span> <strong style="color:#ef4444;">OFFLINE (Maintenance)</strong> <span style="color:rgba(255,255,255,0.4);font-size:12px;">— Users see maintenance screen</span>';
  }
}

// ── SETTINGS SYNC (save to / load from KV, auto-applied on page load) ──
function adminSaveSettingsToKV(){
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  // Collect all settings
  var tariffs = {};
  try{ tariffs = JSON.parse(localStorage.getItem('saa_tariffs')||'{}'); }catch(e){}
  var pricingRates = {};
  try{ pricingRates = JSON.parse(localStorage.getItem('saa_pricing_rates')||'{}'); }catch(e){}
  var waContact      = localStorage.getItem('saa_wa_contact')||'';
  var promptOverride = localStorage.getItem('saa_prompt_override')||'';
  // Collect code limits
  var codeLimits = {};
  var codes = [];
  try{ codes = JSON.parse(localStorage.getItem('saa_codes')||'[]'); }catch(e){}
  codes.forEach(function(c){
    var lim = localStorage.getItem('saa_limit_'+c.code);
    if(lim) codeLimits[c.code] = lim;
  });

  fetch(WORKER, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      _appSecret: APP_SECRET,
      action:'save-admin-settings', adminKey:adminKey,
      tariffs, pricingRates, waContact, promptOverride, codeLimits
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(d.success){
      var el = document.getElementById('kv-sync-status');
      if(el){ el.textContent='☁️ Settings saved to cloud'; el.style.color='#10b981'; el.style.display='block';
        setTimeout(function(){ el.style.display='none'; },3000); }
    }
  })
  .catch(function(){});
}

function adminLoadSettingsFromKV(callback){
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  fetch(WORKER, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({_appSecret:APP_SECRET, action:'get-admin-settings', adminKey:adminKey})
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(d.success && d.settings){
      var s = d.settings;
      // Apply tariffs
      if(s.tariffs && Object.keys(s.tariffs).length){
        localStorage.setItem('saa_tariffs', JSON.stringify(s.tariffs));
        if(typeof CODE_PRICE_MAP !== 'undefined') Object.assign(CODE_PRICE_MAP, s.tariffs);
      }
      // Apply pricing rates
      if(s.pricingRates && Object.keys(s.pricingRates).length){
        localStorage.setItem('saa_pricing_rates', JSON.stringify(s.pricingRates));
        if(typeof _pricingData !== 'undefined'){
          if(s.pricingRates.za)   Object.assign(_pricingData.rates.za,   s.pricingRates.za);
          if(s.pricingRates.drc)  Object.assign(_pricingData.rates.drc,  s.pricingRates.drc);
          if(s.pricingRates.intl) Object.assign(_pricingData.rates.intl, s.pricingRates.intl);
        }
      }
      // Apply WA contact
      if(s.waContact){ localStorage.setItem('saa_wa_contact', s.waContact); if(typeof _renderWaContactCard==='function') _renderWaContactCard(); }
      // Apply prompt override
      if(s.promptOverride) localStorage.setItem('saa_prompt_override', s.promptOverride);
      // Apply code limits
      if(s.codeLimits){
        Object.keys(s.codeLimits).forEach(function(code){
          localStorage.setItem('saa_limit_'+code, s.codeLimits[code]);
        });
      }
      var el = document.getElementById('kv-sync-status');
      if(el){ el.textContent='☁️ Settings loaded from cloud'; el.style.color='#06b6d4'; el.style.display='block';
        setTimeout(function(){ el.style.display='none'; },3000); }
    }
    if(typeof callback === 'function') callback();
  })
  .catch(function(){ if(typeof callback === 'function') callback(); });
}

function adminLoadMaintenanceStatus(){
  var WORKER = 'https://smartacademy-ai.kasongokimba.workers.dev';
  fetch(WORKER,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_appSecret:APP_SECRET,action:'get-site-status'})})
  .then(function(r){ return r.json(); })
  .then(function(d){ _updateMaintenanceStatusBar(d.online !== false); })
  .catch(function(){});
}

function loadAnnouncementBanner(){
  var WORKER = 'https://smartacademy-ai.kasongokimba.workers.dev';
  fetch(WORKER,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_appSecret:APP_SECRET,action:'get-site-status'})})
  .then(function(r){ return r.json(); })
  .then(function(d){
    var banner = document.getElementById('announcement-banner');
    var textEl = document.getElementById('announcement-text');
    if(!banner || !textEl) return;
    if(d.announcementOn && d.announcement){
      // Re-show once per day even if previously dismissed — reminders matter for maintenance notices
      var today = new Date().toISOString().slice(0,10);
      var dismissedOn = localStorage.getItem('saa_announcement_dismissed_date');
      var dismissedText = localStorage.getItem('saa_announcement_dismissed_text');
      var alreadyDismissedToday = (dismissedOn === today && dismissedText === d.announcement);
      if(!alreadyDismissedToday){
        textEl.textContent = d.announcement;
        banner.style.display = 'flex';
      }
    } else {
      banner.style.display = 'none';
    }
  })
  .catch(function(){});
}


function dismissAnnouncement(){
  var banner = document.getElementById('announcement-banner');
  var textEl = document.getElementById('announcement-text');
  if(banner) banner.style.display = 'none';
  if(textEl){
    localStorage.setItem('saa_announcement_dismissed_date', new Date().toISOString().slice(0,10));
    localStorage.setItem('saa_announcement_dismissed_text', textEl.textContent);
  }
}

// loadAnnouncementBanner() is now called specifically when the pricing page opens (see showPage()) — not globally

// Render WhatsApp contact card from saved number (deferred until function is defined)
window.addEventListener('load', function(){ if(typeof _renderWaContactCard==='function') _renderWaContactCard(); });

// ════════════════════════════════════════════════
// AUTO-LOAD ADMIN SETTINGS FROM KV ON PAGE LOAD
// ════════════════════════════════════════════════
window.addEventListener('load', function(){
  var WORKER = 'https://smartacademy-ai.kasongokimba.workers.dev';
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  fetch(WORKER, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({_appSecret:APP_SECRET, action:'get-admin-settings', adminKey:adminKey})
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(!d.success || !d.settings) return;
    var s = d.settings;
    // Apply tariffs
    if(s.tariffs && Object.keys(s.tariffs).length){
      localStorage.setItem('saa_tariffs', JSON.stringify(s.tariffs));
      if(typeof CODE_PRICE_MAP !== 'undefined') Object.assign(CODE_PRICE_MAP, s.tariffs);
    }
    // Apply pricing rates
    if(s.pricingRates && Object.keys(s.pricingRates).length){
      localStorage.setItem('saa_pricing_rates', JSON.stringify(s.pricingRates));
      if(typeof _pricingData !== 'undefined'){
        if(s.pricingRates.za)   Object.assign(_pricingData.rates.za,   s.pricingRates.za);
        if(s.pricingRates.drc)  Object.assign(_pricingData.rates.drc,  s.pricingRates.drc);
        if(s.pricingRates.intl) Object.assign(_pricingData.rates.intl, s.pricingRates.intl);
      }
    }
    // Apply WA contact
    if(s.waContact){
      localStorage.setItem('saa_wa_contact', s.waContact);
      if(typeof _renderWaContactCard === 'function') _renderWaContactCard();
    }
    // Apply prompt override
    if(s.promptOverride) localStorage.setItem('saa_prompt_override', s.promptOverride);
    // Apply code limits
    if(s.codeLimits){
      Object.keys(s.codeLimits).forEach(function(code){
        localStorage.setItem('saa_limit_'+code, s.codeLimits[code]);
      });
    }
  })
  .catch(function(){}); // fail silently
});

// ── COST LIMIT PER CODE & CODE LIST FILTERING/EXPORT ──────────────────
function adminSetCodeLimit(){
  var code   = (document.getElementById('limit-code-input').value||'').trim().toUpperCase();
  var amount = parseFloat(document.getElementById('limit-amount-input').value||'0');
  var res    = document.getElementById('limit-result');
  if(!code || amount <= 0){
    res.style.display='block'; res.style.color='#ef4444';
    res.textContent = '❌ Enter a valid code and amount.'; return;
  }
  localStorage.setItem('saa_limit_'+code, amount.toFixed(4));
  res.style.display='block'; res.style.color='#10b981';
  res.textContent = '✅ Limit set: '+code+' → $'+amount.toFixed(2);
  document.getElementById('limit-code-input').value = '';
  document.getElementById('limit-amount-input').value = '';
  if(typeof adminRenderCodesTable === 'function') adminRenderCodesTable();
  toast('✅ Limit updated for '+code,'ok');
}

function adminCodesFilter(f){
  _adminCodesFilter = f;
  ['all','unused','active','expired','disabled'].forEach(function(k){
    var btn = document.getElementById('cfilter-'+k);
    if(!btn) return;
    btn.style.background = k===f ? '#1a56db' : 'rgba(255,255,255,0.08)';
    btn.style.color      = k===f ? '#fff'    : 'rgba(255,255,255,0.6)';
  });
  if(typeof adminRenderCodesTable === "function") adminRenderCodesTable();
}

function adminExportCodes(){
  var codes = JSON.parse(localStorage.getItem('saa_codes')||'[]');
  if(!codes.length){ toast('No codes to copy','inf'); return; }
  var text = codes.map(function(c){
    return c.code + ' | ' + (c.type||'') + ' | ' + getCodeStatus(c).label + ' | Exp: ' + (c.expiry||'');
  }).join('\n');
  navigator.clipboard.writeText(text).then(function(){
    toast('All codes copied to clipboard','ok');
  });
}

// ── CLASSROOM CODE GENERATION & GPS RADIUS ─────────────────────────────
async function adminGenClassroomCode(){
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  var type   = document.getElementById('cls-type').value;
  var suffix = document.getElementById('cls-suffix').value;
  var radius = parseInt(document.getElementById('cls-radius').value)||250;
  var WORKER = 'https://smartacademy-ai.kasongokimba.workers.dev';
  try {
    var res = await fetch(WORKER,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'generate-classroom-code',adminKey,type,suffix,radius})});
    var data = await res.json();
    if(data.success){
      document.getElementById('cls-code').textContent   = data.code;
      document.getElementById('cls-expiry').textContent = '📍 '+radius+'m radius · Expires '+new Date(data.expiresAt).toLocaleDateString('en-GB');
      document.getElementById('cls-result').style.display='block';
      // Save to saa_codes so it appears in the codes table
      var expStr = new Date(data.expiresAt).toLocaleDateString('en-GB');
      var labelMap = {W:'Weekly',M:'Monthly'};
      var label = labelMap[type] || 'Weekly';
      var stored = JSON.parse(localStorage.getItem('saa_codes')||'[]');
      stored.push({code:data.code, type:label+' (Classroom)', expiry:expStr, created:Date.now()});
      localStorage.setItem('saa_codes', JSON.stringify(stored));
      window._lastGeneratedCode = data.code;
      if(typeof adminRenderCodesTable === 'function') adminRenderCodesTable();
      toast('✅ Classroom code generated','ok');
    } else { toast('❌ '+(data.error||'Failed'),'err'); }
  } catch(e){ toast('❌ Network error: '+e.message,'err'); }
}

async function adminUpdateRadius(){
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  var code   = (document.getElementById('cls-update-code').value||'').trim().toUpperCase();
  var radius = parseInt(document.getElementById('cls-update-radius').value)||250;
  var WORKER = 'https://smartacademy-ai.kasongokimba.workers.dev';
  try {
    var res = await fetch(WORKER,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'update-classroom-radius',adminKey,code,radius})});
    var data = await res.json();
    if(data.success){ toast('✅ '+data.message,'ok'); }
    else { toast('❌ '+(data.error||'Failed'),'err'); }
  } catch(e){ toast('❌ Network error','err'); }
}

function adminSavePricing(){
  var rateZa  = parseFloat(document.getElementById('rate-za').value)||16.5;
  var phoneZa = document.getElementById('phone-za').value.trim();
  var rateDrc = parseFloat(document.getElementById('rate-drc').value)||2250;
  var phoneDrc= document.getElementById('phone-drc').value.trim();
  var phoneIntl=document.getElementById('phone-intl').value.trim();
  var r = {
    za:  {rate:rateZa,  phone:phoneZa,  currency:'ZAR', method:'Bank-to-Cell Payment', note:'Send via bank-to-cellphone payment (any bank — FNB, Nedbank, Absa, Standard Bank etc.). WhatsApp your receipt to the same number.'},
    drc: {rate:rateDrc, phone:phoneDrc||'+243 XXX XXX XXX', currency:'FC', method:'Airtel Money', note:'Envoyer via Airtel Money, puis WhatsApp votre reçu.'},
    intl:{rate:1, phone:phoneIntl||'', currency:'USD', method:'Mobile Payment', note:'Pay to our DRC number above, then upload receipt for instant code.'}
  };
  // Save WhatsApp contact number separately
  var waContact = (document.getElementById('phone-wa-contact')||{}).value || '';
  if(waContact) localStorage.setItem('saa_wa_contact', waContact.trim());
  localStorage.setItem('saa_pricing_rates', JSON.stringify(r));
  // Apply immediately to pricing data
  if(typeof _pricingData !== 'undefined'){
    Object.assign(_pricingData.rates.za,  r.za);
    Object.assign(_pricingData.rates.drc, r.drc);
    Object.assign(_pricingData.rates.intl,r.intl);
  }
  // Refresh the WhatsApp contact card on the site
  _renderWaContactCard();
  // Sync to KV
  adminSaveSettingsToKV();
  var res = document.getElementById('pricing-save-result');
  res.textContent = '✅ Rates, numbers & WhatsApp contact saved';
  res.style.display='block';
  res.style.background='rgba(16,185,129,0.1)';
  res.style.color='#10b981';
  setTimeout(function(){res.style.display='none';},3000);
}

async function adminDisableCode(){
  var code    = (document.getElementById('disable-code-input').value||'').trim().toUpperCase();
  var resultEl = document.getElementById('disable-code-result');
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  var WORKER   = 'https://smartacademy-ai.kasongokimba.workers.dev';
  if(!code){ resultEl.textContent='Please enter a code.'; resultEl.style.display='block'; return; }
  resultEl.textContent='⏳ Disabling...'; resultEl.style.display='block';
  resultEl.style.background='rgba(255,255,255,0.05)'; resultEl.style.color='rgba(255,255,255,0.6)';

  // Always blacklist locally immediately — works even offline
  var blacklist = JSON.parse(localStorage.getItem('saa_disabled_codes')||'[]');
  if(!blacklist.includes(code)) blacklist.push(code);
  localStorage.setItem('saa_disabled_codes', JSON.stringify(blacklist));

  // Mark as disabled in saa_codes but keep in list so admin can see it
  var codes = JSON.parse(localStorage.getItem('saa_codes')||'[]');
  codes = codes.map(function(c){
    if(c.code === code) return Object.assign({}, c, {disabled: true});
    return c;
  });
  localStorage.setItem('saa_codes', JSON.stringify(codes));

  // Also clear any cached expiry so local fallback won't work
  localStorage.removeItem('saa_expiry_'+code);
  localStorage.removeItem('saa_fp_'+code);

  try {
    var res = await fetch(WORKER,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({_appSecret:APP_SECRET,action:'disable-code', code:code, adminKey:adminKey})
    });
    var data = await res.json();
    if(data.success){
      resultEl.textContent = '✅ '+data.message+' You can now generate a new code for this client.';
      resultEl.style.background='rgba(16,185,129,0.1)'; resultEl.style.color='#10b981';
    } else {
      resultEl.textContent = '✅ Code '+code+' disabled locally. (Server: '+(data.error||'not found')+')';
      resultEl.style.background='rgba(16,185,129,0.1)'; resultEl.style.color='#10b981';
    }
    document.getElementById('disable-code-input').value = '';
    if(typeof adminRenderCodesTable==='function') adminRenderCodesTable();
  } catch(e){
    resultEl.textContent = '✅ Code '+code+' disabled locally (offline mode).';
    resultEl.style.background='rgba(16,185,129,0.1)'; resultEl.style.color='#10b981';
    document.getElementById('disable-code-input').value = '';
    if(typeof adminRenderCodesTable==='function') adminRenderCodesTable();
  }
}

// ── GENERIC ERROR DISPLAY HELPERS (used across admin forms) ──────────
function showErr(el, msg){
  el.textContent = msg;
  el.style.color = '';
  el.style.background = '';
  el.style.border = '';
  el.style.padding = '';
  el.style.borderRadius = '';
  el.style.fontWeight = '';
  el.style.fontSize = '';
  el.style.display = 'block';
}

function showErrAlert(el, msg){
  el.textContent = msg;
  el.style.color = '#fff';
  el.style.background = 'linear-gradient(135deg,#dc2626,#b91c1c)';
  el.style.border = '2px solid #ef4444';
  el.style.padding = '14px 18px';
  el.style.borderRadius = '10px';
  el.style.fontWeight = '800';
  el.style.fontSize = '14px';
  el.style.display = 'block';
  el.style.textAlign = 'center';
  el.style.letterSpacing = '0.3px';
  el.style.boxShadow = '0 0 20px rgba(239,68,68,0.4)';
  // Shake animation
  el.style.animation = 'none';
  setTimeout(function(){ el.style.animation = 'shake 0.4s ease'; }, 10);
}

function selectQ(n){
  S.qCount = n;
  [5,10,15,20].forEach(function(v){
    var el=document.getElementById('qopt-'+v);
    if(el) el.classList.toggle('active', n===v);
  });
}

// ── PIN RECOVERY (admin-side tools) ───────────────────────────────────
async function adminGenPinRecovery(){
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  try{
    var res = await fetch('https://smartacademy-ai.kasongokimba.workers.dev',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({_appSecret:APP_SECRET,action:'generate-pin-recovery', adminKey:adminKey})
    });
    var data = await res.json();
    if(data.success){
      document.getElementById('pin-recovery-code').textContent   = data.code;
      document.getElementById('pin-recovery-expiry').textContent = '⏰ Expires in 1 hour · Single use only';
      document.getElementById('pin-recovery-result').style.display = 'block';
    } else { toast('❌ '+(data.error||'Failed'),'err'); }
  } catch(e){ toast('❌ Network error','err'); }
}

function adminResetPinDirect(){
  if(!confirm('Remove the parental PIN? Tutor will be unlocked.')) return;
  localStorage.removeItem('_ph');
  localStorage.removeItem('_pu');
  pinUpdateUI();
  toast('✅ Parental PIN removed','ok');
}

// ── FREE TRIAL: ADMIN-SIDE ACTIVATION (student-facing redemption is
// in a different file — see scope note in the header above) ─────────
async function adminActivateTrial(){
  var adminKey=localStorage.getItem('saa_admin_key')||'';
  var minutes=parseInt(document.getElementById('trial-minutes').value)||10;
  if(minutes>15){toast('Maximum 15 minutes','err');return;}
  localStorage.setItem('saa_trial_minutes', minutes); // save for pricing page display
  try{
    var r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_appSecret:APP_SECRET,action:'generate-trial-code',adminKey,minutes})});
    var d=await r.json();
    if(d.success){
      setTrialStatusBar(true);
      // Show card on landing but don't start countdown yet
      var c=document.getElementById('trial-card');
      if(c) c.style.display='block';
      var cd=document.getElementById('trial-countdown');
      if(cd){cd.textContent='FREE';cd.style.fontSize='18px';}
      localStorage.setItem('_currentTrialCode', d.code);
      window._pendingTrialExpiry=d.expiresAt;
      toast('Trial activated — '+minutes+' min','ok');
    } else {toast(d.error||'Failed','err');}
  }catch(e){toast('Network error','err');}
}

async function adminDeactivateTrial(){
  var adminKey=localStorage.getItem('saa_admin_key')||'';
  try{
    var r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_appSecret:APP_SECRET,action:'deactivate-trial',adminKey})});
    var d=await r.json();
    if(d.success){
      setTrialStatusBar(false);
      // Hide trial card
      var c=document.getElementById('trial-card');
      if(c) c.style.display='none';
      if(_trialTimer) clearInterval(_trialTimer);
      toast('Trial deactivated','ok');
    } else {toast(d.error||'Failed','err');}
  }catch(e){toast('Network error','err');}
}

async function adminRefreshTrial(){
  var adminKey=localStorage.getItem('saa_admin_key')||'';
  var minutes=parseInt(document.getElementById('trial-minutes').value)||10;
  if(minutes>15){toast('Maximum 15 minutes','err');return;}
  try{
    var r=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_appSecret:APP_SECRET,action:'generate-trial-code',adminKey,minutes})});
    var d=await r.json();
    if(d.success){
      // Clear session and reset UI
      S.code=''; S.codeType=''; S.codeExpiry=null;
      if(_trialTimer) clearInterval(_trialTimer);
      _trialWarned=false;
      // Store new code so client-side knows it changed
      localStorage.setItem('_currentTrialCode', d.code);
      setTrialStatusBar(true);
      var c=document.getElementById('trial-card');
      if(c) c.style.display='block';
      var cd=document.getElementById('trial-countdown');
      if(cd){cd.textContent='FREE';cd.style.fontSize='18px';cd.className='';}
      var btn=c?c.querySelector('.btn-trial'):null;
      if(btn) btn.innerHTML='&#128640; Start Free Trial';
      window._pendingTrialExpiry=d.expiresAt;
      toast('Trial refreshed — all devices can try again','ok');
    } else {toast(d.error||'Failed','err');}
  }catch(e){toast('Network error','err');}
}

// Trigger: checks trial code status once on every page load
window.addEventListener('load',checkTrialCode);

// ── COST LIMIT % CONFIGURATION (admin) ─────────────────────────────────
function adminUpdateLimitPreview(){
  var pct = parseFloat(document.getElementById('cost-limit-pct').value) || 70;
  document.getElementById('cost-limit-slider').value = pct;
  var prices = {'W (Week)':5,'M (Month)':10,'RM- Research':20};
  try {
    var ind = JSON.parse(localStorage.getItem('saa_tariffs')||'{}');
    if(ind.w) prices['W (Week)'] = parseFloat(ind.w);
    if(ind.m) prices['M (Month)'] = parseFloat(ind.m);
    if(ind.y) prices['Y (Year)'] = parseFloat(ind.y);
  } catch(e){}
  var colors = {'W (Week)':'#06b6d4','M (Month)':'#06b6d4','RM- Research':'#a78bfa'};
  var html = '';
  Object.keys(prices).forEach(function(name){
    var price = prices[name];
    var limit = (price * pct / 100).toFixed(2);
    var profit = (price - parseFloat(limit)).toFixed(2);
    var profitPct = (100 - pct).toFixed(0);
    html += '<div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:8px;">'
      +'<div style="color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:3px;">'+name+'</div>'
      +'<div style="color:'+(colors[name]||'#06b6d4')+';font-size:11px;">$'+price+' &rarr; limit <strong>$'+limit+'</strong></div>'
      +'<div style="color:#10b981;font-size:10px;">Profit: $'+profit+' ('+profitPct+'%)</div>'
      +'</div>';
  });
  var el = document.getElementById('cost-limit-preview');
  if(el) el.innerHTML = html;
}

function adminSaveCostLimitPct(){
  var pct = parseFloat(document.getElementById('cost-limit-pct').value) || 70;
  if(pct < 10 || pct > 200){ toast('Percentage must be between 10% and 200%','warn'); return; }
  var adminKey = localStorage.getItem('saa_admin_key')||'';
  var s = document.getElementById('cost-limit-pct-status');
  if(s) s.textContent = 'Saving...';
  fetch('https://smartacademy-ai.kasongokimba.workers.dev',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({_appSecret:APP_SECRET, action:'save-cost-limit-pct', adminKey:adminKey, pct:pct})
  }).then(function(r){ return r.json(); })
  .then(function(data){
    if(data.ok){
      localStorage.setItem('saa_cost_limit_pct', String(pct));
      if(s){ s.textContent='Saved — '+pct+'% applied to all codes'; setTimeout(function(){ s.textContent=''; },4000); }
      toast('Cost limit set to '+pct+'%','ok');
      adminUpdateLimitPreview();
    } else {
      if(s) s.textContent = data.error||'Failed';
      toast('Failed to save','err');
    }
  }).catch(function(){
    localStorage.setItem('saa_cost_limit_pct', String(pct));
    if(s){ s.textContent='Saved locally'; setTimeout(function(){ s.textContent=''; },3000); }
  });
}

function adminLoadCostLimitPct(){
  fetch('https://smartacademy-ai.kasongokimba.workers.dev',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({_appSecret:APP_SECRET, action:'get-cost-limit-pct'})
  }).then(function(r){ return r.json(); })
  .then(function(data){
    var pct = (data.ok && data.pct) ? data.pct : 70;
    var inp = document.getElementById('cost-limit-pct');
    var sld = document.getElementById('cost-limit-slider');
    if(inp) inp.value = pct;
    if(sld) sld.value = pct;
    localStorage.setItem('saa_cost_limit_pct', String(pct));
    adminUpdateLimitPreview();
  }).catch(function(){
    var saved = parseFloat(localStorage.getItem('saa_cost_limit_pct')||'70');
    var inp = document.getElementById('cost-limit-pct');
    var sld = document.getElementById('cost-limit-slider');
    if(inp) inp.value = saved;
    if(sld) sld.value = saved;
    adminUpdateLimitPreview();
  });
}

function adminResetDmStats(){
  localStorage.removeItem('dm_total_queries');
  localStorage.removeItem('dm_total_calls');
  localStorage.removeItem('dm_all_scores');
  var q=document.getElementById('admin-dm-queries'); if(q) q.textContent='0';
  var c=document.getElementById('admin-dm-calls'); if(c) c.textContent='0';
  var a=document.getElementById('admin-dm-avg'); if(a) a.textContent='—';
  toast('Research stats reset','ok');
}

// ── RESEARCH MODE PRICING (admin) ───────────────────────────────────────
function adminSaveResearchPrices(){
  var rm = parseFloat(document.getElementById('admin-price-rm').value)||20;
  var s = document.getElementById('admin-price-status');

  // Save to KV via Worker
  fetch('https://smartacademy-ai.kasongokimba.workers.dev',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      _appSecret: APP_SECRET,
      action: 'save-research-prices',
      adminKey: localStorage.getItem('saa_admin_key')||'',
      rm: rm, rs: rs, ry: ry
    })
  }).then(function(r){ return r.json(); })
  .then(function(data){
    if(data.ok){
      // Also update local cache and _pricingData
      localStorage.setItem('saa_research_prices', JSON.stringify({rm:rm,rs:rs,ry:ry}));
      if(window._pricingData && _pricingData.research){
        _pricingData.research[0][1] = rm;
        _pricingData.research[1][1] = rs;
        _pricingData.research[2][1] = ry;
      }
      // Update live price map so cost display is correct immediately
      CODE_PRICE_MAP.RM = rm; CODE_PRICE_MAP.RS = rs; CODE_PRICE_MAP.RY = ry;
      if(s){ s.textContent='✅ Saved to server'; setTimeout(function(){ s.textContent=''; },3000); }
      toast('✅ Research prices saved to server','ok');
    } else {
      if(s) s.textContent='❌ '+(data.error||'Save failed');
      toast('❌ Failed to save prices','err');
    }
  }).catch(function(){
    // Fallback to localStorage only
    localStorage.setItem('saa_research_prices', JSON.stringify({rm:rm,rs:rs,ry:ry}));
    if(s){ s.textContent='✅ Saved locally (offline)'; setTimeout(function(){ s.textContent=''; },3000); }
  });
}

function adminLoadResearchPrices(){
  // Try KV first, fallback to localStorage
  fetch('https://smartacademy-ai.kasongokimba.workers.dev',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({_appSecret:APP_SECRET, action:'get-research-prices'})
  }).then(function(r){ return r.json(); })
  .then(function(data){
    if(data.ok && data.prices){
      _applyResearchPrices(data.prices);
      localStorage.setItem('saa_research_prices', JSON.stringify(data.prices));
    }
  }).catch(function(){
    // Fallback to localStorage
    var saved = JSON.parse(localStorage.getItem('saa_research_prices')||'{}');
    if(saved.rm) _applyResearchPrices(saved);
  });
}

function adminLoadDmStats(){
  var q=parseInt(localStorage.getItem('dm_total_queries')||'0');
  var c=parseInt(localStorage.getItem('dm_total_calls')||'0');
  var scores=JSON.parse(localStorage.getItem('dm_all_scores')||'[]');
  var avg=scores.length?Math.round(scores.reduce(function(a,b){return a+b;},0)/scores.length):null;
  var qEl=document.getElementById('admin-dm-queries'); if(qEl) qEl.textContent=q;
  var cEl=document.getElementById('admin-dm-calls'); if(cEl) cEl.textContent=c;
  var aEl=document.getElementById('admin-dm-avg'); if(aEl) aEl.textContent=avg||'—';
}
