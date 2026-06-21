// ════════════════════════════════════════════════════════════════
// features/payments.js
// All payment functionality: pricing page display, PayFast card
// checkout, DRC mobile money flow, proof-of-payment upload, the
// "Unique Amount" auto-matching widget, and admin-side payment
// management (FX rates, DRC pending-payment matching).
// Extracted from index.html (split, June 2026). Logic unchanged
// except where noted below.
//
// DEPENDENCIES (must load before this file):
//   - core/session-state.js
//   - core/ui-helpers.js    (toast)
//   - features/access-codes.js (WORKER_URL constant, savePurchasedCode
//     calls into the same code-saving system; getDeviceFingerprint)
//
// SCOPE NOTE: this feature turned out to be much larger than the
// original handover notes suggested — it spans the entire pricing
// page (currency/country display, PayFast, DRC mobile money, and a
// separate "Unique Amount" auto-matching widget are all genuinely
// distinct payment paths, not duplicates).
//
// BUGS FOUND DURING EXTRACTION:
//
// 1. HARDCODED APP_SECRET (separate from the admin-key issue fixed
//    earlier): the original index.html declares APP_SECRET as a
//    plain string in client-side JS, and one embedded <script>
//    block on the pricing page duplicates that same literal value
//    a second time independently. DOCUMENTED, ACCEPTED limitation,
//    not fixed — see SECURITY_NOTE_APP_SECRET.md for why a static
//    site can't truly hide this value, and what real backstop
//    (server-side cost limiting) already provides.
//
// 2. Hardcoded admin-key fallback ('SmartAdmin2024') found in the
//    FX-rates and DRC-admin-matching functions — same vulnerability
//    class fixed elsewhere in this project. FIXED here: removed.
//
// NOT YET HANDLED: mobUpdateCdfPrices() was found embedded directly
// in the pricing page's HTML markup (inside an inline <script> tag,
// not the main script block) — it will need to travel with the HTML
// skeleton when that's built, not live in this file.
// ════════════════════════════════════════════════════════════════

// ── PROOF-OF-PAYMENT UPLOAD STATE ───────────────────────────────
var _proofImageB64 = null;
var _proofImageMime = 'image/jpeg';

// ── PRICING DATA (rates, plans, prices per region) ──────────────
var _pricingData = {
  rates: {
    za:  { currency:'ZAR', rate:16.5,  method:'Bank-to-Cell Payment', phone:'0761428664',  note:'Send via bank-to-cellphone payment (any bank), then WhatsApp your receipt to the same number.' },
    drc: { currency:'FC',  rate:2250,  method:'Airtel Money', phone:'0973201231', note:'Envoyer via Airtel Money ou M-Pesa, puis WhatsApp votre reçu.' },
    intl:{ currency:'USD', rate:1, method:'Mobile Payment', phone:'+27761328664', note:'Pay to our DRC number above, then upload receipt for instant code.' }
  },
  ind: [ // key, usd
    ['p_1week',  5],
    ['p_1month', 10],
    ['p_1year',  90],
  ],
  grp: [
    ['p_1hour',  60],
    ['p_1week',  110],
    ['p_1month', 220],
    ['p_1year',  1700]
  ],
  research: [ // label, usd, code_prefix, description
    ['⏱ Standard (RM-)', 20,  'RM', '30-day access · Best for occasional analysis']
  ]
};
var _pricingCountry = 'intl';
var _selectedPlan = '';


// ── PRICING PAGE DISPLAY (currency conversion, rates, contact info) ──
function roundLocal(val, currency){
  // Round to nearest 5 or 10 for clean local prices
  if(currency==='YAR' || currency==='ZAR'){
    return Math.round(val/5)*5;
  }
  if(currency==='FC'){
    return Math.round(val/500)*500;
  }
  return Math.round(val*100)/100;
}

function formatLocal(usd, country){
  var d = _pricingData.rates[country];
  if(country==='intl') return '';
  var val = roundLocal(usd * d.rate, d.currency);
  var fmt = val.toLocaleString();
  return d.currency + ' ' + fmt;
}

function setPricingCountry(country){
  _pricingCountry = country;
  switchPayPanel(country);
  scrollPricingTop();

  // Update tabs
  ['intl','za','drc'].forEach(function(c){
    var btn = document.getElementById('pcb-'+c);
    if(btn) btn.className = 'pcountry-btn' + (c===country?' active':'');
  });
  renderPricingPage();
}

function renderPricingPage(){
  var c = _pricingCountry;
  var d = _pricingData.rates[c];

  // Payment info — handle "coming soon" for intl (no phone)
  var methodLabel = document.getElementById('p-method-label');
  var phoneDisplay = document.getElementById('p-phone-display');
  var methodNote   = document.getElementById('p-method-note');
  var paymentBox   = document.getElementById('p-payment-box');

  var paymentBox = document.getElementById('p-payment-box-wrap');
  if(c === 'intl'){
    // Wise banner built with DOM to avoid quote escaping issues
    if(paymentBox){
      var wb = document.createElement('div');
      wb.style.cssText = 'background:linear-gradient(135deg,#1a56db,#0891b2);border-radius:14px;padding:16px 18px;text-align:center;margin-bottom:16px;';
      paymentBox.innerHTML = '';
    } else {
      if(methodLabel) methodLabel.textContent = d.method;
      if(phoneDisplay){ phoneDisplay.textContent = d.phone; phoneDisplay.style.fontSize=''; phoneDisplay.style.color=''; }
      var translatedNote = saT('p_pay_note_'+c);
      if(methodNote) methodNote.textContent = (translatedNote && translatedNote !== 'p_pay_note_'+c) ? translatedNote : d.note;
    }
    var ctaInd = document.getElementById('p-cta-box-ind');
    var ctaGrp = document.getElementById('p-cta-box-grp');
    if(ctaInd) ctaInd.style.display='';
    if(ctaGrp) ctaGrp.style.display='';
  }

  // Price ranges for display (min–max)
  var priceRanges = {W:{min:4,max:5},M:{min:8,max:10},Y:{min:86,max:90},WC:{min:108,max:112},MC:{min:218,max:222},YC:{min:1698,max:1702}};
  var planKeys = {p_1week:'W',p_1month:'M',p_1year:'Y'};
  var planKeysGrp = {p_1hour:'WC',p_1week:'WC',p_1month:'MC',p_1year:'YC'};

  // Render individual rows
  var indHtml = '';
  _pricingData.ind.forEach(function(row){
    var planKey = planKeys[row[0]] || 'W';
    var r = priceRanges[planKey] || {min:row[1],max:row[1]};
    var main, sub='';
    if(c==='intl'){
      main = '$'+r.min+' – $'+r.max;
    } else if(c==='za'){
      main = 'R'+Math.round(r.min*18.5)+' – R'+Math.round(r.max*18.5);
    } else if(c==='drc'){
      main = 'FC '+Math.round(r.min*d.rate).toLocaleString()+' – '+Math.round(r.max*d.rate).toLocaleString();
      sub  = '= $'+r.min+' – $'+r.max;
    }
    indHtml += '<div class="p-row"><div class="p-row-label">'+saT(row[0])+'</div><div><div class="p-row-main">'+main+'</div>'+(sub?'<div class="p-row-sub">'+sub+'</div>':'')+'</div></div>';
  });
  // Render group rows
  var grpHtml = '';
  _pricingData.grp.forEach(function(row){
    var main2, sub2='';
    if(c==='intl'){
      main2 = '$'+row[1];
    } else if(c==='za'){
      main2 = formatLocal(row[1],c);
    } else if(c==='drc'){
      main2 = 'FC '+roundLocal(row[1]*d.rate,'FC').toLocaleString();
      sub2  = '= $'+row[1];
    }
    grpHtml += '<div class="p-row"><div class="p-row-label">'+saT(row[0])+'</div><div><div class="p-row-main">'+main2+'</div>'+(sub2?'<div class="p-row-sub">'+sub2+'</div>':'')+'</div></div>';
  });
  document.getElementById('p-grp-rows').innerHTML = grpHtml;

  // Render research rows (USD only, with local equivalent for ZA/DRC)
  var resHtml = '';
  _pricingData.research.forEach(function(row){
    var label=row[0], usd=row[1], code=row[2], desc=row[3];
    var main = '$'+usd;
    var sub = '';
    if(c==='za'){
      sub = '≈ R'+Math.round(usd * (d.rate||16.5));
    } else if(c==='drc'){
      sub = '≈ FC '+(Math.round(usd*(d.rate||2250))).toLocaleString();
    }
    resHtml += '<div class="p-row" style="border-bottom:1px solid rgba(124,58,237,0.1);padding:10px 0;">'
      +'<div style="flex:1;">'
      +'<div style="font-size:13px;font-weight:700;color:#1e293b;">'+label+'</div>'
      +'<div style="font-size:11px;color:#64748b;margin-top:2px;">'+desc+'</div>'
      +'</div>'
      +'<div style="text-align:right;">'
      +'<div class="p-row-main" style="color:#a78bfa;">'+main+'</div>'
      +(sub?'<div class="p-row-sub">'+sub+'</div>':'')
      +'</div></div>';
  });
  var resEl = document.getElementById('p-research-rows');
  if(resEl) resEl.innerHTML = resHtml;

  // Research payment info
  var resPayEl = document.getElementById('p-research-payment');
  if(resPayEl){
    if(c==='intl'){
      resPayEl.innerHTML = '<div style="background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.2);border-radius:10px;padding:12px 14px;text-align:center;">'
        +''
        +'<div style="font-size:12px;color:#64748b;margin-top:4px;">Go to <a href="https://wise.com/pay/r/smartacademyai" target="_blank" style="color:#2563eb;font-weight:700;">wise.com/pay/r/kasongok7</a> · Include your phone number in the reference.</div>'
        +'<div style="font-size:11px;color:#888;margin-top:4px;">Then WhatsApp your proof to +27761328664 · Code within 24 hours.</div>'
        +'<a href="https://wa.me/27761328664" target="_blank" style="display:inline-block;margin-top:10px;padding:8px 20px;background:linear-gradient(135deg,#25D366,#128C7E);border-radius:8px;color:#fff;font-size:12px;font-weight:700;text-decoration:none;">💬 WhatsApp +27761328664</a>'
        +'</div>';
    } else {
      resPayEl.innerHTML = '<div style="background:rgba(37,211,102,0.08);border:1px solid rgba(37,211,102,0.3);border-radius:10px;padding:12px 14px;text-align:center;">'
        +'<div style="font-size:13px;font-weight:700;color:#128C7E;">📱 Pay to the number above</div>'
        +'<div style="font-size:12px;color:#555;margin-top:4px;">Then WhatsApp your proof of payment to the same number.</div>'
        +'<div style="font-size:11px;color:#888;margin-top:4px;">Code delivered within 24 hours.</div>'
        +'</div>';
    }
  }

  var waNum = d.phone.replace(/[^0-9]/g,'');
  var waInd = encodeURIComponent('Hello, I would like to purchase an Individual access code for Smart Academy AI. Country: '+c.toUpperCase()+'. Please advise on payment.');
  var waGrp = encodeURIComponent('Hello, I would like to purchase a Group/Classroom access code for Smart Academy AI. Country: '+c.toUpperCase()+'. Please advise on payment.');
  var waBase = 'https://wa.me/'+waNum+'?text=';
  var pWaInd=document.getElementById('p-wa-ind'); if(pWaInd) pWaInd.href = waBase+waInd;
  var pWaGrp=document.getElementById('p-wa-grp'); if(pWaGrp) pWaGrp.href = waBase+waGrp;
}

function copyPriceNumber(){
  var num = document.getElementById('p-phone-display').textContent;
  navigator.clipboard.writeText(num).then(function(){
    toast('Number copied!','ok');
  });
}

// ── WhatsApp Contact Card ─────────────────────────────
function _renderWaContactCard(){
  var num = localStorage.getItem('saa_wa_contact')||'';
  var card = document.getElementById('contact-wa-card');
  var link = document.getElementById('contact-wa-link');
  var val  = document.getElementById('contact-wa-val');
  if(!card) return;
  if(num){
    var clean = num.replace(/[^0-9]/g,'');
    card.style.display = '';
    if(link){ link.href = 'https://wa.me/'+clean+'?text='+encodeURIComponent('Hello, I have a question about Smart Academy AI.'); link.textContent = num; }
    // Also update the contact-cards grid
    var wrap = document.getElementById('contact-cards-wrap');
    if(wrap) wrap.style.gridTemplateColumns = '1fr 1fr';
  } else {
    card.style.display = 'none';
    var wrap = document.getElementById('contact-cards-wrap');
    if(wrap) wrap.style.gridTemplateColumns = '1fr';
  }
}

// Load saved rates from admin
function loadPricingRates(){
  var saved = localStorage.getItem('saa_pricing_rates');
  if(saved){
    try {
      var r = JSON.parse(saved);
      if(r.za)  Object.assign(_pricingData.rates.za,  r.za);
      if(r.drc) Object.assign(_pricingData.rates.drc, r.drc);
      if(r.intl) Object.assign(_pricingData.rates.intl, r.intl);
    } catch(e){}
  }
  // Populate admin WA contact field if open
  var waNum = localStorage.getItem('saa_wa_contact')||'';
  var waField = document.getElementById('phone-wa-contact');
  if(waField && waNum) waField.value = waNum;
}


// Call on pricing page open
window.addEventListener('load', function(){
  loadPricingRates();
});
// ── PAYMENT METHOD TOGGLE ─────────────────────────────────────
var _pfPlan = null, _pfPrice = 0;


// ── PAYFAST PANEL & PLAN SELECTION (includes pfCheckout) ─────────────
function togglePayPanel(type){
  var cardPanel   = document.getElementById('pay-card-panel');
  var mobilePanel = document.getElementById('pay-mobile-panel');
  var cardBtn     = document.getElementById('pay-card-panel-btn');
  var mobileBtn   = document.getElementById('pay-mobile-panel-btn');
  if(!cardPanel||!mobilePanel) return;

  var isCard = type === 'card';

  // Always show selected panel, hide the other — no toggle-to-close
  cardPanel.style.display   = isCard  ? 'block' : 'none';
  mobilePanel.style.display = !isCard ? 'block' : 'none';

  // Load ZAR rate when card panel opens
  if(isCard) pfLoadZarRate();

  // Update CDF prices when mobile panel opens
  if(!isCard){
    setTimeout(function(){ if(typeof mobUpdateCdfPrices==='function') mobUpdateCdfPrices(); }, 100);
    // Auto-select 1 Week plan so button shows immediately
    setTimeout(function(){ if(!_mobPlan && typeof mobSelectPlan==='function') mobSelectPlan('W', 5); }, 150);
  }

  // Highlight active button
  cardBtn.style.border   = isCard  ? '2px solid #60a5fa' : '2px solid transparent';
  mobileBtn.style.border = !isCard ? '2px solid #34d399' : '2px solid transparent';
}

function pfSelectPlan(plan, price){
  _pfPlan = plan; _pfPrice = price;
  var labels = {W:'1 Week',M:'1 Month',Y:'1 Year'};
  ['W','M','Y'].forEach(function(p){
    var row   = document.getElementById('pf-plan-'+p);
    var radio = document.getElementById('pf-radio-'+p);
    if(row)  { row.style.borderColor   = p===plan ? '#60a5fa' : 'rgba(255,255,255,0.1)'; row.style.background = p===plan ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.06)'; }
    if(radio){ radio.style.background  = p===plan ? '#60a5fa' : 'transparent'; radio.style.borderColor = p===plan ? '#60a5fa' : 'rgba(255,255,255,0.3)'; }
  });
  var fxZar = parseFloat(localStorage.getItem('saa_fx_zar')||'18.5');
  var zarAmount = (price * fxZar).toFixed(2); // exact ZAR for PayFast
  var btn = document.getElementById('pf-pay-btn');
  if(btn){ btn.textContent = '🔒 Pay \$'+price+' via PayFast'; btn.disabled = false; btn.style.opacity = '1'; }
  var el = document.getElementById('pf-amount');       if(el) el.value = zarAmount; // PayFast uses ZAR
  var el2 = document.getElementById('pf-item-name');   if(el2) el2.value = 'Smart Academy AI - '+(labels[plan]||plan)+' Access';
  var el3 = document.getElementById('pf-custom-plan'); if(el3) el3.value = plan;
  var el4 = document.getElementById('pf-custom-client'); if(el4) el4.value = localStorage.getItem('saa_ua_client_id')||('pf_'+Date.now());
}

// Load ZAR rate from worker on pricing page open
var _pfZarRate = 16.5;
async function pfLoadZarRate(){
  // Quietly fetch live FX rate for internal ZAR calculation only —
  // USD prices ($5/$10/$90) stay as the only thing shown to the client.
  // PayFast's own checkout page lets the client pick their preferred currency.
  try{
    var r = await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'get-fx-rates'})});
    var d = await r.json();
    if(d.zar) {
      _pfZarRate = parseFloat(d.zar);
      localStorage.setItem('saa_fx_zar', d.zar);
    }
  }catch(e){}
}


async function pfCheckout(){
  if(!_pfPlan){ toast('Please select a plan first','err'); return; }
  var btn = document.getElementById('pf-pay-btn');
  btn.textContent = '⏳ Preparing secure payment...';
  btn.disabled = true;

  var clientId = localStorage.getItem('saa_ua_client_id') || ('pf_'+Date.now());
  localStorage.setItem('saa_ua_client_id', clientId);

  try{
    var res = await fetch(WORKER_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET, action:'payfast-sign', plan:_pfPlan, clientId:clientId})
    });
    var data = await res.json();
    if(!data.ok){ toast('PayFast error: '+(data.error||'unknown'),'err'); btn.textContent='🔒 Pay \$'+_pfPrice+' via PayFast'; btn.disabled=false; return; }

    // Build and submit form dynamically
    var form = document.getElementById('pf-form');
    form.innerHTML = '';
    form.action = 'https://www.payfast.co.za/eng/process';
    form.method = 'POST';
    Object.keys(data.params).forEach(function(k){
      var inp = document.createElement('input');
      inp.type='hidden'; inp.name=k; inp.value=data.params[k];
      form.appendChild(inp);
    });

    localStorage.setItem('pf_pending_client', clientId);
    localStorage.setItem('pf_pending_plan', _pfPlan);
    localStorage.setItem('pf_pending_ts', Date.now().toString());
    pfStartPolling(clientId);
    form.submit();
  }catch(e){
    toast('Connection error. Please try Mobile Money.','err');
    btn.textContent = '🔒 Pay \$'+_pfPrice+' via PayFast';
    btn.disabled = false;
  }
}

// ── PAYFAST POLLING & CODE DELIVERY + AUTO-RESUME DRC CHECK ON LOAD ──
// (showDrcCodeOverlay lives here since it's called by the auto-resume
// listener immediately below it in the original file)
function pfStartPolling(clientId){
  var poll = setInterval(async function(){
    try{
      var r = await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({_appSecret:APP_SECRET,action:'payfast-poll',clientId:clientId})});
      var d = await r.json();
      if(d.status==='ready' && d.code){
        clearInterval(poll);
        localStorage.removeItem('pf_pending_client');
        // Show code prominently in a modal
        pfShowCodeModal(d.code, d.plan);
      }
    }catch(e){}
  }, 5000);
  setTimeout(function(){ clearInterval(poll); }, 3600000);
}

// Auto-resume PayFast code check — runs on every page load, non-blocking.
// Fixes: if the client closed/left the tab after paying (so pfStartPolling's
// in-memory interval died with it), this picks the pending payment back up
// next time they visit the site, using the same pf_pending_client saved in
// localStorage at checkout time. Mirrors the DRC auto-resume pattern above.
window.addEventListener('load', function(){
  setTimeout(function(){
    try{
      var clientId = localStorage.getItem('pf_pending_client') || '';
      if(!clientId) return;
      var pendingTs = parseInt(localStorage.getItem('pf_pending_ts')||'0');
      // Stop checking after 24 hours — payment is presumed abandoned/failed by then
      if(Date.now() - pendingTs > 86400000){
        localStorage.removeItem('pf_pending_client');
        localStorage.removeItem('pf_pending_plan');
        localStorage.removeItem('pf_pending_ts');
        return;
      }
      fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({_appSecret:APP_SECRET,action:'payfast-poll',clientId:clientId})
      }).then(function(r){return r.json();}).then(function(d){
        if(d.status==='ready' && d.code){
          localStorage.removeItem('pf_pending_client');
          localStorage.removeItem('pf_pending_plan');
          localStorage.removeItem('pf_pending_ts');
          pfShowCodeModal(d.code, d.plan);
        } else {
          // Still pending — resume active polling on this page load too
          pfStartPolling(clientId);
        }
      }).catch(function(){});
    }catch(e){}
  }, 1500);
});

function pfShowCodeModal(code, plan){
  savePurchasedCode(code, plan, 'payfast');
  // Longer-duration, clearer toast — matches DRC's pattern (6s instead of default)
  toast('🎉 Payment confirmed! Code: ' + code + ' — saved in My Codes (Pricing page)', 'ok', 6000);
  renderMyCodesTable();
  // Also show pricing page so learner sees the table
  setTimeout(function(){ showPage('page-pricing'); }, 500);
}

function savePurchasedCode(code, plan, source){
  try{
    // Respect explicit deletions — if the learner removed this code on purpose,
    // never auto-re-add it just because the background poll finds it again.
    var deleted = [];
    try{ deleted = JSON.parse(localStorage.getItem('saa_deleted_codes')||'[]'); }catch(e0){}
    if(deleted.indexOf(code) !== -1) return;

    var stored = JSON.parse(localStorage.getItem('saa_saved_codes')||'[]');
    // Avoid duplicates
    if(stored.some(function(s){ return s.code === code; })) return;
    var planLabels = {W:'1 Week',M:'1 Month',Y:'1 Year',RM:'Research Month',RS:'Research 6M',RY:'Research Year'};
    var planStr = plan ? (planLabels[plan]||plan) : (code.startsWith('M-')?'1 Month':code.startsWith('Y-')?'1 Year':code.startsWith('W-')?'1 Week':'Access');
    stored.push({code:code, plan:planStr, savedAt:Date.now(), source:source||'drc', region: source==='payfast'?'SA':'DRC'});
    localStorage.setItem('saa_saved_codes', JSON.stringify(stored));
    renderMyCodesTable();
  }catch(e){}
}

function showDrcCodeOverlay(code){
  console.log('[DRC] Code received, saving:', code);
  savePurchasedCode(code, null, 'drc');
  // Verify it was actually saved
  try{
    var check = JSON.parse(localStorage.getItem('saa_saved_codes')||'[]');
    console.log('[DRC] saa_saved_codes now contains:', check.length, 'codes', check);
  }catch(e){ console.error('[DRC] Failed to verify save:', e); }
  // Show toast notification — longer duration so it's not missed
  toast('🎉 Code ready: ' + code + ' — saved in My Codes (Pricing page)', 'ok', 6000);
  // If pricing page is open, refresh the table
  renderMyCodesTable();
  // Also navigate to pricing page automatically so the client SEES the saved code
  setTimeout(function(){ showPage('page-pricing'); }, 1200);
}

// Auto-resume DRC code check — runs on every page load, non-blocking
window.addEventListener('load', function(){
  setTimeout(function(){
    try{
      var clientId = localStorage.getItem('saa_ua_client_id') || '';
      if(!clientId) return;
      var lastCheck = parseInt(localStorage.getItem('saa_drc_last_check')||'0');
      if(Date.now() - lastCheck < 60000) return;
      localStorage.setItem('saa_drc_last_check', Date.now().toString());
      fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({_appSecret:APP_SECRET,action:'drc-check-status',clientId:clientId})
      }).then(function(r){return r.json();}).then(function(d){
        if(d.ok && d.status==='matched' && d.code){
          localStorage.removeItem('saa_drc_pending');
          showDrcCodeOverlay(d.code);
          var st = document.getElementById('drc-inline-status');
          if(st){st.style.display='block';st.style.cssText='display:block;margin-top:8px;border-radius:8px;padding:10px;font-size:13px;font-weight:700;text-align:center;background:rgba(16,185,129,0.15);color:#10b981;';st.textContent='🎉 Your code is ready! Check the popup.';}
        } else if(d.ok && d.status==='pending'){
          var pending = JSON.parse(localStorage.getItem('saa_drc_pending')||'null');
          if(pending && pending.status==='waiting') drcInlinePoll(clientId);
        }
      }).catch(function(){});
    }catch(e){}
  }, 3000);
});

// ── DRC MOBILE MONEY: 'MOB' WIDGET (plan selection, proceed, reset) ──
var _uaPlan = null, _uaRegion = null, _uaAmount = null, _uaClientId = null, _uaExpiry = null, _uaPollTimer = null;

var _mobPlan = null, _mobRegion = 'DRC'; // DRC only
function mobCheckProceed(){
  var btn = document.getElementById('mob-proceed-btn');
  if(_mobPlan){
    var planLabel = _mobPlan==='W'?'1 Week — $5':_mobPlan==='M'?'1 Month — $10':'1 Year — $90';
    btn.textContent = '🇨🇩 Continue — ' + planLabel;
    btn.style.background = 'linear-gradient(135deg,#0891b2,#0e7490)';
    btn.style.color = '#fff';
    btn.style.cursor = 'pointer';
    btn.disabled = false;
  } else {
    btn.textContent = '📱 Select a plan to continue';
    btn.style.background = 'rgba(255,255,255,0.15)';
    btn.style.color = 'rgba(255,255,255,0.4)';
    btn.style.cursor = 'default';
    btn.disabled = true;
  }
}
function mobSelectPlan(plan, price){
  _mobPlan = plan;
  _mobRegion = 'DRC';
  _uaPlan = plan;
  _uaRegion = 'DRC';
  ['W','M','Y'].forEach(function(p){
    var el = document.getElementById('mob-plan-'+p);
    var radio = document.getElementById('mob-radio-'+p);
    if(el) el.style.borderColor = p===plan ? '#06b6d4' : 'rgba(255,255,255,0.15)';
    if(radio) radio.style.background = p===plan ? '#06b6d4' : 'transparent';
  });
  mobCheckProceed();
}
function mobProceed(){
  if(!_mobPlan) return;
  document.getElementById('mob-step0').style.display = 'none';
  document.getElementById('mob-details').style.display = 'block';

  var fxZar = parseFloat(localStorage.getItem('saa_fx_zar'))||18.5;
  var fxCdf = parseFloat(localStorage.getItem('saa_fx_cdf'))||2800;
  var prices = {W:5, M:10, Y:90};
  var price = prices[_mobPlan] || 5;

  if(_mobRegion === 'DRC'){
    // Show: DRC numbers + code box. Hide: unique amount widget, proof upload
    document.getElementById('unique-amount-widget').style.display = 'none';
    document.getElementById('proof-code-box').style.display = 'none';
    var det = document.getElementById('mob-details');
    var drcDiv = document.getElementById('mob-drc-instructions');
    if(!drcDiv){
      drcDiv = document.createElement('div');
      drcDiv.id = 'mob-drc-instructions';
      drcDiv.style.cssText = 'background:linear-gradient(135deg,#0f2044,#1a3a6e);border:1px solid rgba(6,182,212,0.3);border-radius:14px;padding:12px;margin-bottom:12px;';
      drcDiv.innerHTML = '<div style="font-size:11px;font-weight:800;color:#06b6d4;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">🇨🇩 Pay via Mobile Money · DRC</div>'
        + '<div style="font-size:22px;font-weight:900;color:#f59e0b;text-align:center;margin:8px 0;">$' + price + ' <span style="font-size:14px;color:rgba(255,255,255,0.5);">≈ CDF ' + Math.round(price*fxCdf).toLocaleString() + '</span></div>'
        + '<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:8px;">'
        + '<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:6px 12px;display:flex;align-items:center;justify-content:space-between;"><span style="font-size:9px;font-weight:800;color:#f97316;letter-spacing:1px;">AIRTEL MONEY</span><span style="font-size:15px;font-weight:900;color:#fff;letter-spacing:1px;">0973201231</span></div>'
        + '<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:6px 12px;display:flex;align-items:center;justify-content:space-between;"><span style="font-size:9px;font-weight:800;color:#10b981;letter-spacing:1px;">M-PESA DRC</span><span style="font-size:15px;font-weight:900;color:#fff;letter-spacing:1px;">0862716000</span></div>'
        + '<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:6px 12px;display:flex;align-items:center;justify-content:space-between;"><span style="font-size:9px;font-weight:800;color:#f59e0b;letter-spacing:1px;">ORANGE MONEY</span><span style="font-size:15px;font-weight:900;color:#fff;letter-spacing:1px;">0850275466</span></div>'
        + '</div>'
        + '<div style="background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.25);border-radius:10px;padding:10px;">'        + '<div style="font-size:11px;font-weight:700;color:#06b6d4;margin-bottom:4px;text-align:center;">📋 Copy &amp; Paste Your Payment SMS Here</div>'        + '<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-bottom:8px;text-align:center;">After paying, open your SMS or WhatsApp confirmation → copy the full message → paste below</div>'        + '<textarea id="drc-inline-text" placeholder="e.g. Trans.ID: PP260130.1024.B01234, Vous avez envoyé 5 USD à DATABUNDL2..." style="width:100%;padding:10px;background:rgba(255,255,255,0.07);border:1px solid rgba(6,182,212,0.4);border-radius:10px;color:#fff;font-size:12px;resize:none;height:72px;box-sizing:border-box;line-height:1.5;" oninput="drcInlineTextInput(this.value)"></textarea>'        + '<div id="drc-inline-preview" style="display:none;"></div>'        + '<div id="drc-inline-status" style="display:none;margin-top:8px;border-radius:8px;padding:10px;font-size:12px;font-weight:600;text-align:center;"></div>'
        + '<button id="drc-inline-submit" onclick="drcInlineSubmit()" style="display:none;width:100%;margin-top:8px;padding:12px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:\'DM Sans\',sans-serif;">⚡ Submit & Get My Code</button>'
        + '</div>'
        + '<button onclick="mobReset()" style="width:100%;padding:8px;background:transparent;border:none;color:rgba(255,255,255,0.3);font-size:12px;cursor:pointer;margin-top:2px;">← Change plan</button>';
      det.insertBefore(drcDiv, det.firstChild);
    } else { drcDiv.style.display = 'block';
    }

  } else {
    // INTL — show unique amount widget + code box
    document.getElementById('unique-amount-widget').style.display = 'block';
    document.getElementById('proof-code-box').style.display = 'block';
    var drcDiv = document.getElementById('mob-drc-instructions');
    if(drcDiv) drcDiv.style.display = 'none';
    uaGetAmount();
  }
}
function mobReset(){
  document.getElementById('mob-step0').style.display = 'block';
  document.getElementById('mob-details').style.display = 'none';
  var drcDiv = document.getElementById('mob-drc-instructions');
  if(drcDiv) drcDiv.style.display = 'none';
}

// ── 'UNIQUE AMOUNT' AUTO-MATCHING WIDGET (region/plan/amount/polling) ──
function uaSelectPlan(btn, plan){
  _uaPlan = plan;
  document.querySelectorAll('.ua-plan-btn').forEach(function(b){
    b.style.background='rgba(255,255,255,0.08)';b.style.border='1px solid rgba(255,255,255,0.2)';b.style.color='#fff';
  });
  btn.style.background='rgba(6,182,212,0.2)';btn.style.border='1px solid #06b6d4';btn.style.color='#06b6d4';
}
function uaSelectRegion(btn, region){
  _uaRegion = region;
  document.querySelectorAll('.ua-region-btn').forEach(function(b){
    b.style.background='rgba(255,255,255,0.08)';b.style.border='1px solid rgba(255,255,255,0.2)';b.style.color='#fff';
  });
  btn.style.background='rgba(245,158,11,0.2)';btn.style.border='1px solid #f59e0b';btn.style.color='#f59e0b';
}
function uaGetClientId(){
  var id=localStorage.getItem('saa_ua_client_id');
  if(!id){id='ua_'+Date.now()+'_'+Math.random().toString(36).slice(2,10);localStorage.setItem('saa_ua_client_id',id);}
  return id;
}
async function uaGetAmount(){
  var errEl=document.getElementById('ua-error');errEl.style.display='none';
  if(!_uaPlan){
    var planLabel=document.getElementById('ua-plan-label');
    if(planLabel){ planLabel.style.color='#ef4444'; planLabel.classList.add('ua-flash');
      setTimeout(function(){planLabel.style.color='rgba(255,255,255,0.5)';planLabel.classList.remove('ua-flash');},2000); }
    errEl.textContent='⚠️ Please select a plan first.';errEl.style.display='block';return;
  }
  if(!_uaRegion){
    var regionLabel=document.getElementById('ua-region-label');
    if(regionLabel){ regionLabel.style.color='#ef4444'; regionLabel.classList.add('ua-flash');
      setTimeout(function(){regionLabel.style.color='rgba(255,255,255,0.5)';regionLabel.classList.remove('ua-flash');},2000); }
    errEl.textContent='⚠️ Please select your region.';errEl.style.display='block';return;
  }

  // ── FIXED PRICES for SA and DRC (no unique amount needed) ──────
  var fixedPrices = {W:5, M:10, Y:90};
  var fxZar = parseFloat(localStorage.getItem('saa_fx_zar'))||18.5;
  var fxCdf = parseFloat(localStorage.getItem('saa_fx_cdf'))||2800;

  if(_uaRegion === 'SA' || _uaRegion === 'DRC'){
    _uaClientId = uaGetClientId();
    _uaAmount = fixedPrices[_uaPlan] || 5;
    _uaExpiry = Date.now() + 24*60*60*1000; // 24hr
    document.getElementById('ua-step1').style.display='none';
    document.getElementById('ua-step2').style.display='block';
    document.getElementById('ua-amount-display').textContent = '$'+_uaAmount.toFixed(2);
    var localEl = document.getElementById('ua-local-display');
    if(_uaRegion === 'SA'){
      localEl.textContent = '≈ ZAR '+(_uaAmount * fxZar).toFixed(2);
    } else {
      localEl.textContent = '≈ CDF '+Math.round(_uaAmount * fxCdf).toLocaleString();
    }
    document.getElementById('ua-attempts-left').textContent = '';
    var expiryEl = document.getElementById('ua-expiry');
    expiryEl.textContent = '';
    return;
  }

  // ── UNIQUE AMOUNT for International ────────────────────────────
  var btn=document.getElementById('ua-get-btn');btn.textContent='⏳ Generating...';btn.disabled=true;
  _uaClientId=uaGetClientId();
  try{
    var res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'get-payment-amount',plan:_uaPlan,region:_uaRegion,clientId:_uaClientId})});
    var data=await res.json();
    if(!data.ok){
      errEl.textContent=data.message||data.error||'Could not generate amount. Try again.';
      errEl.style.display='block';btn.textContent='🎲 Get My Unique Payment Amount';btn.disabled=false;return;
    }
    _uaAmount=data.amount;_uaExpiry=data.expiresAt;
    document.getElementById('ua-step1').style.display='none';
    document.getElementById('ua-step2').style.display='block';
    document.getElementById('ua-amount-display').textContent='$'+data.amount.toFixed(2);
    var localEl=document.getElementById('ua-local-display');
    localEl.textContent='Amount in USD';
    document.getElementById('ua-attempts-left').textContent=data.attemptsLeft+' attempt'+(data.attemptsLeft===1?'':'s')+' remaining this hour';
    var expiryEl=document.getElementById('ua-expiry');
    (function tick(){var left=Math.max(0,_uaExpiry-Date.now());var m=Math.floor(left/60000);var s=Math.floor((left%60000)/1000);
      expiryEl.textContent='Expires in '+m+'m '+(s<10?'0':'')+s+'s';if(left>0)setTimeout(tick,1000);})();
  }catch(e){errEl.textContent='Network error. Please try again.';errEl.style.display='block';btn.textContent='🎲 Get My Unique Payment Amount';btn.disabled=false;}
}
async function uaConfirmPaid(){
  if(_uaRegion==='DRC'){
    // Redirect to the inline paste flow — scroll up to DRC panel
    var det = document.getElementById('mob-details');
    if(det) det.scrollIntoView({behavior:'smooth'});
    var ta = document.getElementById('drc-inline-text');
    if(ta){ setTimeout(function(){ ta.focus(); }, 500); }
    toast('Paste your payment SMS in the box above ↑','ok');
    return;
  }
  var btn=document.getElementById('ua-paid-btn');btn.textContent='⏳ Noting your payment...';btn.disabled=true;
  try{
    await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'confirm-payment-sent',amount:_uaAmount,clientId:_uaClientId})});
  }catch(e){}

  // Save this slot to local tracking (up to 4)
  var slots=JSON.parse(localStorage.getItem('saa_ua_slots')||'[]');
  slots.push({amount:_uaAmount,plan:_uaPlan,region:_uaRegion,clientId:_uaClientId,status:'waiting',ts:Date.now()});
  if(slots.length>4) slots=slots.slice(-4); // keep last 4
  localStorage.setItem('saa_ua_slots',JSON.stringify(slots));

  // Show step 3 with all slots
  document.getElementById('ua-step2').style.display='none';
  document.getElementById('ua-step3').style.display='block';
  uaRenderSlots();
  uaStartPolling();

  // Show "Add another payment" button if slots < 4
  if(slots.length < 4){
    var addBtn=document.getElementById('ua-add-another');
    if(addBtn) addBtn.style.display='block';
  }
}

function uaRenderSlots(){
  var slots=JSON.parse(localStorage.getItem('saa_ua_slots')||'[]');
  var container=document.getElementById('ua-slots-container');
  if(!container) return;
  container.innerHTML='';
  var planNames={W:'1 Week Individual',M:'1 Month Individual',Y:'1 Year Individual',WC:'1 Week Classroom',MC:'1 Month Classroom',YC:'1 Year Classroom'};
  slots.forEach(function(slot,i){
    var color=slot.code?'#10b981':slot.status==='waiting'?'#f59e0b':'#06b6d4';
    var statusText=slot.code?'✅ Code Ready':'⏳ Waiting for payment match';
    var planName=planNames[slot.plan]||slot.plan;
    var div=document.createElement('div');
    div.style.cssText='background:rgba(255,255,255,0.05);border:1px solid '+(slot.code?'rgba(16,185,129,0.4)':'rgba(255,255,255,0.1)')+';border-radius:10px;padding:12px;margin-bottom:8px;';
    div.innerHTML=
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
      +'<div>'
        +'<div style="font-size:13px;font-weight:800;color:#fff;">'+planName+'</div>'
        +'<div style="font-size:11px;color:rgba(255,255,255,0.4);">Amount paid: <span style="color:#f59e0b;font-weight:700;">$'+parseFloat(slot.amount).toFixed(2)+'</span></div>'
      +'</div>'
      +'<div style="font-size:11px;font-weight:700;color:'+color+';">'+statusText+'</div>'
      +'</div>'
      +(slot.code
        ?'<div style="background:rgba(16,185,129,0.1);border:1px solid #10b981;border-radius:8px;padding:10px;text-align:center;">'
          +'<div style="font-size:10px;color:#10b981;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Your Access Code — enter this in Learner / Student</div>'
          +'<div style="font-size:22px;font-weight:900;color:#fff;font-family:Arial,sans-serif;letter-spacing:4px;">'+slot.code+'</div>'
          +'<button onclick="navigator.clipboard.writeText(\''+slot.code+'\').then(function(){toast(\'Copied!\',\'ok\')})" '
          +'style="margin-top:8px;padding:6px 18px;background:#10b981;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">📋 Copy Code</button>'
          +'</div>'
        :'<div style="font-size:11px;color:rgba(255,255,255,0.35);">Paid at '+new Date(slot.ts).toLocaleTimeString()+' · Code will appear here automatically</div>'
      );
    container.appendChild(div);
  });
}
function uaStartPolling(){
  if(_uaPollTimer)clearInterval(_uaPollTimer);
  _uaPollTimer=setInterval(async function(){
    var slots=JSON.parse(localStorage.getItem('saa_ua_slots')||'[]');
    var updated=false;
    for(var i=0;i<slots.length;i++){
      if(slots[i].code) continue; // already resolved
      try{
        var res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({_appSecret:APP_SECRET,action:'check-payment-status',amount:slots[i].amount,clientId:slots[i].clientId})});
        var data=await res.json();
        if(data.ok&&data.status==='code_sent'&&data.code){
          slots[i].code=data.code;
          slots[i].status='code_sent';
          updated=true;
          toast('🎉 Code ready for $'+parseFloat(slots[i].amount).toFixed(2)+' payment!','ok');
          // Save to saa_codes with region for admin table
          try{
            var savedCodes=JSON.parse(localStorage.getItem('saa_codes')||'[]');
            var regionMap={SA:'SA',DRC:'DRC',INTL:'INTL',INT:'INTL'};
            savedCodes.push({
              code:data.code,
              type:(slots[i].plan==='W'?'Weekly':slots[i].plan==='M'?'Monthly':'Yearly'),
              expiry:'',
              created:Date.now(),
              region:regionMap[(slots[i].region||'').toUpperCase()]||slots[i].region||'INTL',
              origin:slots[i].region||'INTL'
            });
            localStorage.setItem('saa_codes',JSON.stringify(savedCodes));
          }catch(e){}
        }
      }catch(e){}
    }
    if(updated){
      localStorage.setItem('saa_ua_slots',JSON.stringify(slots));
      uaRenderSlots();
    }
    // Stop polling if all slots resolved
    if(slots.length>0&&slots.every(function(s){return s.code;})) clearInterval(_uaPollTimer);
  },15000);
}

// ── CURRENCY PANEL SWITCHING & PRICING PAGE SCROLL ───────────────────
function switchPayPanel(c){
  // Map currency codes to panel IDs
  var map = {intl:'intl', za:'sa', drc:'drc'};
  var panelKey = map[c] || c;
  ['intl','sa','drc'].forEach(function(t){
    var el = document.getElementById(t+'-pay-panel');
    if(el) el.style.display = t===panelKey ? 'block' : 'none';
  });
}
function scrollPricingTop(){
  // Update trial card description with current admin duration
  var mins = parseInt(localStorage.getItem('saa_trial_minutes') || '10');
  var desc = document.getElementById('trial-card-desc');
  if(desc) desc.textContent = 'Try Smart Academy AI free for ' + mins + ' minute' + (mins===1?'':'s') + ' — no code needed.';
  // Restore any pending payment slots
  var slots=JSON.parse(localStorage.getItem('saa_ua_slots')||'[]');
  var validSlots=slots.filter(function(s){return !s.code&&(Date.now()-s.ts)<7200000;});
  if(validSlots.length>0){
    _uaClientId=uaGetClientId();
    document.getElementById('ua-step1').style.display='none';
    document.getElementById('ua-step3').style.display='block';
    uaRenderSlots();
    if(validSlots.length<4) document.getElementById('ua-add-another').style.display='block';
    uaStartPolling();
  }
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      // Scroll to show payment panel with offset for fixed nav
      var target = document.getElementById('intl-pay-panel') ||
                   document.getElementById('sa-pay-panel') ||
                   document.getElementById('drc-pay-panel');
      // Find the visible one
      var map2={intl:'intl',za:'sa',drc:'drc'}; var panelId=(map2[_pricingCountry]||_pricingCountry)+'-pay-panel';
      var panels = [panelId,'intl-pay-panel','sa-pay-panel','drc-pay-panel'];
      for(var pi=0;pi<panels.length;pi++){
        var p = document.getElementById(panels[pi]);
        if(p && p.style.display !== 'none'){ target = p; break; }
      }
      if(target){
        var top = target.getBoundingClientRect().top + window.pageYOffset - 70;
        window.scrollTo({top: top, behavior: 'smooth'});
      }
    });
  });
}

// ── PROOF-OF-PAYMENT UPLOAD (image/screenshot submission) ────────────
function handleProofDrop(e){
  var file = e.dataTransfer && e.dataTransfer.files[0];
  if(file) handleProofFile(file);
}

function handleProofFile(file){
  if(!file) return;
  _proofImageMime = file.type || 'image/jpeg';
  var reader = new FileReader();
  reader.onload = function(e2){
    var result = e2.target.result;
    _proofImageB64 = result.split(',')[1];
    // Always show the preview wrap (contains filename + delete button)
    var wrap = document.getElementById('proof-preview-wrap');
    if(wrap) wrap.style.display = 'block';
    var nameEl = document.getElementById('proof-file-name');
    if(nameEl) nameEl.textContent = file.name || 'File selected';
    // Show image preview for non-PDF
    if(file.type !== 'application/pdf'){
      var prev = document.getElementById('proof-preview-img');
      if(prev){ prev.src = result; prev.style.display = 'block'; }
    }
    var btn = document.getElementById('proof-submit-btn');
    if(btn) btn.style.display = 'block';
    setProofStatus('','');
  };
  reader.readAsDataURL(file);
}

function clearProofUpload(){
  _proofImageB64 = null;
  var w = document.getElementById('proof-preview-wrap');
  var b = document.getElementById('proof-submit-btn');
  var i = document.getElementById('proof-file-input');
  if(w) w.style.display = 'none';
  if(b) b.style.display = 'none';
  if(i) i.value = '';
  setProofStatus('','');
}

function setProofStatus(msg, type){
  var el = document.getElementById('proof-status');
  if(!el) return;
  if(!msg){ el.style.display='none'; return; }
  var colors = {
    loading:'background:rgba(26,86,219,0.08);border:1px solid rgba(26,86,219,0.2);color:#1a56db;',
    error:'background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#ef4444;',
    ok:'background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);color:#065f46;',
    warn:'background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);color:#92400e;'
  };
  el.style.cssText = (colors[type]||colors.loading)+'display:block;border-radius:8px;padding:10px;font-size:13px;font-weight:600;text-align:center;';
  el.textContent = msg;
}

async function submitProofOfPayment(){
  if(!_proofImageB64){ setProofStatus('Please upload a proof of payment image first.','error'); return; }
  var btn = document.getElementById('proof-submit-btn');
  if(btn){ btn.disabled=true; btn.textContent='📤 Submitting proof...'; }
  setProofStatus('📤 Registering your proof — please wait...','loading');
  try {
    var WU = typeof WORKER_URL !== 'undefined' ? WORKER_URL : 'https://smartacademy-ai.kasongokimba.workers.dev';
    var AS = typeof APP_SECRET !== 'undefined' ? APP_SECRET : 'sWN-UZpoi6PLUgCgZ7KiZi2iRPNUXq9f';
    // Get pending amount if available
    var slots = JSON.parse(localStorage.getItem('saa_ua_slots')||'[]');
    var pendingAmounts = slots.filter(function(s){return !s.code;}).map(function(s){return '$'+parseFloat(s.amount).toFixed(2)+' ('+s.plan+')';}).join(', ');
    var _ac = new AbortController();
    var _timeout = setTimeout(function(){ _ac.abort(); }, 10000);
    var res = await fetch(WU,{
      method:'POST', headers:{'Content-Type':'application/json'},
      signal: _ac.signal,
      body: JSON.stringify({
        _appSecret:AS,
        action:'email-proof',
        image:_proofImageB64,
        mime:_proofImageMime,
        pendingAmounts: pendingAmounts || 'Not specified',
        clientId: localStorage.getItem('saa_ua_client_id') || 'Unknown'
      })
    });
    clearTimeout(_timeout);
    var d = await res.json();
    if(d.ok){
      setProofStatus('✅ Proof sent to our team. Your code will arrive within 2 hours via this page or WhatsApp.','ok');
      if(btn) btn.style.display='none';
      // Show WhatsApp follow-up button
      var waBtn = document.createElement('button');
      waBtn.textContent = '💬 Follow up on WhatsApp';
      waBtn.style.cssText = 'width:100%;margin-top:8px;padding:10px;background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.4);border-radius:8px;color:#25d366;font-size:13px;font-weight:700;cursor:pointer;';
      var amounts = pendingAmounts || 'my payment';
      waBtn.onclick = function(){ window.open('https://wa.me/27761328664?text='+encodeURIComponent('Hi, I just sent proof of payment for '+amounts+'. Client ID: '+(localStorage.getItem('saa_ua_client_id')||'?')+'. Please confirm my access code.'),'_blank'); };
      var statusEl = document.getElementById('proof-status');
      if(statusEl && statusEl.parentElement) statusEl.parentElement.appendChild(waBtn);
    } else {
      // Fallback to old AI verify if email fails
      setProofStatus('⚠️ Could not forward automatically. Please WhatsApp your proof to +27761328664.','warn');
      if(btn){ btn.disabled=false; btn.textContent='🔄 Try Again'; }
    }
  } catch(e){
    setProofStatus('❌ Connection error. Please WhatsApp your proof to +27761328664.','error');
    if(btn){ btn.disabled=false; btn.textContent='🔄 Try Again'; }
  }
}

function copyProofCode(){
  var code = document.getElementById('proof-code-value').textContent;
  navigator.clipboard.writeText(code).then(function(){ if(typeof toast==='function') toast('Code copied!','ok'); });
}

// ── DRC: EARLY/INLINE TEXT SUBMISSION + POLLING + PROOF MODAL ────────
function drcEarlyTextInput(val){
  _drcEarlyText=val.trim();
  var prev=document.getElementById('drc-early-preview');
  var btn=document.getElementById('drc-early-submit');
  if(_drcEarlyText.length>5){
    if(prev){prev.style.display='block';prev.textContent='📝 '+_drcEarlyText.substring(0,60)+(_drcEarlyText.length>60?'...':'');}
    if(btn)btn.style.display='block';
  } else {
    if(prev)prev.style.display='none';
    if(btn)btn.style.display='none';
  }
}
async function drcEarlySubmit(){
  if(!_drcEarlyText)return;
  var btn=document.getElementById('drc-early-submit');
  var st=document.getElementById('drc-early-status');
  if(btn){btn.disabled=true;btn.textContent='Submitting...';}
  if(st){st.style.display='block';st.style.cssText='display:block;margin-top:6px;border-radius:8px;padding:10px;font-size:12px;font-weight:600;text-align:center;background:rgba(6,182,212,0.1);color:#06b6d4;';st.textContent='Reading your proof...';}
  var clientId=localStorage.getItem('saa_ua_client_id')||('drc_'+Date.now()+'_'+Math.random().toString(36).slice(2,8));
  localStorage.setItem('saa_ua_client_id',clientId);
  try{
    var res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'drc-submit-proof',smsText:_drcEarlyText,plan:_mobPlan||'W',clientId:clientId})});
    var d=await res.json();
    if(d.ok){
      if(st){st.style.background='rgba(16,185,129,0.1)';st.style.color='#10b981';st.textContent='✅ Received! Ref: '+(d.ref||'extracted')+'. Waiting for admin verification...';}
      if(btn)btn.style.display='none';
      localStorage.setItem('saa_drc_pending',JSON.stringify({clientId:clientId,plan:_mobPlan||'W',ref:d.ref,submittedAt:Date.now(),status:'waiting'}));
      drcInlinePoll(clientId);
    }else{
      if(st){st.style.background='rgba(239,68,68,0.1)';st.style.color='#ef4444';st.textContent=d.error||'Could not read proof. Try again.';}
      if(btn){btn.disabled=false;btn.textContent='⚡ Submit & Get My Code';}
    }
  }catch(e){
    if(st){st.style.background='rgba(239,68,68,0.1)';st.style.color='#ef4444';st.textContent='Connection error. Try again.';}
    if(btn){btn.disabled=false;btn.textContent='🔄 Try Again';}
  }
}

function drcInlineTextInput(val){
  _drcInlinePlan = _mobPlan || 'W';
  _drcInlineText = val.trim();
  var submit = document.getElementById('drc-inline-submit');
  var prev   = document.getElementById('drc-inline-preview');
  if(_drcInlineText.length > 5){
    if(prev){ prev.style.display='block'; prev.textContent='📝 '+_drcInlineText.substring(0,60)+(_drcInlineText.length>60?'...':''); }
    if(submit) submit.style.display='block';
    _drcInlineB64=null; _drcInlineMime=null;
  } else {
    if(prev) prev.style.display='none';
    if(!_drcInlineB64 && submit) submit.style.display='none';
  }
}

async function drcInlineSubmit(){
  if(!_drcInlineText || !_drcInlineText.trim()) { var st=document.getElementById('drc-inline-status'); if(st){st.style.display='block';st.style.cssText='display:block;margin-top:6px;border-radius:8px;padding:8px;font-size:12px;font-weight:600;text-align:center;background:rgba(239,68,68,0.1);color:#ef4444;';st.textContent='Please paste your payment SMS first.';} return; }
  var btn=document.getElementById('drc-inline-submit');
  var st=document.getElementById('drc-inline-status');
  if(btn){btn.disabled=true;btn.textContent='Submitting...';}
  if(st){st.style.display='block';st.style.cssText='display:block;margin-top:8px;border-radius:8px;padding:10px;font-size:12px;font-weight:600;text-align:center;background:rgba(6,182,212,0.1);color:#06b6d4;';st.textContent='Reading your proof...';}
  var clientId=localStorage.getItem('saa_ua_client_id')||('drc_'+Date.now()+'_'+Math.random().toString(36).slice(2,8));
  localStorage.setItem('saa_ua_client_id',clientId);
  var payload={_appSecret:APP_SECRET,action:'drc-submit-proof',plan:_drcInlinePlan||_mobPlan||'W',clientId:clientId,smsText:_drcInlineText};
  try{
    var res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    var d=await res.json();
    if(d.ok){
      if(st){
        st.style.background='rgba(16,185,129,0.1)';st.style.color='#10b981';
        var amtsStr = (d.allAmountsUSD&&d.allAmountsUSD.length) ? d.allAmountsUSD.map(function(a){return '$'+a.toFixed(2);}).join(', ') : 'none detected';
        st.textContent='✅ Proof received! Ref: '+(d.ref||'extracted')+' · Amount(s) found: '+amtsStr+'. Waiting for admin verification...';
      }
      if(btn)btn.style.display='none';
      localStorage.setItem('saa_drc_pending',JSON.stringify({clientId:clientId,plan:_drcInlinePlan,ref:d.ref,submittedAt:Date.now(),status:'waiting'}));
      drcInlinePoll(clientId);
    }else{
      if(st){st.style.background='rgba(239,68,68,0.1)';st.style.color='#ef4444';st.textContent=d.error||'Could not read proof. Try again.';}
      if(btn){btn.disabled=false;btn.textContent='⚡ Submit & Get My Code';}
    }
  }catch(e){
    if(st){st.style.background='rgba(239,68,68,0.1)';st.style.color='#ef4444';st.textContent='Connection error. Try again.';}
    if(btn){btn.disabled=false;btn.textContent='🔄 Try Again';}
  }
}

function drcInlinePoll(clientId){
  var pollTimer = setInterval(function(){
    fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'drc-check-status',clientId:clientId})
    }).then(function(r){return r.json();}).then(function(d){
      if(d.ok && d.status==='matched' && d.code){
        clearInterval(pollTimer);
        localStorage.removeItem('saa_drc_pending');
        // Always show overlay — works regardless of which page client is on
        showDrcCodeOverlay(d.code);
        // Also update inline status if panel is still open
        var st = document.getElementById('drc-inline-status');
        if(st){
          st.style.display='block';
          st.style.background='rgba(16,185,129,0.15)';
          st.style.color='#10b981';
          st.innerHTML='🎉 <b>Code ready! Check the popup.</b>';
        }
      }
    }).catch(function(){});
  }, 30000); // poll every 30s
  setTimeout(function(){ clearInterval(pollTimer); }, 48*3600000);
}

var _drcB64=null,_drcMime=null,_drcPlan=null,_drcClientId=null,_drcTimer=null;
function drcShowProofModal(plan){
  _drcPlan=plan;
  _drcClientId=localStorage.getItem('saa_ua_client_id')||('drc_'+Date.now()+'_'+Math.random().toString(36).slice(2,8));
  localStorage.setItem('saa_ua_client_id',_drcClientId);
  var cn=(localStorage.getItem('saa_drc_contact')||'27761328664').replace(/[^0-9]/g,'');
  var lk=document.getElementById('drc-modal-contact-link');if(lk)lk.href='https://wa.me/'+cn;
  document.getElementById('drc-proof-modal').style.display='block';
  document.body.style.overflow='hidden';
  var ex=null;try{ex=JSON.parse(localStorage.getItem('saa_drc_pending')||'null');}catch(e){}
  if(ex&&ex.clientId===_drcClientId&&ex.status==='waiting'){
    document.getElementById('drc-modal-drop').style.display='none';
    var st=document.getElementById('drc-modal-status');
    st.style.display='block';st.style.background='rgba(245,158,11,0.1)';st.style.color='#f59e0b';
    st.textContent='Proof already submitted — waiting for admin verification...';
    document.getElementById('drc-modal-countdown').style.display='block';
    drcCountdown(ex.submittedAt+48*3600000);drcPoll();
  }
}

function drcCloseModal(){document.getElementById('drc-proof-modal').style.display='none';document.body.style.overflow='';}

function drcModalFileSelected(file){
  if(!file)return;_drcMime=file.type;
  document.getElementById('drc-modal-fname').textContent=file.name;
  document.getElementById('drc-modal-preview').style.display='block';
  document.getElementById('drc-modal-status').style.display='none';
  var r=new FileReader();
  r.onload=function(e){_drcB64=e.target.result.split(',')[1];document.getElementById('drc-modal-submit').style.display='block';};
  r.readAsDataURL(file);
}
function drcModalClearFile(){
  _drcB64=null;_drcMime=null;
  document.getElementById('drc-modal-preview').style.display='none';
  document.getElementById('drc-modal-submit').style.display='none';
  document.getElementById('drc-modal-status').style.display='none';
  document.getElementById('drc-modal-file').value='';
}
async function drcModalSubmit(){
  if(!_drcB64)return;
  var btn=document.getElementById('drc-modal-submit'),st=document.getElementById('drc-modal-status');
  btn.textContent='Reading proof...';btn.disabled=true;
  st.style.display='block';st.style.background='rgba(6,182,212,0.1)';st.style.color='#06b6d4';st.textContent='AI reading your payment proof...';
  try{
    var res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'drc-submit-proof',fileData:_drcB64,mimeType:_drcMime,plan:_drcPlan,clientId:_drcClientId})});
    var d=await res.json();
    if(d.ok){
      st.style.background='rgba(16,185,129,0.1)';st.style.color='#10b981';
      var amtsStr2 = (d.allAmountsUSD&&d.allAmountsUSD.length) ? d.allAmountsUSD.map(function(a){return '$'+a.toFixed(2);}).join(', ') : 'none detected';
      st.textContent='Proof received! Ref: '+(d.ref||'extracted')+' · Amount(s) found: '+amtsStr2+'. Waiting for admin verification...';
      document.getElementById('drc-modal-drop').style.display='none';
      document.getElementById('drc-modal-preview').style.display='none';
      document.getElementById('drc-modal-submit').style.display='none';
      document.getElementById('drc-modal-countdown').style.display='block';
      drcCountdown(Date.now()+48*3600000);
      localStorage.setItem('saa_drc_pending',JSON.stringify({clientId:_drcClientId,plan:_drcPlan,ref:d.ref,submittedAt:Date.now(),status:'waiting'}));
      drcPoll();
    }else{
      st.style.background='rgba(239,68,68,0.1)';st.style.color='#ef4444';
      st.textContent=(d.error||'Could not read proof. Try a clearer image.');
      btn.textContent='Submit Proof';btn.disabled=false;
    }
  }catch(e){
    st.style.background='rgba(239,68,68,0.1)';st.style.color='#ef4444';st.textContent='Network error. Try again.';
    btn.textContent='Submit Proof';btn.disabled=false;
  }
}
function drcCountdown(deadline){
  var el=document.getElementById('drc-modal-countdown'),to=document.getElementById('drc-modal-timeout');
  function tick(){
    var left=Math.max(0,deadline-Date.now());
    var h=Math.floor(left/3600000),m=Math.floor((left%3600000)/60000),s=Math.floor((left%60000)/1000);
    if(el)el.textContent='Code expected within: '+h+'h '+m+'m '+s+'s';
    if(left<=0){if(el)el.style.display='none';if(to)to.style.display='block';}else{setTimeout(tick,1000);}
  }
  tick();
}

function drcPoll(){
  if(_drcTimer)clearInterval(_drcTimer);
  _drcTimer=setInterval(async function(){
    try{
      var res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({_appSecret:APP_SECRET,action:'drc-check-status',clientId:_drcClientId})});
      var d=await res.json();
      if(d.ok&&d.status==='matched'&&d.code){
        clearInterval(_drcTimer);
        document.getElementById('drc-modal-countdown').style.display='none';
        document.getElementById('drc-modal-code-box').style.display='block';
        document.getElementById('drc-modal-code-val').textContent=d.code;
        try{
          var sv=JSON.parse(localStorage.getItem('saa_saved_codes')||'[]');
          sv.push({code:d.code,plan:({W:'1 Week',M:'1 Month',Y:'1 Year'})[d.plan]||d.plan,savedAt:Date.now(),origin:'DRC'});
          localStorage.setItem('saa_saved_codes',JSON.stringify(sv));
        }catch(ex){}
        localStorage.removeItem('saa_drc_pending');
        if(typeof toast==='function')toast('Your DRC code is ready!','ok');
      }
    }catch(ex){}
  },30000);
  setTimeout(function(){clearInterval(_drcTimer);},48*3600000);
}
function drcModalCopyCode(){
  var code=document.getElementById('drc-modal-code-val').textContent;
  navigator.clipboard.writeText(code).then(function(){if(typeof toast==='function')toast('Code copied!','ok');});
}

// ── ADMIN: DRC PAYMENT MATCHING & FX RATES ────────────────────────────
async function adminSaveFxRates(){
  var adminKey=localStorage.getItem('saa_admin_key')||'';
  var zar=parseFloat(document.getElementById('fx-zar').value)||16.5;
  var cdf=parseFloat(document.getElementById('fx-cdf').value)||2800;
  var statusEl=document.getElementById('fx-status');
  try{
    var res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'save-fx-rates',adminKey,zar,cdf})});
    var data=await res.json();
    if(data.ok){
      localStorage.setItem('saa_fx_zar',zar);
      localStorage.setItem('saa_fx_cdf',cdf);
      _pfZarRate = zar; // update PayFast rate immediately
      statusEl.textContent='✅ Rates saved: $1 = R'+zar+' / FC'+cdf;
      statusEl.style.display='block';
      setTimeout(function(){statusEl.style.display='none';},3000);
    }
  }catch(e){ statusEl.textContent='Error: '+e.message; statusEl.style.display='block'; }
}

async function adminLoadFxRates(){
  try{
    var res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'get-fx-rates'})});
    var data=await res.json();
    if(data.ok){
      if(data.zar){ document.getElementById('fx-zar').value=data.zar; localStorage.setItem('saa_fx_zar',data.zar); }
      if(data.cdf){ document.getElementById('fx-cdf').value=data.cdf; localStorage.setItem('saa_fx_cdf',data.cdf); }
    }
  }catch(e){}
}

function adminSaveDrcNumber(){
  var n=document.getElementById('drc-wa-number').value.trim();
  if(!n)return;
  localStorage.setItem('saa_drc_contact',n);
  if(typeof toast==='function')toast('Contact number saved','ok');
}
var _adDrcB64=null,_adDrcMime=null;
function adminDrcFileSelected(file){
  if(!file)return;_adDrcMime=file.type;
  document.getElementById('admin-drc-fname').textContent=file.name;
  document.getElementById('admin-drc-preview').style.display='block';
  document.getElementById('admin-drc-status').style.display='none';
  document.getElementById('admin-drc-submit').style.display='none';
  var r=new FileReader();
  r.onload=function(e){_adDrcB64=e.target.result.split(',')[1];document.getElementById('admin-drc-submit').style.display='block';};
  r.readAsDataURL(file);
}
function adminDrcClearFile(){
  _adDrcB64=null;_adDrcMime=null;
  document.getElementById('admin-drc-preview').style.display='none';
  document.getElementById('admin-drc-submit').style.display='none';
  document.getElementById('admin-drc-status').style.display='none';
  document.getElementById('admin-drc-file').value='';
}
async function adminDrcSubmit(){
  if(!_adDrcB64){if(typeof toast==='function')toast('Upload a file first','err');return;}
  var btn=document.getElementById('admin-drc-submit'),st=document.getElementById('admin-drc-status');
  btn.textContent='Processing...';btn.disabled=true;
  st.style.display='block';st.style.background='rgba(245,158,11,0.1)';st.style.color='#f59e0b';st.textContent='GPT reading SMS confirmation...';
  try{
    var res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'drc-admin-match',adminKey:localStorage.getItem('saa_admin_key')||'',fileData:_adDrcB64,mimeType:_adDrcMime})});
    var d=await res.json();
    if(d.ok&&d.matched){
      st.style.background='rgba(16,185,129,0.15)';st.style.color='#10b981';
      st.innerHTML='Match found!<br><b style="font-size:18px;letter-spacing:2px;">'+d.code+'</b><br><span style="font-size:11px;opacity:0.7;">Ref: '+d.ref+'</span>';
      adminDrcClearFile();setTimeout(adminLoadDrcPending,1000);
    }else{
      st.style.background='rgba(239,68,68,0.1)';st.style.color='#ef4444';
      st.textContent='No match. Ref: '+(d.ref||'none')+'. Check client submitted proof first.';
    }
  }catch(e){
    st.style.background='rgba(239,68,68,0.1)';st.style.color='#ef4444';st.textContent='Error: '+e.message;
  }
  btn.textContent='Match & Generate Code';btn.disabled=false;
}
async function adminLoadDrcPending(){
  var list=document.getElementById('admin-drc-pending-list');if(!list)return;
  list.innerHTML='<div style="text-align:center;color:rgba(255,255,255,0.3);font-size:12px;padding:16px;">Loading...</div>';
  try{
    var res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'drc-list-pending',adminKey:localStorage.getItem('saa_admin_key')||''})});
    var d=await res.json();
    if(!d.ok||!d.pending||!d.pending.length){
      list.innerHTML='<div style="text-align:center;color:rgba(255,255,255,0.3);font-size:12px;padding:16px;">No pending proofs</div>';return;
    }
    list.innerHTML=d.pending.map(function(p){
      var age=Math.floor((Date.now()-p.submittedAt)/3600000),left=Math.max(0,48-age);
      var col=age>24?'#ef4444':age>12?'#f59e0b':'#10b981';
      return '<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;">'
        +'<div><div style="font-size:12px;font-weight:700;color:#fff;">'+(p.plan==='W'?'1 Week':p.plan==='M'?'1 Month':'1 Year')+'</div>'
        +'<div style="font-size:11px;color:rgba(255,255,255,0.4);">Ref: '+(p.ref||'—')+'</div>'
        +'<div style="font-size:11px;color:rgba(255,255,255,0.4);">'+new Date(p.submittedAt).toLocaleString()+'</div></div>'
        +'<div style="text-align:right;"><div style="font-size:11px;font-weight:700;color:'+col+';">'+age+'h ago</div>'
        +'<div style="font-size:10px;color:rgba(255,255,255,0.3);">'+left+'h left</div></div></div>';
    }).join('');
  }catch(e){list.innerHTML='<div style="color:#ef4444;font-size:12px;padding:10px;">Error: '+e.message+'</div>';}
}
