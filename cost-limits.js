// ════════════════════════════════════════════════════════════════
// core/cost-limits.js
// Per-access-code spending/usage cost tracking and limit
// enforcement. Used by quiz, tutor, study, and research-mode to
// check whether a code has hit its spending cap before allowing
// further AI usage.
// Extracted from index.html (split, June 2026). Logic unchanged.
//
// DEPENDENCIES: none beyond browser localStorage. Pure utility file.
//
// USED BY: quiz.js, tutor.js, research-mode.js, and admin-panel.js
// (admin sets per-code limit overrides via adminSetCodeLimit, which
// writes to the same 'saa_limit_<code>' localStorage keys this file
// reads from).
// ════════════════════════════════════════════════════════════════

// ── PRICE MAP (base USD price per code-type prefix) ──────────────

var CODE_PRICE_MAP = {
  W: 5,    // Weekly individual
  M: 10,   // Monthly individual
  WC: 110, WG: 110,
  MC: 220, MG: 220,
  RM: 20,  // Research Monthly
};


// ── COST TRACKING & LIMIT ENFORCEMENT ─────────────────────────────
function saaCodePrice(code){
  // Classroom codes end in C or G AND are stored with type containing 'Classroom'
  // Check localStorage to confirm if it's actually a classroom code
  var codes = JSON.parse(localStorage.getItem('saa_codes')||'[]');
  var stored = codes.find(function(c){ return c.code === code; });
  var isClassroom = stored && stored.type && stored.type.indexOf('Classroom') > -1;
  
  var prefix = (code||'').split('-')[0] || '';
  if(isClassroom){
    var key = prefix + 'C';
    return CODE_PRICE_MAP[key] || CODE_PRICE_MAP[prefix] || 5;
  }
  // Check admin-saved research prices from localStorage first
  var adminPrices = JSON.parse(localStorage.getItem('saa_research_prices')||'{}');
  if(prefix === 'RM' && adminPrices.rm) return parseFloat(adminPrices.rm);
  if(prefix === 'RS' && adminPrices.rs) return parseFloat(adminPrices.rs);
  if(prefix === 'RY' && adminPrices.ry) return parseFloat(adminPrices.ry);
  return CODE_PRICE_MAP[prefix] || 5;
}

function saaCodeLimit(code){
  // Admin can override limit per code via saa_limit_<code>
  var override = parseFloat(localStorage.getItem('saa_limit_'+code)||'0');
  if(override > 0) return override;
  // Default: price + 10%
  var price = saaCodePrice(code);
  return price * 1.10;
}

function saaCheckCostLimit(code){
  var costData = saaGetCost(code);
  if(!costData) return false;
  var limit = saaCodeLimit(code);
  return costData.cost >= limit;
}

function saaGetLockMessage(){
  var lang = (typeof saLang !== 'undefined') ? saLang : 'en';
  var msgs = {
    en: '📚 You have reached your usage limit for this code.\n\nYour learning data is saved. Please purchase a new code to continue studying.\n\n👉 www.smartacademy-ai.com',
    fr: '📚 Vous avez atteint la limite d\'utilisation de ce code.\n\nVos données d\'apprentissage sont sauvegardées. Veuillez acheter un nouveau code pour continuer.\n\n👉 www.smartacademy-ai.com',
    pt: '📚 Atingiu o limite de utilização deste código.\n\nOs seus dados estão guardados. Compre um novo código para continuar.\n\n👉 www.smartacademy-ai.com',
    sw: '📚 Umefika kikomo cha matumizi ya nambari hii.\n\nData yako imehifadhiwa. Tafadhali nunua nambari mpya ili kuendelea kusoma.\n\n👉 www.smartacademy-ai.com',
    ha: '📚 Kun kai iyakar amfani da wannan lambar.\n\nAnyi ajiye bayananku. Da fatan za a sayi sabon lambar don ci gaba.\n\n👉 www.smartacademy-ai.com',
    yo: '📚 O ti de ìdíwọ̀n lílo kóòdù yìí.\n\nÀwọn ìkọ̀wé rẹ ni a ti pamọ́. Jọ̀wọ́ ra kóòdù tuntun láti tẹ̀síwájú.\n\n👉 www.smartacademy-ai.com',
    ig: '📚 Ị eruo oke ojiji nke koodu a.\n\nEzigara data gị. Biko zụọ koodu ọhụrụ iji nọgide mụọ.\n\n👉 www.smartacademy-ai.com',
    zu: '📚 Ufinyelele umkhawulo wokusetshenziswa kwaleli khodi.\n\nIdatha yakho ilondoloziwe. Sicela uthenga ikhodi entsha ukuze uqhubeke.\n\n👉 www.smartacademy-ai.com',
    af: '📚 Jy het die gebruikslimiet vir hierdie kode bereik.\n\nJou data is gestoor. Koop asseblief \'n nuwe kode om voort te gaan.\n\n👉 www.smartacademy-ai.com',
    hi: '📚 आपने इस कोड की उपयोग सीमा पार कर ली है।\n\nआपका डेटा सुरक्षित है। जारी रखने के लिए नया कोड खरीदें।\n\n👉 www.smartacademy-ai.com',
    zh: '📚 您已达到此代码的使用限制。\n\n您的学习数据已保存。请购买新代码继续学习。\n\n👉 www.smartacademy-ai.com',
    ar: '📚 لقد وصلت إلى حد الاستخدام لهذا الرمز.\n\nتم حفظ بياناتك. يرجى شراء رمز جديد للمتابعة.\n\n👉 www.smartacademy-ai.com',
    ru: '📚 Вы достигли лимита использования этого кода.\n\nВаши данные сохранены. Купите новый код для продолжения.\n\n👉 www.smartacademy-ai.com',
    de: '📚 Sie haben das Nutzungslimit für diesen Code erreicht.\n\nIhre Daten sind gespeichert. Bitte kaufen Sie einen neuen Code.\n\n👉 www.smartacademy-ai.com',
    id: '📚 Anda telah mencapai batas penggunaan kode ini.\n\nData Anda tersimpan. Beli kode baru untuk melanjutkan.\n\n👉 www.smartacademy-ai.com',
  };
  return msgs[lang] || msgs.en;
}

function saaTrackCost(code, usage, type){
  if(!code || !usage) return;
  // Store locally
  var key = 'saa_cost_' + code;
  var d;
  try{ d = JSON.parse(localStorage.getItem(key)||'null'); }catch(e){ d=null; }
  if(!d) d = {code:code, inputTokens:0, outputTokens:0, calls:0};
  d.inputTokens  += (usage.prompt_tokens     || 0);
  d.outputTokens += (usage.completion_tokens || 0);
  d.calls        += 1;
  d.lastCall      = Date.now();
  d.lastType      = type;
  localStorage.setItem(key, JSON.stringify(d));

  // Update admin total cost display immediately if panel is open
  if(typeof adminLoggedIn !== 'undefined' && adminLoggedIn){
    var totalEl = document.getElementById('admin-total-cost');
    if(totalEl && typeof saaTotalCost === 'function')
      totalEl.textContent = '$' + ((typeof saaTotalCost === 'function') ? (typeof saaTotalCost==='function'?saaTotalCost():0) : 0).toFixed(4);
  }

  // Send to Worker and check limit server-side
  fetch('https://smartacademy-ai.kasongokimba.workers.dev', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({_appSecret:APP_SECRET,action:'track-cost', code:code, usage:usage, type:type})
  }).then(function(r){ return r.json(); })
  .then(function(data){
    if(data.limitReached){
      // Update local cost with server value for accuracy
      if(data.cost !== undefined){
        var d2; try{ d2=JSON.parse(localStorage.getItem('saa_cost_'+code)||'null'); }catch(e){ d2=null; }
        if(d2){ d2.serverCost = data.cost; localStorage.setItem('saa_cost_'+code, JSON.stringify(d2)); }
      }
      saaShowLimitReached(code);
    }
  }).catch(function(){
    // Fallback: local limit check if Worker unreachable
    if(saaCheckCostLimit(code)) saaShowLimitReached(code);
  });
}

function saaShowLimitReached(code){
  // Don't show if already shown this session
  if(window._saaLimitShown) return;
  window._saaLimitShown = true;

  var msg = saaGetLockMessage();
  var price = saaCodePrice(code);
  var limit = saaCodeLimit(code).toFixed(2);

  // Show blocking overlay
  var overlay = document.createElement('div');
  overlay.id = 'saa-limit-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:999998;background:rgba(8,15,30,0.96);display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = '<div style="background:#111827;border:1px solid rgba(239,68,68,0.3);border-radius:20px;padding:32px;max-width:420px;width:100%;text-align:center;">'
    + '<div style="font-size:48px;margin-bottom:16px;">🔒</div>'
    + '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:12px;">Usage Limit Reached</div>'
    + '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:12px;margin-bottom:16px;">'
    + '<div style="font-size:12px;color:rgba(255,255,255,0.5);">Code: <span style="color:#06b6d4;font-weight:700;">'+code+'</span> · Limit: <span style="color:#ef4444;font-weight:700;">$'+limit+'</span></div>'
    + '</div>'
    + '<div style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.7;white-space:pre-line;margin-bottom:24px;">'+msg+'</div>'
    + '<a href="https://www.smartacademy-ai.com/#pricing" onclick="document.getElementById(\'saa-limit-overlay\').remove();showPage(\'page-pricing\');return false;" '
    + 'style="display:block;background:linear-gradient(135deg,#1a56db,#06b6d4);color:#fff;border-radius:12px;padding:14px;font-size:15px;font-weight:800;text-decoration:none;margin-bottom:10px;cursor:pointer;">'
    + '🚀 Get New Code</a>'
    + '<button onclick="document.getElementById(\'saa-limit-overlay\').remove();showPage(\'page-landing\');" '
    + 'style="background:transparent;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);border-radius:10px;padding:10px;width:100%;font-size:13px;cursor:pointer;font-family:\'DM Sans\',sans-serif;">'
    + 'Back to Home</button>'
    + '</div>';
  document.body.appendChild(overlay);

  // Also block quiz input
  S.quizActive = false;
  var ui = document.getElementById('question-ui');
  if(ui) ui.style.pointerEvents = 'none';
}

function saaGetCost(code){
  try{
    var d = JSON.parse(localStorage.getItem('saa_cost_'+code)||'null');
    if(!d) return null;
    var cost = (d.inputTokens * COST_IN) + (d.outputTokens * COST_OUT);
    return {cost:cost, calls:d.calls, inputTokens:d.inputTokens, outputTokens:d.outputTokens};
  }catch(e){ return null; }
}

function saaTotalCost(){
  var codes = JSON.parse(localStorage.getItem('saa_codes')||'[]');
  return codes.reduce(function(sum, c){
    var d = saaGetCost(c.code);
    return sum + (d ? d.cost : 0);
  }, 0);
}
