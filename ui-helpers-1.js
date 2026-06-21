// ════════════════════════════════════════════════════════════════
// core/ui-helpers.js
// Shared UI helpers used by both Quiz and Tutor features (chat
// bubbles, toasts, markdown rendering, text-to-speech, language
// codes for speech synthesis).
// Extracted from index.html (split, June 2026). Logic unchanged.
//
// NOTE: _tutorMsgTexts was previously declared inside the tutor
// chat code, but is read/written here in addAI/speakTutorMsg, which
// are both called from quiz code too. Promoted to live here, next
// to the functions that actually use it. Behavior unchanged — still
// the same single shared object, just declared in the right place.
//
// LOAD ORDER: must load BEFORE quiz.js and tutor.js (both call
// addAI/toast), and AFTER math-utils.js (addAI calls fixMath).
// ════════════════════════════════════════════════════════════════

// Stores plain-text versions of rendered chat messages, keyed by
// message DOM id, so the "Listen" button can speak them later.
var _tutorMsgTexts = {};

// ── LANGUAGE CODE MAPPING (for speech synthesis) ─────────────────
function getLangBCP47(code){
  var map = {
    // Short codes
    en:'en-US', fr:'fr-FR', pt:'pt-PT', sw:'sw-KE', ha:'ha-NE',
    yo:'yo-NG', ig:'ig-NG', zu:'zu-ZA', af:'af-ZA', hi:'hi-IN',
    zh:'zh-CN', ru:'ru-RU', de:'de-DE', it:'it-IT', id:'id-ID',
    tr:'tr-TR', bn:'bn-BD', tl:'tl-PH', ar:'ar-SA',
    // Full names (from S.lang profile selection)
    'english':'en-US', 'french':'fr-FR', 'portuguese':'pt-PT',
    'swahili':'sw-KE', 'hausa':'ha-NE', 'yoruba':'yo-NG',
    'igbo':'ig-NG', 'zulu':'zu-ZA', 'afrikaans':'af-ZA',
    'hindi':'hi-IN', 'chinese':'zh-CN', 'russian':'ru-RU',
    'german':'de-DE', 'italian':'it-IT', 'indonesian':'id-ID',
    'turkish':'tr-TR', 'bengali':'bn-BD', 'tagalog':'tl-PH',
    'arabic':'ar-SA'
  };
  var key = (code||'').toLowerCase().trim();
  return map[key] || 'en-US';
}

// ── CHAT BUBBLE RENDERER (used by tutor chat AND quiz feedback) ──
function addAI(md){
  // Apply math symbol fixes before rendering
  if(typeof fixMath === 'function') md = fixMath(md);
  const box=document.getElementById('chat-box');
  const d=document.createElement('div');
  d.className='msg ai';
  var msgId = 'tmsg-' + Date.now();
  var plainText = md.replace(/\*\*/g,'').replace(/#+\s*/g,'').replace(/```[\s\S]*?```/g,'').replace(/\*/g,'').replace(/\n+/g,' ').trim();
  _tutorMsgTexts[msgId] = plainText;
  d.innerHTML='<div class="msg-av">🤖</div>'
    +'<div style="flex:1;">'
    +'<div class="msg-bub" id="'+msgId+'">'+md2html(md)+'</div>'
    +'<button onclick="speakTutorMsg(this,\''+msgId+'\')" id="btn-'+msgId+'" '
    +'style="margin-top:10px;width:100%;background:#06b6d4;border:none;border-radius:12px;'
    +'color:#0a1628;font-size:14px;font-weight:800;padding:10px 0;cursor:pointer;'
    +'font-family:\'DM Sans\',sans-serif;display:block;text-align:center;">'
    +'🔊 Listen</button>'
    +'</div>';
  box.appendChild(d);
  box.scrollTop=box.scrollHeight;
  // Render LaTeX fractions with MathJax
  if(window.MathJax&&MathJax.typesetPromise) MathJax.typesetPromise([d]).catch(function(){});

  // Auto-speak if enabled and audio already unlocked by user tap
  if(window._tutorAutoSpeak && window._audioUnlocked){
    setTimeout(function(){
      var btn = document.getElementById('btn-'+msgId);
      if(btn) speakTutorMsg(btn, msgId);
    }, 300);
  }
}

// ── TEXT-TO-SPEECH FOR CHAT MESSAGES ─────────────────────────────
function speakTutorMsg(btn, msgId){
  if(!window.speechSynthesis){
    toast('🔊 Text-to-speech not supported on this browser','warn');
    return;
  }
  if(window._tutorSpeakingId === msgId){
    window.speechSynthesis.cancel();
    window._tutorSpeakingId = null;
    if(btn){ btn.textContent = '🔊 Listen'; btn.style.color = '#06b6d4'; }
    return;
  }
  window.speechSynthesis.cancel();
  document.querySelectorAll('[id^="btn-tmsg-"]').forEach(function(b){
    b.textContent = '🔊 Listen'; b.style.color = '#06b6d4';
  });
  var text = _tutorMsgTexts[msgId];
  if(!text) return;
  // Strip emojis and markdown before speaking
  text = text
    .replace(/[\u{1F300}-\u{1FFFF}]/gu,'')
    .replace(/[\u2600-\u27BF]/g,'')
    .replace(/[✅❌📐📖🔊🎤🏆📌💪⭐🧑👤🤖📄⬇️🎓🔒🔓]/g,'')
    .replace(/\*\*/g,'').replace(/\*/g,'').replace(/\s+/g,' ').trim();
  if(!text) return;
  var u = new SpeechSynthesisUtterance(text);
  u.lang = getLangBCP47(typeof saLang !== 'undefined' ? saLang : 'en');
  u.rate = 0.85; u.pitch = 1.0; u.volume = 1.0;
  window._tutorSpeakingId = msgId;
  if(btn){ btn.textContent = '⏹ Stop'; btn.style.color = '#ef4444'; }
  u.onend = u.onerror = function(){
    window._tutorSpeakingId = null;
    if(btn){ btn.textContent = '🔊 Listen'; btn.style.color = '#06b6d4'; }
  };
  window.speechSynthesis.speak(u);
}

// ── LIGHTWEIGHT MARKDOWN → HTML RENDERER ─────────────────────────
function md2html(t){
  return t.replace(/^### (.+)$/gm,'<div style="font-size:13px;font-weight:800;color:#f59e0b;margin:10px 0 4px;">$1</div>')
          .replace(/^## (.+)$/gm,'<div style="font-size:14px;font-weight:800;color:#06b6d4;margin:12px 0 6px;">$1</div>')
          .replace(/^# (.+)$/gm,'<div style="font-size:15px;font-weight:800;color:#fff;margin:12px 0 6px;">$1</div>')
          .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
          .replace(/\*(.+?)\*/g,'<em>$1</em>')
          .replace(/_(.+?)_/g,'<em>$1</em>')
          .replace(/(^|\n)[•\-\*]\s+/g,'$1')
          .replace(/\n/g,'<br>');
}

// ── TOAST NOTIFICATIONS ───────────────────────────────────────────
function toast(msg,type='',duration=3000){
  const el=document.getElementById('toast');
  el.textContent=msg;el.className=`show ${type}`;
  clearTimeout(window._tt);
  window._tt=setTimeout(()=>el.className='',duration);
}
