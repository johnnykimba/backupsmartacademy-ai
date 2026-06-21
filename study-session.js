// ════════════════════════════════════════════════════════════════
// features/study-session.js
// Quiz results & scoring display, celebration effects (confetti +
// sound), study-session start/exit, text-to-speech for study mode,
// PDF/Word report generation, retry/restart flows, and offline-mode
// session saving/loading.
// Extracted from index.html (split, June 2026). Logic unchanged.
//
// DEPENDENCIES (must load before this file):
//   - core/session-state.js (S)
//   - core/ui-helpers.js    (toast, addAI)
//   - core/translations.js  (saT, getLangBCP47)
//   - features/navigation.js (showPage)
//   - features/quiz.js      (presentQ, initQuiz — called by retry/
//     restart functions)
// ════════════════════════════════════════════════════════════════

// ── CELEBRATION EFFECTS (confetti + sound on high scores) ────────────
function isCelebrationOn(){
  return localStorage.getItem('saa_celebration') !== 'off';
}

function setCelebration(on){
  localStorage.setItem('saa_celebration', on ? 'on' : 'off');
  var btn = document.getElementById('celeb-toggle-btn');
  if(btn){
    btn.textContent = on ? '🎉 Celebrations: ON' : '🎊 Celebrations: OFF';
    btn.style.opacity = on ? '1' : '0.5';
  }
  toast(on ? '🎉 Celebrations turned ON' : '🎊 Celebrations turned OFF', 'ok');
}

function launchConfetti(){
  var colors = ['#ffd700','#ff6b35','#06b6d4','#10b981','#a78bfa','#f472b6','#fff'];
  var count = 60;
  for(var i=0; i<count; i++){
    (function(i){
      setTimeout(function(){
        var el = document.createElement('div');
        el.className = 'confetti-piece';
        el.style.left = Math.random()*100 + 'vw';
        el.style.top = '-10px';
        el.style.background = colors[Math.floor(Math.random()*colors.length)];
        el.style.width = (8 + Math.random()*8) + 'px';
        el.style.height = (8 + Math.random()*8) + 'px';
        el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        var dur = (2 + Math.random()*2).toFixed(1);
        el.style.animationDuration = dur + 's';
        el.style.animationDelay = '0s';
        document.body.appendChild(el);
        setTimeout(function(){ el.remove(); }, parseFloat(dur)*1000 + 100);
      }, i * 40);
    })(i);
  }
}

function playCelebrationSound(){
  try{
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Play a happy ascending melody: C E G C (fanfare)
    var notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach(function(freq, i){
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      var start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.4, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.start(start);
      osc.stop(start + 0.35);
    });
    // Add a little sparkle trill at the end
    [1047, 1319, 1568].forEach(function(freq, i){
      var osc2 = ctx.createOscillator();
      var gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'triangle';
      osc2.frequency.value = freq;
      var start2 = ctx.currentTime + 0.72 + i * 0.1;
      gain2.gain.setValueAtTime(0, start2);
      gain2.gain.linearRampToValueAtTime(0.25, start2 + 0.03);
      gain2.gain.exponentialRampToValueAtTime(0.001, start2 + 0.2);
      osc2.start(start2);
      osc2.stop(start2 + 0.2);
    });
  }catch(e){} // silent fail if audio not supported
}

function showCelebration(pct, name){
  if(!isCelebrationOn()) return;
  if(pct < 80) return;

  launchConfetti();
  playCelebrationSound();

  // Pick dancer based on score
  var dancer, title, msg;
  if(pct >= 100){
    dancer = '🏆'; title = 'PERFECT SCORE!'; msg = 'Absolutely flawless, ' + (name||'Champion') + '!';
  } else if(pct >= 95){
    dancer = '🎓'; title = 'OUTSTANDING!'; msg = name + ', you are a STAR! ' + pct + '%!';
  } else if(pct >= 90){
    dancer = '🥳'; title = 'EXCELLENT!'; msg = 'Amazing work, ' + name + '! ' + pct + '%!';
  } else {
    dancer = '🌟'; title = 'WELL DONE!'; msg = 'Great job, ' + name + '! ' + pct + '%!';
  }

  var ov = document.createElement('div');
  ov.id = 'celeb-overlay';
  ov.className = 'celeb-overlay';
  ov.innerHTML =
    '<div class="celeb-card">' +
      '<span class="celeb-dancer">' + dancer + '</span>' +
      '<div class="celeb-title">' + title + '</div>' +
      '<div class="celeb-score">' + msg + '</div>' +
      '<div class="celeb-stars">' +
        '<span>⭐</span><span>⭐</span><span>⭐</span>' +
      '</div>' +
      '<button class="celeb-btn" onclick="document.getElementById(&quot;celeb-overlay&quot;).remove()">🎊 Continue</button>' +
    '</div>';

  document.body.appendChild(ov);

  // Auto-dismiss after 5 seconds
  setTimeout(function(){
    var o = document.getElementById('celeb-overlay');
    if(o) o.style.transition='opacity 0.5s'; if(o) o.style.opacity='0';
    setTimeout(function(){ var o2=document.getElementById('celeb-overlay'); if(o2) o2.remove(); }, 500);
  }, 5000);
}

// ── QUIZ RESULTS DISPLAY ───────────────────────────────────────────────
function buildResults(c,t,p){
  if(!t || isNaN(p)){ p=0; }
  // Update celebration toggle button state
  setTimeout(function(){
    var btn = document.getElementById('celeb-toggle-btn');
    if(btn){
      var on = isCelebrationOn();
      btn.textContent = on ? '🎉 Celebrations: ON' : '🎊 Celebrations: OFF';
      btn.style.opacity = on ? '1' : '0.5';
    }
  }, 100);
  // PWA install prompt after first quiz
  if(window._saaShowInstallAfterQuiz && window._pwaPrompt && !localStorage.getItem('pwa_dismissed')){
    setTimeout(function(){
      if(typeof _pwaTranslate === 'function') _pwaTranslate();
      var bar = document.getElementById('pwa-install-bar');
      if(bar) bar.style.display = 'flex';
    }, 2000);
    window._saaShowInstallAfterQuiz = false;
  }
  const ring=document.getElementById('score-ring');
  ring.style.setProperty('--pct',`${p*3.6}deg`);
  document.getElementById('res-score').textContent=`${c}/${t}`;
  document.getElementById('res-pct').textContent=`${p}%`;
  const g=getGrade(p);
  const pill=document.getElementById('grade-pill');
  pill.textContent=g.label;pill.className=`grade-pill ${g.cls}`;
  document.getElementById('res-feedback').textContent=getFeedback(p);
  const wrong=S.answers.filter(a=>!a.correct).length;
  document.getElementById('bc-correct').textContent=c;
  document.getElementById('bc-wrong').textContent=wrong;
  document.getElementById('bc-streak').textContent=S.maxStreak;

  // Show timer info if timer was active
  var timerEl = document.getElementById('bc-timer');
  if(timerEl){
    if(_timerEnabled){
      var used = (_timerMinutes * 60) - _quizTimerSeconds;
      var usedM = Math.floor(Math.max(0,used)/60);
      var usedS = Math.max(0,used)%60;
      document.getElementById('bc-timer-row').style.display = 'flex';
      timerEl.textContent = usedM+'m '+(usedS<10?'0':'')+usedS+'s / '+_timerMinutes+'m';
    } else {
      document.getElementById('bc-timer-row').style.display = 'none';
    }
  }

  const conf=S.answers.filter(a=>a.correct&&a.conf==='SURE');
  const guessed=S.answers.filter(a=>a.correct&&a.conf==='GUESS');
  const inc=S.answers.filter(a=>!a.correct);
  const hints=S.answers.filter(a=>a.hint);

  // ── STREAK BADGE ─────────────────────────────
  renderStreakBadge('streak-badge-results');

  // ── QUIZ SUMMARY — question count + sample ────
  var summaryEl = document.getElementById('results-quiz-summary');
  if(summaryEl){
    var mode = S.diffMode==='hard' ? '🔥 Hard Mode' : S.diffMode==='easy' ? '🌱 Easy Mode' : '📄 From Document';
    var lang = S.lang || 'English';
    var subj = S.subject || 'General';
    // Pick first question — text is in S.questions not S.answers
    var sampleQ = {text: S._sampleQuestion || ''};
    var rIdx = 0;

    var html = '<div style="background:#0f2044;border:1px solid rgba(6,182,212,0.25);border-radius:12px;padding:14px;margin-bottom:12px;">';
    html += '<div style="font-size:11px;font-weight:800;color:#06b6d4;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">📋 Quiz Report</div>';

    // Session details
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">';
    html += '<div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:8px;text-align:center;">'
      + '<div style="font-size:18px;font-weight:900;color:#fff;">' + t + '</div>'
      + '<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;">Questions</div></div>';
    html += '<div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:8px;text-align:center;">'
      + '<div style="font-size:14px;font-weight:700;color:#a78bfa;">' + mode + '</div>'
      + '<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;">Mode</div></div>';
    html += '<div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:8px;text-align:center;">'
      + '<div style="font-size:13px;font-weight:700;color:#f59e0b;">' + subj + '</div>'
      + '<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;">Subject</div></div>';
    html += '<div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:8px;text-align:center;">'
      + '<div style="font-size:13px;font-weight:700;color:#10b981;">' + lang + '</div>'
      + '<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;">Language</div></div>';
    html += '</div>';

    // Show first question as sample
    if(sampleQ){
      var qText = (sampleQ.text||sampleQ.question||sampleQ.q||'').substring(0,150);
      if(qText.length === 150) qText += '…';
      var isRight = sampleQ.correct;
      html += '<div style="margin-bottom:4px;">';
      html += '<div style="font-size:10px;color:#06b6d4;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">📝 Sample Question (Q1)</div>';
      html += '<div style="background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.4);border-radius:8px;padding:10px 12px;font-size:13px;color:#fff;font-weight:500;line-height:1.5;">'
        + qText + '</div>';
      html += '</div>';
    }

    html += '</div>';
    summaryEl.innerHTML = html;
    summaryEl.style.display = 'block';
  }


  // Show weekly performance summary on results page
  setTimeout(function(){
    var data = saaProgressLoad();
    var allQ = qualifiedSessions(data.sessions || []);
    if(!allQ.length) return;

    // Get last 7 days
    var days = {};
    allQ.forEach(function(s){
      var d = new Date(s.date).toISOString().slice(0,10);
      if(!days[d]) days[d] = [];
      days[d].push(s);
    });

    var today = new Date();
    var dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var html = '';
    for(var i=6; i>=0; i--){
      var d = new Date(today);
      d.setDate(today.getDate() - i);
      var key = d.toISOString().slice(0,10);
      var dayName = dayLabels[d.getDay()];
      var isToday = (i === 0);
      if(days[key]){
        var avg = Math.round(days[key].reduce(function(a,s){return a+s.pct;},0)/days[key].length);
        var lbl = perfLabel(avg);
        html += '<div style="text-align:center;background:'+lbl.bg+';border:1px solid '+lbl.border+';border-radius:10px;padding:8px 4px;">'
          + '<div style="font-size:20px;margin-bottom:3px;">'+lbl.icon+'</div>'
          + '<div style="font-size:13px;font-weight:900;color:'+lbl.color+';">'+avg+'%</div>'
          + '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.7);margin-top:3px;background:rgba(0,0,0,0.2);border-radius:4px;padding:1px 0;">'+(isToday?'<span style="color:#06b6d4;">Today</span>':dayName)+'</div>'
          + '</div>';
      } else {
        html += '<div style="text-align:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px 4px;">'
          + '<div style="font-size:20px;margin-bottom:3px;opacity:0.2;">○</div>'
          + '<div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.2);">—</div>'
          + '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);margin-top:3px;background:rgba(0,0,0,0.2);border-radius:4px;padding:1px 0;">'+(isToday?'<span style="color:#06b6d4;">Today</span>':dayName)+'</div>'
          + '</div>';
      }
    }
    var card = document.getElementById('results-perf-card');
    var daysEl = document.getElementById('results-perf-days');
    if(card && daysEl){ daysEl.innerHTML = html; card.style.display = 'block'; }
  }, 200);
}

function getGrade(p){
  if(p>=90)return{label:'🏆 DISTINCTION',cls:'gd'};
  if(p>=80)return{label:'🥇 MERIT',cls:'gm'};
  if(p>=70)return{label:'✅ CREDIT',cls:'gc'};
  if(p>=60)return{label:'📘 SATISFACTORY',cls:'gs'};
  if(p>=50)return{label:'👍 PASS',cls:'gp'};
  return{label:'🔁 NOT YET',cls:'gn'};
}

function getFeedback(p){
  const n=S.name;
  if(p===100)return`🏆 PERFECT, ${n}! Complete mastery. Truly outstanding!`;
  if(p>=90)return`🏆 DISTINCTION, ${n}! ${p}% is exceptional. You've demonstrated complete mastery!`;
  if(p>=80)return`🥇 MERIT, ${n}! ${p}% is excellent. A little more and you'll reach Distinction!`;
  if(p>=70)return`✅ CREDIT, ${n}! ${p}% is solid. Review the flagged areas to push higher.`;
  if(p>=60)return`📘 SATISFACTORY, ${n}. ${p}% shows real understanding building. A retry will push you higher.`;
  if(p>=50)return`👍 PASS, ${n}. ${p}% — you have the basics. Review and try again soon.`;
  return`🔁 ${n}, ${p}% means this topic needs more time — and that's okay. Review your document and retry. You will improve! 💪`;
}

function renderMyCodesTable(){
  var el = document.getElementById('my-codes-table-body');
  if(!el) return;
  var stored = [];
  try{ stored = JSON.parse(localStorage.getItem('saa_saved_codes')||'[]'); }catch(e){}

  if(!stored.length){
    el.innerHTML = '<tr><td colspan="5" style="text-align:center;color:rgba(255,255,255,0.35);padding:16px;font-size:13px;">No codes yet — codes you purchase will appear here</td></tr>';
    return;
  }

  // Sort newest first
  stored.sort(function(a,b){ return (b.savedAt||0)-(a.savedAt||0); });

  el.innerHTML = stored.map(function(c){
    var date = c.savedAt ? new Date(c.savedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    var source = c.source==='payfast' ? '💳 PayFast' : c.source==='drc' ? '📱 Mobile Money' : c.source||'—';
    var region = c.region||'';
    var copyId = 'copy-btn-'+c.code;
    return '<tr style="border-bottom:1px solid rgba(255,255,255,0.07);">'
      + '<td style="padding:10px 8px;font-family:monospace;font-size:14px;font-weight:800;color:#06b6d4;white-space:nowrap;">'+c.code+'</td>'
      + '<td style="padding:10px 8px;font-size:12px;color:#fff;">'+( c.plan||'—')+'</td>'
      + '<td style="padding:10px 8px;font-size:11px;color:rgba(255,255,255,0.5);">'+source+(region?' · '+region:'')+'</td>'
      + '<td style="padding:10px 8px;font-size:11px;color:rgba(255,255,255,0.4);">'+date+'</td>'
      + '<td style="padding:10px 8px;white-space:nowrap;">'
        + '<button class="my-code-copy-btn" data-code="'+c.code+'" data-id="'+copyId+'" id="'+copyId+'" style="padding:4px 10px;background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.4);border-radius:6px;color:#06b6d4;font-size:11px;font-weight:700;cursor:pointer;margin-right:4px;">📋 Copy</button>'
        + '<button class="my-code-delete-btn" data-code="'+c.code+'" style="padding:4px 8px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);border-radius:6px;color:#ef4444;font-size:11px;font-weight:700;cursor:pointer;" title="Remove this code from this device">🗑️</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}

// ── STUDY SESSION (Summarize / Key Points modes) ───────────────────────
async function startStudySession(mode){
  if(!S.images.length && !saPDFText){
    if(typeof pdfDoc !== 'undefined' && pdfDoc !== null){
      toast(saT('err_pdf_extract')||'Please click "Use Selected Pages" to extract PDF pages first','err'); return;
    }
    toast(saT('err_no_doc')||'Please upload a document first','err'); return;
  }


  const pages  = parseInt(document.getElementById('summary-pages')?.value) || 2;
  const items  = parseInt(document.getElementById('key-things-count')?.value) || 5;

  // Navigate to study page
  document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  const sp = document.getElementById('page-study');
  sp.classList.add('active'); sp.style.display='block';
  window.scrollTo(0,0);

  const title = document.getElementById('study-title');
  const content = document.getElementById('study-content');

  if(mode === 'summary'){
    title.textContent = `📄 Summary — ${pages} page${pages>1?'s':''}`;
    content.innerHTML = `
      <div style="text-align:center;padding:60px 20px;">
        <div style="display:flex;justify-content:center;gap:8px;margin-bottom:20px;">
          <div class="ai-dot" style="width:14px;height:14px;border-radius:50%;background:#3b82f6;animation:aiPulse 1.2s ease infinite;"></div>
          <div class="ai-dot" style="width:14px;height:14px;border-radius:50%;background:#3b82f6;animation:aiPulse 1.2s ease infinite 0.2s;"></div>
          <div class="ai-dot" style="width:14px;height:14px;border-radius:50%;background:#3b82f6;animation:aiPulse 1.2s ease infinite 0.4s;"></div>
        </div>
        <div style="color:#93c5fd;font-size:15px;font-weight:600;">📄 AI is reading your document...</div>
        <div style="color:#64748b;font-size:13px;margin-top:8px;">Writing a ${pages}-page summary in ${S.lang}</div>
        <div style="margin-top:20px;width:200px;height:4px;background:rgba(255,255,255,0.1);border-radius:999px;margin-left:auto;margin-right:auto;overflow:hidden;">
          <div style="height:100%;background:linear-gradient(90deg,#1a56db,#3b82f6,#1a56db);background-size:200%;border-radius:999px;animation:shimmer 1.5s ease infinite;"></div>
        </div>
      </div>`;
  } else {
    title.textContent = `⭐ ${items} Key Points`;
    content.innerHTML = `
      <div style="text-align:center;padding:60px 20px;">
        <div style="display:flex;justify-content:center;gap:8px;margin-bottom:20px;">
          <div class="ai-dot" style="width:14px;height:14px;border-radius:50%;background:#8b5cf6;animation:aiPulse 1.2s ease infinite;"></div>
          <div class="ai-dot" style="width:14px;height:14px;border-radius:50%;background:#8b5cf6;animation:aiPulse 1.2s ease infinite 0.2s;"></div>
          <div class="ai-dot" style="width:14px;height:14px;border-radius:50%;background:#8b5cf6;animation:aiPulse 1.2s ease infinite 0.4s;"></div>
        </div>
        <div style="color:#c4b5fd;font-size:15px;font-weight:600;">⭐ AI is finding the most important points...</div>
        <div style="color:#64748b;font-size:13px;margin-top:8px;">Extracting ${items} key things to know in ${S.lang}</div>
        <div style="margin-top:20px;width:200px;height:4px;background:rgba(255,255,255,0.1);border-radius:999px;margin-left:auto;margin-right:auto;overflow:hidden;">
          <div style="height:100%;background:linear-gradient(90deg,#7c3aed,#8b5cf6,#7c3aed);background-size:200%;border-radius:999px;animation:shimmer 1.5s ease infinite;"></div>
        </div>
      </div>`;
  }

  try{
    const workerUrl = 'https://smartacademy-ai.kasongokimba.workers.dev';

    // Build content — use Excel text if available, otherwise use images
    let imageContent;
    if(saPDFText){
      imageContent = [{type:'text', text:'[Excel/Document Data]\n' + saPDFText}];
    } else {
      imageContent = S.images.filter(img => img && img.type !== 'excel').map((img,i) => ([
        {type:'text', text:`--- Page ${i+1} ---`},
        {type:'image_url', image_url:{url:img.data, detail:'high'}}
      ])).flat();
    }

    // Prompt is hidden in Cloudflare Worker — we just send mode and params
    const _studyAC = new AbortController();
    const _studyTimeout = setTimeout(()=> _studyAC.abort(), 55000); // 55s timeout
    const res = await fetch(workerUrl, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      signal: _studyAC.signal,
      body: JSON.stringify({
        _appSecret: APP_SECRET,
        apiKey: getApiKey(),
        name:S.name, level:S.level, subject:S.subject,
        lang:S.lang||'English', qCount:S.qCount, diffMode:S.diffMode,
        studyMode: mode,
        studyLLM: _studyLLM || 'gpt',
        studyPages: pages,
        studyItems: items,
        messages:[{
          role:'user',
          content: imageContent
        }],
        max_tokens: S.qCount > 15 ? 8000 : 6000
      })
    });
    clearTimeout(_studyTimeout);

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    if(data.usage && S.code) saaTrackCost(S.code, data.usage, 'study');

    if(!text || text.toLowerCase().includes("i'm sorry") || text.toLowerCase().includes("i cannot assist") || text.toLowerCase().includes("can't assist with this image")){
      content.innerHTML = `<div style="color:#ef4444;padding:20px;text-align:center;">
        <div style="font-size:24px;margin-bottom:8px;">⚠️</div>
        <div style="font-weight:700;margin-bottom:8px;">Could not read this image</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.6);">Try using a clearer photo of your notes or textbook pages.<br>Screenshots of messages or apps may not be readable.</div>
      </div>`;
      return;
    }

    // Store for read aloud
    S.studyText = text;
    S.studyMode = mode;
    saveOfflineStudy(mode, text, S.docName||S.subject||'Document'); // Save for offline
    // Apply math notation fixes before rendering
    var mathText = typeof fixMath === 'function' ? fixMath(text) : text;
    const html = md2html(mathText);
    content.innerHTML = `
      <div style="background:#ffffff;border-radius:16px;padding:28px;color:#1e293b;line-height:1.9;font-size:15px;box-shadow:0 4px 24px rgba(0,0,0,0.15);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e2e8f0;">
          <div style="font-size:11px;font-weight:700;color:#1a56db;text-transform:uppercase;letter-spacing:1px;">
            ${mode==='summary'?`📄 ${pages}-Page Summary`:`⭐ ${items} Things You Must Know`}
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-left:auto;">
            ${S.subject} · ${S.name} · ${S.lang}
          </div>
        </div>
        <div style="color:#1e293b;">${html}</div>
      </div>

      <!-- Action buttons -->
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
        <button onclick="toggleStudySpeak()"
          style="flex:1;padding:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;min-width:140px;">
          🔊 Read Aloud
        </button>
        <button onclick="downloadStudyNotes('word')"
          style="flex:1;padding:12px;background:#1e3a8a;color:#fff;border:none;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;min-width:100px;">
          📄 Word
        </button>
        <button onclick="downloadStudyNotes('pdf')"
          style="flex:1;padding:12px;background:#7f1d1d;color:#fff;border:none;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;min-width:100px;">
          📕 PDF
        </button>
        
      </div>

      <!-- Start quiz -->
      <div style="margin-top:12px;">
        <button onclick="exitStudySession(); startSession();"
          style="width:100%;padding:13px;background:linear-gradient(135deg,#1a56db,#3b82f6);color:#fff;border:none;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">
          📝 Now Take Quiz on This Document
        </button>
      </div>`;

    // Auto read aloud if enabled
    if(window._studySpeakOn){ speakText(text); }

    // Render LaTeX math
    if(window.MathJax && MathJax.typesetPromise){
      MathJax.typesetPromise([content]).catch(function(err){ console.warn('MathJax error:', err); });
    }


  }catch(err){
    content.innerHTML = `<div style="color:#ef4444;padding:20px;">❌ Error: ${err.message}</div>`;
  }
}

function exitStudySession(){
  stopSpeak();
  document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  const pp = document.getElementById('page-profile');
  pp.classList.add('active'); pp.style.display='block';
  window.scrollTo(0,0);
}

// ── STUDY NOTES DOWNLOAD & TEXT-TO-SPEECH ──────────────────────────────
function downloadStudyNotes(fmt){
  const text = S.studyText || '';
  const mode = S.studyMode === 'summary' ? 'Summary' : 'KeyPoints';
  const cleanText = typeof cleanLatex==='function' ? cleanLatex(text) : latexToReadable(text);
  const bodyHtml = `<h2>Smart Academy AI — ${mode}</h2>
<p><strong>Learner:</strong> ${S.name} | <strong>Subject:</strong> ${S.subject} | <strong>Level:</strong> ${S.level}</p>
<hr><br>${md2html(cleanText)}`;

  if(fmt === 'word'){
    // Word doc via mhtml trick — opens in Word with full formatting
    const mhtml = '\uFEFF' + `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  body{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#1e293b;line-height:1.8;margin:2cm;}
  h1,h2,h3{color:#1a56db;}strong{color:#0f2044;}
</style></head><body>${bodyHtml}</body></html>`;
    const blob = new Blob([mhtml], {type:'application/msword'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `SmartAcademy_${mode}_${S.name}.doc`;
    a.click(); URL.revokeObjectURL(url);
    toast('✅ Word document downloaded!','ok');

  } else {
    // PDF via print dialog
    const win = window.open('','_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Smart Academy — ${mode} — ${S.name}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#1e293b;line-height:1.8;}
  h1,h2,h3{color:#1a56db;}strong{color:#0f2044;}
  @media print{body{margin:1cm;}}
</style></head><body>${bodyHtml}
<script>window.onload=function(){window.print();}<\/script>
</body></html>`);
    win.document.close();
    toast('✅ PDF print dialog opened — choose Save as PDF','ok');
  }
}

function toggleStudySpeak(){
  if(window._studySpeakOn){ stopSpeak(); }
  else { speakText(S.studyText || ''); }
}

function speakText(text){
  if(!window.speechSynthesis){ toast('Read aloud not supported on this browser','err'); return; }
  stopSpeak();
  window._studySpeakOn = true;

  // Update button
  const btn = document.getElementById('btn-study-speak');
  if(btn) btn.textContent = '⏹ Stop Reading';

  // Clean text for speech
  const clean = text.replace(/\*\*/g,'').replace(/#+/g,'').replace(/```[^`]*```/g,'').trim();

  _speechUtterance = new SpeechSynthesisUtterance(clean);
  _speechUtterance.lang = getLangCode(S.lang);
  _speechUtterance.rate = 0.9;
  _speechUtterance.pitch = 1.0;
  _speechUtterance.onend = ()=>{
    window._studySpeakOn = false;
    const btn = document.getElementById('btn-study-speak');
    if(btn) btn.textContent = '🔊 Read Aloud';
  };
  window.speechSynthesis.speak(_speechUtterance);
  toast('🔊 Reading aloud...','ok');
}

function stopSpeak(){
  if(window.speechSynthesis) window.speechSynthesis.cancel();
  window._studySpeakOn = false;
  const btn = document.getElementById('btn-study-speak');
  if(btn) btn.textContent = '🔊 Read Aloud';
}

function getLangCode(lang){
  const map = {
    'english':'en-US','french':'fr-FR','portuguese':'pt-BR',
    'spanish':'es-ES','swahili':'sw-KE','arabic':'ar-SA',
    'afrikaans':'af-ZA','zulu':'zu-ZA','xhosa':'xh-ZA',
    'lingala':'fr-FR','kikongo':'fr-FR','tshiluba':'fr-FR'
  };
  return map[lang.toLowerCase()] || 'en-US';
}

function speakQuestion(text){
  if(!window._quizSpeakOn) return;
  speakText(text);
}

// ── QUIZ RETRY / RESTART FLOWS ──────────────────────────────────────────
function resetQuiz(){
  if(!confirm('Clear uploaded documents and upload a new one?\n\nYour name, subject and settings will be kept.')) return;

  // Clear ONLY uploaded files
  S.images     = [];
  S.questions  = [];
  S.answers    = [];
  S.streak     = 0;
  S.maxStreak  = 0;
  S.hints      = [];
  S.currentQ   = 0;
  S.retryMode  = false;
  pdfDoc       = null;
  pdfTotalPages = 0;

  // Reset upload UI
  renderThumbs();
  const counter = document.getElementById('upload-counter');
  if(counter){ counter.textContent = '0 / 10 ' + (saT('pages_uploaded')||'pages uploaded'); counter.style.color = '#1a56db'; }

  // Reset PDF UI
  const pdfStatus = document.getElementById('pdf-status');
  if(pdfStatus) pdfStatus.textContent = '';
  const pdfRange = document.getElementById('pdf-range-section');
  if(pdfRange) pdfRange.style.display = 'none';
  const pdfThumbStrip = document.getElementById('pdf-thumb-strip');
  if(pdfThumbStrip) pdfThumbStrip.innerHTML = '';
  const pdfRangeInfo = document.getElementById('pdf-range-info');
  if(pdfRangeInfo) pdfRangeInfo.textContent = '';

  // Reset file inputs so same file can be re-uploaded
  const fileInput = document.getElementById('file-input');
  if(fileInput) fileInput.value = '';
  const pdfInput = document.getElementById('pdf-input');
  if(pdfInput) pdfInput.value = '';

  // Switch to image upload tab
  switchUploadTab('img');

  // Go to profile page — scroll to upload section
  document.querySelectorAll('.page').forEach(p=>{
    p.classList.remove('active');
    p.style.display = 'none';
  });
  const pp = document.getElementById('page-profile');
  pp.classList.add('active');
  pp.style.display = 'block';

  // Scroll to upload section
  setTimeout(()=>{
    const uploadCard = document.querySelector('#page-profile .pcard:last-of-type');
    if(uploadCard) uploadCard.scrollIntoView({behavior:'smooth', block:'start'});
  }, 300);

  toast('📂 Documents cleared — upload new document to continue','ok');
}

function newQuestions(){
  if((!S.images || !S.images.length) && !saPDFText){
    toast('No document found — please do a Full Restart','err');
    return;
  }

  // Backup images before reset
  const savedImages = [...S.images];

  // Reset quiz state but KEEP images
  S.questions  = [];
  S.answers    = [];
  S.streak     = 0;
  S.maxStreak  = 0;
  S.hints      = [];
  S.currentQ   = 0;
  S.retryMode  = false;
  S.isNewQRetry = true; // flag so prompt stays strictly on document

  // Restore images (safety)
  S.images = savedImages;

  // Clear chat and question UI
  const chatBox = document.getElementById('chat-box');
  const qui     = document.getElementById('question-ui');
  if(chatBox) chatBox.innerHTML = '';
  if(qui)     qui.innerHTML = '';

  // Reset progress bar
  document.getElementById('prog-fill').style.width = '0%';
  document.getElementById('prog-lbl').textContent = '0 / 0 answered';

  // Hide streak badge
  const badge = document.getElementById('streak-badge');
  if(badge) badge.style.display = 'none';

  // Navigate to quiz page
  document.querySelectorAll('.page').forEach(p=>{
    p.classList.remove('active');
    p.style.display='none';
  });
  const qp = document.getElementById('page-quiz');
  qp.classList.add('active');
  qp.style.display='block';
  window.scrollTo(0,0);

  buildChips();
  updateProg();
  initQuiz();
}

function retryWrong(){
  const idxs = S.answers.filter(a=>!a.correct||a.conf==='GUESS').map(a=>a.qIdx);
  if(!idxs.length){ toast('Nothing to retry — you got them all!','ok'); return; }

  S.retryMode = true;
  S.questions = idxs.map(i=>S.questions[i]);
  S.answers   = [];
  S.streak    = 0;
  S.maxStreak = 0;
  S.hints     = [];
  S.currentQ  = 0;

  // Clear UI
  document.getElementById('chat-box').innerHTML = '';
  document.getElementById('question-ui').innerHTML = '';

  // Reset progress bar
  document.getElementById('prog-fill').style.width = '0%';
  document.getElementById('prog-lbl').textContent = `0 / ${S.questions.length} answered`;

  // Hide streak badge
  const badge = document.getElementById('streak-badge');
  if(badge) badge.style.display = 'none';

  // Navigate to quiz directly
  document.querySelectorAll('.page').forEach(p=>{
    p.classList.remove('active');
    p.style.display='none';
  });
  const qp = document.getElementById('page-quiz');
  qp.classList.add('active');
  qp.style.display='block';
  window.scrollTo(0,0);

  updateProg();
  addAI(`🔁 **Retry mode, ${S.name}!** ${S.questions.length} question(s) to retry. Fresh start — score reset to zero. Let's go! 💪`);
  setTimeout(()=>presentQ(0),1000);
}

function restartFull(){
  if(!confirm(saT('confirm_restart')||'Restart the full quiz with new questions?'))return;

  // Reset ALL state to zero — clean slate
  S.retryMode  = false;
  S.questions  = [];
  S.answers    = [];
  S.streak     = 0;
  S.maxStreak  = 0;
  S.hints      = [];
  S.currentQ   = 0;
  S.images     = [];
  pdfDoc       = null;
  pdfTotalPages = 0;
  saPDFText    = '';

  // Clear chat and question UI
  document.getElementById('chat-box').innerHTML = '';
  document.getElementById('question-ui').innerHTML = '';

  // Reset progress bar
  document.getElementById('prog-fill').style.width = '0%';
  document.getElementById('prog-lbl').textContent = '0 / 0 answered';

  // Hide streak badge
  const badge = document.getElementById('streak-badge');
  if(badge) badge.style.display = 'none';

  // Reset uploads
  renderThumbs();
  const counter = document.getElementById('upload-counter');
  if(counter){ counter.textContent = '0 / 10 ' + (saT('pages_uploaded')||'pages uploaded'); counter.style.color = '#1a56db'; }
  const pdfStatus = document.getElementById('pdf-status');
  if(pdfStatus) pdfStatus.textContent = '';
  const pdfRange = document.getElementById('pdf-range-section');
  if(pdfRange) pdfRange.style.display = 'none';
  const fileInput = document.getElementById('file-input');
  if(fileInput) fileInput.value = '';
  const pdfInput = document.getElementById('pdf-input');
  if(pdfInput) pdfInput.value = '';
  switchUploadTab('img');

  // Navigate to profile page directly
  document.querySelectorAll('.page').forEach(p=>{
    p.classList.remove('active');
    p.style.display='none';
  });
  const ap = document.getElementById('page-profile');
  ap.classList.add('active');
  ap.style.display='block';
  window.scrollTo(0,0);
}

// ── PDF/WORD REPORT GENERATION ──────────────────────────────────────────
async function saveReportAsPDF(){
  // Build report content directly — do NOT call showReport()
  // because it navigates to a different page
  const c = S.answers.filter(a=>a.correct).length;
  const t = S.answers.length;
  const p = Math.round((c/t)*100);
  const g = getGrade(p);
  const days = S.codeExpiry ? Math.ceil((S.codeExpiry-new Date())/(1000*60*60*24)) : 365;
  const inc = S.answers.filter(a=>!a.correct);
  const guessed = S.answers.filter(a=>a.correct&&a.conf==='GUESS');
  const conf = S.answers.filter(a=>a.correct&&a.conf==='SURE');
  const renewal = days<=7
    ? `⚠️ Access code expires in ${days} day(s). Please renew.`
    : `✅ Access valid — ${days} days remaining`;

  const wrongList = inc.length
    ? inc.map(a=>`Q${a.qIdx+1}: ${S.questions[a.qIdx]?.text||'–'}`).join('<br>')
    : 'None — excellent performance!';

  const recommendation = getRecommendation(p, inc.length, guessed.length);

  const reportHTML = `
    <h1 style="color:#0f2044;font-size:22px;margin-bottom:4px;">Smart Academy AI</h1>
    <p style="color:#1a56db;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #1a56db;">
      Official Learner Progress Report
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase;width:50%;">Learner</td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase;">Level</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${S.name}</td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${S.level}</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase;">Subject</td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase;">Language</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${S.subject}</td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${S.lang}</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase;">Questions</td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase;">Date</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${t}</td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${S.date}</td></tr>
    </table>
    <div style="text-align:center;padding:24px 0;border-bottom:1px solid #e2e8f0;margin-bottom:20px;">
      <div style="font-size:56px;font-weight:900;color:#1a56db;line-height:1;">${p}%</div>
      <div style="font-size:18px;font-weight:600;color:#0f2044;margin:8px 0;">${c} / ${t} correct</div>
      <div style="display:inline-block;padding:8px 24px;border-radius:999px;font-size:14px;font-weight:700;background:rgba(26,86,219,0.1);color:#1a56db;border:1px solid rgba(26,86,219,0.3);margin-top:8px;">${g.label}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">
      <div style="background:#f8fafc;border-radius:8px;padding:14px;text-align:center;border:1px solid #e2e8f0;">
        <div style="font-size:24px;font-weight:800;color:#10b981;">${conf.length}</div>
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Mastered</div>
      </div>
      <div style="background:#f8fafc;border-radius:8px;padding:14px;text-align:center;border:1px solid #e2e8f0;">
        <div style="font-size:24px;font-weight:800;color:#f59e0b;">${guessed.length}</div>
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Developing</div>
      </div>
      <div style="background:#f8fafc;border-radius:8px;padding:14px;text-align:center;border:1px solid #e2e8f0;">
        <div style="font-size:24px;font-weight:800;color:#ef4444;">${inc.length}</div>
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Needs Attention</div>
      </div>
    </div>
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;color:#0f2044;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">Questions Needing Attention</div>
      <p style="font-size:14px;color:#64748b;line-height:1.7;">${wrongList}</p>
    </div>
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;color:#0f2044;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">Educator Recommendation</div>
      <p style="font-size:14px;color:#64748b;line-height:1.7;">${recommendation}</p>
    </div>
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;color:#0f2044;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">Session Statistics</div>
      <p style="font-size:14px;color:#64748b;line-height:1.7;">
        Longest Streak: ${S.maxStreak} consecutive correct answers<br>
        Hints Used: ${S.hints.length}<br>
        Best Streak Milestone: ${S.maxStreak>=7?'🌟 7+':S.maxStreak>=5?'⚡ 5+':S.maxStreak>=3?'🔥 3+':'–'}
      </p>
    </div>
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;color:#0f2044;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">Access Code Status</div>
      <p style="font-size:14px;color:#64748b;">${renewal}</p>
    </div>
    <div style="text-align:center;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
      Generated by Smart Academy AI v6.0 · ${S.date}<br>
      info@smartacademy-ai.com · smartacademy-ai.com<br>
      Prepared for Educator / Parent Review
    </div>`;

  const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Smart Academy AI Report — ${S.name}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:30px;background:#fff;color:#1e293b;}
  @media print{body{padding:10px;}}
</style>
</head>
<body>
<div style="height:40px;"></div>${reportHTML}
</body>
</html>`;

  // Download the file
  const blob = new Blob([fullHTML], {type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `SmartAcademy_${S.name}_${S.subject}_${p}pct.html`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);

  toast('✅ Report downloaded! Open it then press Ctrl+P → Save as PDF','ok');
}

function showReport(){
  const c=S.answers.filter(a=>a.correct).length;
  const t=S.answers.length;
  const p=Math.round((c/t)*100);
  const g=getGrade(p);
  const days=Math.ceil((S.codeExpiry-new Date())/(1000*60*60*24));
  const inc=S.answers.filter(a=>!a.correct);
  const guessed=S.answers.filter(a=>a.correct&&a.conf==='GUESS');
  const conf=S.answers.filter(a=>a.correct&&a.conf==='SURE');
  const renewal=days<=7
    ?`<div style="color:#f59e0b;padding:10px;background:rgba(245,158,11,0.08);border-radius:8px;border:1px solid rgba(245,158,11,0.2);margin-top:10px;">⚠️ Access code expires in ${days} day(s). Please renew.</div>`
    :`<span style="color:#10b981">✅ Access valid — ${days} days remaining</span>`;

  document.getElementById('report-body').innerHTML=`
    <div class="report-header">
      <div class="rh-tag">📋 Official Learner Progress Report</div>
      <h2>Smart Academy AI · smartacademy-ai.com</h2>
    </div>
    <div class="report-grid">
      ${rcell('👤 Learner',S.name)}
      ${rcell('🎒 Level',S.level)}
      ${rcell('📚 Subject',S.subject)}
      ${rcell('🌍 Language',S.lang)}
      ${rcell('📝 Questions',t)}
      ${rcell('📅 Date',S.date)}
      ${rcell('🔐 Access Code',S.code)}
      ${rcell('📋 Code Type',S.codeType)}
    </div>
    <div class="report-score-center">
      <div class="rs-num">${p}%</div>
      <div class="rs-label">${c} / ${t} correct</div>
      <div class="grade-pill ${g.cls}" style="margin:12px auto;display:inline-block;">${g.label}</div>
    </div>
    <div class="report-3grid">
      <div class="r3c"><div class="r3n" style="color:#10b981">${conf.length}</div><div class="r3l">Mastered</div></div>
      <div class="r3c"><div class="r3n" style="color:#f59e0b">${guessed.length}</div><div class="r3l">Developing</div></div>
      <div class="r3c"><div class="r3n" style="color:#ef4444">${inc.length}</div><div class="r3l">Needs Attention</div></div>
    </div>
    <div class="report-section">
      <h3>Questions Needing Attention</h3>
      <p>${inc.length?inc.map(a=>`Q${a.qIdx+1}: ${S.questions[a.qIdx]?.text||'–'}`).join('<br>'):'None — excellent performance!'}</p>
    </div>
    <div class="report-section">
      <h3>Educator Recommendation</h3>
      <p>${getRecommendation(p,inc.length,guessed.length)}</p>
    </div>
    <div class="report-section">
      <h3>Session Statistics</h3>
      <p>Longest Streak: ${S.maxStreak} consecutive correct answers<br>
      Hints Used: ${S.hints.length}<br>
      Best Streak Milestone: ${S.maxStreak>=7?'🌟 7+':S.maxStreak>=5?'⚡ 5+':S.maxStreak>=3?'🔥 3+':'–'}</p>
    </div>
    <div class="report-section">
      <h3>Access Code Status</h3>
      <p>${renewal}</p>
    </div>
    <div class="report-footer">
      Generated by Smart Academy AI v6.0 · ${S.date}<br>
      info@smartacademy-ai.com · smartacademy-ai.com<br>
      Prepared for Educator / Parent Review
    </div>`;

  // Navigate to report page directly without showPage
  document.querySelectorAll('.page').forEach(p=>{
    p.classList.remove('active');
    p.style.display='none';
  });
  const rp = document.getElementById('page-report');
  rp.classList.add('active');
  rp.style.display='block';
  window.scrollTo(0,0);
}

function downloadReport(){
  const content = document.getElementById('report-body').innerHTML;
  const c = S.answers.filter(a=>a.correct).length;
  const t = S.answers.length;
  const p = Math.round((c/t)*100);

  // Build a complete standalone HTML report for download
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Smart Academy AI Report — ${S.name} — ${S.date}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: Arial, sans-serif;
    background: #f8fafc;
    color: #1e293b;
    padding: 20px;
  }
  .report-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 28px;
    max-width: 680px;
    margin: 0 auto;
  }
  .report-header {
    border-bottom: 3px solid #1a56db;
    padding-bottom: 16px;
    margin-bottom: 20px;
  }
  .rh-tag {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #1a56db;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  h2 { font-size: 20px; font-weight: 800; color: #0f2044; }
  .report-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 20px;
  }
  .rg-cell { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
  .rgc-l {
    font-size: 10px; color: #64748b;
    text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px;
  }
  .rgc-v { font-size: 14px; font-weight: 600; color: #1e293b; }
  .report-score-center { text-align: center; padding: 20px 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 16px; }
  .rs-num { font-size: 52px; font-weight: 900; color: #1a56db; line-height: 1; }
  .rs-label { font-size: 16px; font-weight: 600; color: #0f2044; margin: 8px 0; }
  .grade-pill {
    display: inline-block; padding: 7px 20px;
    border-radius: 999px; font-size: 14px;
    font-weight: 700; letter-spacing: 1px;
    text-transform: uppercase; margin-top: 8px;
    background: rgba(26,86,219,0.1);
    color: #1a56db; border: 1px solid rgba(26,86,219,0.3);
  }
  .report-3grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 16px; }
  .r3c { background: #f8fafc; border-radius: 8px; padding: 12px; text-align: center; }
  .r3n { font-size: 22px; font-weight: 800; line-height: 1; }
  .r3l { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  .report-section { margin-bottom: 16px; }
  .report-section h3 {
    font-size: 11px; font-weight: 700; color: #0f2044;
    letter-spacing: 1px; text-transform: uppercase;
    margin-bottom: 8px; padding-bottom: 6px;
    border-bottom: 1px solid #e2e8f0;
  }
  .report-section p { font-size: 14px; color: #64748b; line-height: 1.7; }
  .report-footer {
    text-align: center; padding-top: 14px;
    border-top: 1px solid #e2e8f0;
    font-size: 11px; color: #94a3b8;
  }
</style>
</head>
<body>
<div style="height:40px;"></div>
<div class="report-card">${content}</div>
<div class="page" 
</body>
</html>`;

  // Create download link
  const blob = new Blob([html], {type:'text/html'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `SmartAcademy_Report_${S.name}_${S.subject}_${S.date.replace(/ /g,'_')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast('✅ Report downloaded successfully','ok');
}

async function saveAsPDF(){
  const btn = document.getElementById('btn-pdf');
  btn.textContent = '⏳ Generating PDF...';
  btn.disabled = true;

  try{
    // Load html2pdf library if not already loaded
    if(!window.html2pdf){
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
    }

    const element  = document.getElementById('report-body');
    const filename = `SmartAcademy_Report_${S.name}_${S.subject}_${S.date.replace(/ /g,'_')}.pdf`;

    const options = {
      margin:      [10, 10, 10, 10],
      filename:    filename,
      image:       { type:'jpeg', quality:0.98 },
      html2canvas: { scale:2, useCORS:true, backgroundColor:'#ffffff' },
      jsPDF:       { unit:'mm', format:'a4', orientation:'portrait' }
    };

    await html2pdf().set(options).from(element).save();

    btn.textContent = '✅ PDF Saved!';
    toast('✅ PDF saved to your Downloads folder','ok');

    setTimeout(()=>{
      btn.textContent = '📄 Save as PDF';
      btn.disabled = false;
    }, 3000);

  }catch(err){
    btn.textContent = '📄 Save as PDF';
    btn.disabled = false;
    toast('❌ PDF failed — try Download button instead','err');
    console.error(err);
  }
}

function getRecommendation(p,w,g){
  if(p===100)return`${S.name} achieved a perfect score. Consider introducing the next chapter or an advanced extension activity.`;
  if(p>=80)return`${S.name} shows strong understanding. Focus revision on ${w} incorrect question(s) before the next assessment.`;
  if(p>=60)return`${S.name} has a working understanding but requires targeted revision of the weak areas identified above. A retry session is recommended.`;
  return`${S.name} needs additional support on this topic. Recommend revisiting the document together, then attempting a retry session.`;
}

// ── TUTOR CHAT: AUTO-SPEAK & MESSAGE DISPLAY HELPERS ──────────────────
function tutorAutoSpeak(text){
  if(!window._tutorAutoSpeak || !text) return;
  // Cancel any current speech
  if(window.speechSynthesis) window.speechSynthesis.cancel();
  // Clean text — strip markdown, emojis, confidence tags
  var clean = text
    .replace(/\*\*/g,'').replace(/\*/g,'').replace(/#+\s*/g,'')
    .replace(/\[CONFIDENCE:\d+\]/gi,'')
    .replace(/[\u{1F300}-\u{1FFFF}]/gu,'')
    .replace(/[\u2600-\u27BF]/g,'')
    .replace(/[✅❌📐📖🔊🎤🏆📌💪⭐🧑👤🤖📄⬇️🎓🔒🔓]/g,'')
    .replace(/\n+/g,' ').replace(/\s+/g,' ').trim();
  if(!clean) return;
  var u = new SpeechSynthesisUtterance(clean);
  u.lang = getLangBCP47(typeof saLang !== 'undefined' ? saLang : 'en');
  u.rate = 0.85; u.pitch = 1.0; u.volume = 1.0;
  // Chrome bug fix — resume every 10s to prevent pausing
  var resumeTimer = setInterval(function(){
    if(!window.speechSynthesis.speaking){ clearInterval(resumeTimer); return; }
    window.speechSynthesis.pause();
    window.speechSynthesis.resume();
  }, 10000);
  u.onend = u.onerror = function(){ clearInterval(resumeTimer); };
  window.speechSynthesis.speak(u);
}

function toggleAutoSpeak(btn){
  window._tutorAutoSpeak = !window._tutorAutoSpeak;
  if(window._tutorAutoSpeak){
    // Unlock audio immediately on this user tap
    if(window.speechSynthesis){
      // Speak a silent utterance to unlock audio context
      var unlock = new SpeechSynthesisUtterance('');
      unlock.volume = 0;
      unlock.rate = 10;
      window.speechSynthesis.speak(unlock);
      window._audioUnlocked = true;
      // Keep audio context alive with periodic silent utterances
      window._audioKeepAlive = setInterval(function(){
        if(!window._tutorAutoSpeak){ clearInterval(window._audioKeepAlive); return; }
        if(!window._tutorSpeakingId){ // only if not currently speaking
          var k = new SpeechSynthesisUtterance('');
          k.volume = 0; k.rate = 10;
          window.speechSynthesis.speak(k);
        }
      }, 5000);
    }
    btn.textContent = '🔊 Auto-Read ON';
    btn.style.background = 'rgba(6,182,212,0.2)';
    btn.style.borderColor = 'rgba(6,182,212,0.5)';
    btn.style.color = '#06b6d4';
    toast('🔊 Auto-read ON — answers will be spoken aloud','ok');
  } else {
    window.speechSynthesis && window.speechSynthesis.cancel();
    window._audioUnlocked = false;
    if(window._audioKeepAlive){ clearInterval(window._audioKeepAlive); window._audioKeepAlive = null; }
    btn.textContent = '🔇 Auto-Read';
    btn.style.background = 'rgba(255,255,255,0.07)';
    btn.style.borderColor = 'rgba(255,255,255,0.15)';
    btn.style.color = 'rgba(255,255,255,0.5)';
    toast('🔇 Auto-read OFF','ok');
  }
}

function addUser(md){
  const box=document.getElementById('chat-box');
  const d=document.createElement('div');
  d.className='msg user';
  d.innerHTML=`<div class="msg-av">👤</div><div class="msg-bub">${md2html(md)}</div>`;
  box.appendChild(d);box.scrollTop=box.scrollHeight;
  if(window.MathJax&&MathJax.typesetPromise) MathJax.typesetPromise([d]).catch(function(){});
}

function showTyping(){
  const box=document.getElementById('chat-box');
  const d=document.createElement('div');
  d.className='msg ai';d.id='typing-el';
  d.innerHTML=`<div class="msg-av">🤖</div><div class="typing-ind"><span></span><span></span><span></span></div>`;
  box.appendChild(d);box.scrollTop=box.scrollHeight;
}

function removeTyping(){const el=document.getElementById('typing-el');if(el)el.remove();}

function updateProg(){
  const t=S.questions.length||S.qCount;
  const d=S.answers.length;
  document.getElementById('prog-fill').style.width=(t?(d/t)*100:0)+'%';
  document.getElementById('prog-lbl').textContent=`${d} / ${t} answered`;
}

function updateStreak(){
  const b=document.getElementById('streak-badge');
  if(S.streak>=2){b.style.display='flex';document.getElementById('streak-num').textContent=S.streak;}
  else b.style.display='none';
}

// ── VOICE INPUT (Tutor Mic) STATE & UI RESET ──────────────────────────
function resetMicUI(){
  _tutorListening = false;
  var btn    = document.getElementById('tutor-mic-btn');
  var status = document.getElementById('mic-status');
  var input  = document.getElementById('tutor-input');
  if(btn){
    btn.style.background = 'rgba(255,255,255,0.08)';
    btn.style.borderColor = 'rgba(0,212,224,0.3)';
    btn.textContent = '🎤';
  }
  if(status) status.style.display = 'none';
  if(input)  input.placeholder = 'Ask anything about your document...';
}

// ── OFFLINE MODE: SAVE/LOAD SESSIONS WHEN NO INTERNET ─────────────────
function saveOfflineQuiz(){
  try {
    var sessions = JSON.parse(localStorage.getItem('saa_offline_quizzes')||'[]');
    var session = {
      savedAt: new Date().toISOString(),
      name: S.name, subject: S.subject, level: S.level,
      lang: S.lang, qCount: S.qCount,
      docName: S.docName || S.subject || 'Document',
      questions: S.questions,
      answers: S.answers,
      score: S.answers.filter(function(a){ return a.correct; }).length,
      total: S.answers.length
    };
    // Keep last 3 sessions
    sessions.unshift(session);
    if(sessions.length > 3) sessions = sessions.slice(0, 3);
    localStorage.setItem('saa_offline_quizzes', JSON.stringify(sessions));
    console.log('[Offline] Quiz session saved. Total saved:', sessions.length);
  } catch(e){ console.warn('[Offline] Could not save quiz:', e); }
}

function saveOfflineStudy(mode, text, docName){
  try {
    var key = mode === 'summary' ? 'saa_offline_summary' : 'saa_offline_keypoints';
    var data = {
      savedAt: new Date().toISOString(),
      mode: mode, text: text,
      docName: docName || S.docName || S.subject || 'Document',
      name: S.name, subject: S.subject, level: S.level, lang: S.lang
    };
    localStorage.setItem(key, JSON.stringify(data));
    console.log('[Offline] '+mode+' saved for offline use.');
  } catch(e){ console.warn('[Offline] Could not save study:', e); }
}

function _showOfflineBanner(show){
  var existing = document.getElementById('saa-offline-banner');
  if(!show){
    if(existing) existing.remove();
    return;
  }
  if(existing) return; // already showing
  var banner = document.createElement('div');
  banner.id = 'saa-offline-banner';
  banner.style.cssText = "position:fixed;bottom:70px;left:50%;transform:translateX(-50%);z-index:99999;background:rgba(245,158,11,0.95);color:#fff;padding:10px 20px;border-radius:50px;font-size:13px;font-weight:700;font-family:Arial,sans-serif;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);";
  banner.innerHTML = '📵 <span>You are offline — limited features available</span>';
  document.body.appendChild(banner);
}

function saveOfflineTutorQA(question, answer){
  try {
    var history = JSON.parse(localStorage.getItem('saa_offline_tutor_qa')||'[]');
    history.unshift({
      savedAt: new Date().toISOString(),
      question: question, answer: answer,
      subject: S.subject, docName: S.docName||S.subject||'Document'
    });
    if(history.length > 20) history = history.slice(0, 20);
    localStorage.setItem('saa_offline_tutor_qa', JSON.stringify(history));
  } catch(e){}
}

function loadOfflineQuizIfNeeded(){
  if(navigator.onLine) return false;
  var sessions = JSON.parse(localStorage.getItem('saa_offline_quizzes')||'[]');
  // Try pre-generated first
  var pregened = localStorage.getItem('saa_offline_pregened');
  if(!sessions.length && !pregened){ toast('📵 No offline quiz available — connect to internet first.','warn'); return false; }
  toast('📴 Offline mode — loading saved quiz...','inf');
  return true;
}

function showOfflineSessions(){
  var quizzes  = JSON.parse(localStorage.getItem('saa_offline_quizzes')||'[]');
  var summary  = localStorage.getItem('saa_offline_summary');
  var keypts   = localStorage.getItem('saa_offline_keypoints');
  var tutorQA  = JSON.parse(localStorage.getItem('saa_offline_tutor_qa')||'[]');

  var modal = document.createElement('div');
  modal.id = 'offline-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999999;background:rgba(8,15,30,0.97);display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

  var html = '<div style="background:#0f2044;border:1px solid rgba(26,86,219,0.3);border-radius:16px;padding:24px;max-width:500px;width:100%;max-height:80vh;overflow-y:auto;">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">';
  html += '<div style="font-size:18px;font-weight:800;color:#fff;">📴 Offline Sessions</div>';
  html += '<button onclick="document.getElementById(&quot;offline-modal&quot;).remove()" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:20px;cursor:pointer;">✕</button>';
  html += '</div>';

  // Summary
  if(summary){
    try {
      var s = JSON.parse(summary);
      var date = new Date(s.savedAt).toLocaleDateString();
      html += '<div style="font-size:12px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:1px;margin:14px 0 10px;">📄 Saved Summary</div>';
      html += '<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;" data-offline-study="summary">';
      html += '<div style="font-size:11px;color:#10b981;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">📄 Summary</div>';
      html += '<div style="font-size:13px;font-weight:800;color:#ffffff;text-shadow:0 1px 3px rgba(0,0,0,0.5);">'+s.docName+'</div>';
      html += '<div style="font-size:11px;color:rgba(255,255,255,0.4);">'+date+'</div>';
      html += '<div style="font-size:11px;color:#10b981;margin-top:4px;">Tap to view →</div>';
      html += '</div>';
    }catch(e){}
  }

  // Key points
  if(keypts){
    try {
      var k = JSON.parse(keypts);
      var date = new Date(k.savedAt).toLocaleDateString();
      html += '<div style="font-size:12px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:1px;margin:14px 0 10px;">⭐ Saved Key Points</div>';
      html += '<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;" data-offline-study="keypoints">';
      html += '<div style="font-size:11px;color:#f59e0b;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">⭐ Key Points</div>';
      html += '<div style="font-size:13px;font-weight:800;color:#ffffff;text-shadow:0 1px 3px rgba(0,0,0,0.5);">'+k.docName+'</div>';
      html += '<div style="font-size:11px;color:rgba(255,255,255,0.4);">'+date+'</div>';
      html += '<div style="font-size:11px;color:#f59e0b;margin-top:4px;">Tap to view →</div>';
      html += '</div>';
    }catch(e){}
  }

  // Tutor Q&A
  if(tutorQA.length){
    html += '<div style="font-size:12px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:1px;margin:14px 0 10px;">💬 Saved Tutor Q&A ('+tutorQA.length+')</div>';
    tutorQA.slice(0,5).forEach(function(qa){
      html += '<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:12px;margin-bottom:8px;">';
      html += '<div style="font-size:12px;color:#a78bfa;font-weight:600;">Q: '+qa.question.slice(0,80)+(qa.question.length>80?'...':'')+'</div>';
      html += '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;">'+qa.answer.slice(0,100)+(qa.answer.length>100?'...':'')+'</div>';
      html += '</div>';
    });
  }

  if(!summary && !keypts && !tutorQA.length){
    html += '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:20px;">No offline sessions saved yet.<br>Complete a quiz or summary while online first.</div>';
  }

  html += '</div>';
  modal.innerHTML = html;
  document.body.appendChild(modal);

  // Event delegation for quiz and study clicks
  modal.addEventListener('click', function(e){
    var quizEl = e.target.closest('[data-offline-quiz]');
    var studyEl = e.target.closest('[data-offline-study]');
    if(quizEl){ loadOfflineQuizSession(parseInt(quizEl.dataset.offlineQuiz)); }
    if(studyEl){ viewOfflineStudy(studyEl.dataset.offlineStudy); }
  });
}

function viewOfflineStudy(mode){
  var key = mode === 'summary' ? 'saa_offline_summary' : 'saa_offline_keypoints';
  var data = localStorage.getItem(key);
  if(!data) return;
  try {
    var s = JSON.parse(data);
    document.getElementById('offline-modal').remove();
    S.studyText = s.text; S.studyMode = mode;
    S.name = s.name; S.subject = s.subject;
    showPage('page-study');
    var el = document.getElementById('study-output');
    if(el) el.innerHTML = '<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px;margin-bottom:16px;font-size:12px;color:#f59e0b;">📴 Offline mode — saved on '+new Date(s.savedAt).toLocaleDateString()+'</div>' + (typeof md2html === 'function' ? md2html(s.text) : s.text);
  }catch(e){}
}

// ── PWA INSTALL BANNER ────────────────────────────────────────────────
function showInstallBanner(){
  // Don't show if already installed or banner exists
  if(document.getElementById('pwa-banner')) return;
  if(window.matchMedia('(display-mode: standalone)').matches) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.style.cssText = `
    position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
    background:linear-gradient(135deg,#1e3a8a,#1e40af);
    border:1px solid rgba(59,130,246,0.4);
    border-radius:14px;padding:14px 20px;
    display:flex;align-items:center;gap:14px;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);
    z-index:99999;max-width:360px;width:calc(100% - 40px);
    animation:slideUp 0.4s ease;
  `;
  banner.innerHTML = `
    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAEaUlEQVR4nO3ZzY0bRxSFUSbgGJyJ8w/AATgTG1oI0IxH4oy6+G5X3VPAWRL10+9b8fHYZP3x51//so/0vGy10h8LkYyv9ONzL+l5HFnpR2YP6TldvtIPyp7Sc3t5pR+QM6Tn+Msr/WCcKT3XT1f6geiQnvMPV/pR6JKe9zcr/Rh0Ss+9wecWDD/1DD/1DD/1DD/1DD/1BEA1w089w089w089AVDN8FNPAFQz/NQTANUMP/UEQDXDTz0BUE0AVDP81BMA1QRANcNPPQFQTQBUEwDVBEA1AVBNAFQTANUEQDXDTz0BUE0AVBMA1QRANQFQTQBUEwDVBEA1AVBNAFQTANUEQDUBUE0AVBMA1QRANQFQTQBUEwDVBEA1AVBNAFQTANUEQDUBUK0qgMff/7xU+n7fPFvp892NAARQTQACqCYAAVQTgACqCUAA1QQggGoCEEC1owJID+jE/lcHXCDvvln6AEsvI4CX//40AthsfwEs/mbpAyy9jABe/vvTCGCz/QWw+JulD7D0MgJ4+e9PI4DN9hfA4m+WPsDSywjg5b8/jQBuJj2g6f3HZyZ9gKWXEcD2+4/PTPoASy8jgO33H5+Z9AGWXkYA2+8/PjPpAyy9jAC23398ZtIHWHoZAWy///jMpA+w9DIC2H7/8ZlJH2DpZQSw/f7jM5M+wOhlnwRy1cQAplf6GwpAANGV/oYCEEB0pb+hAAQQXelvKAABRFf6GwpAANGV/oYCEEB0pb+hAAQQXelvKIAbWxFIegDT+49/s/QBTiKA/Qhg5WMKYDsCWPmYAtiOAFY+pgC2I4CVjymA7Qhg5WMKYDsCWPmYAtjOUQFM/FH16v3TA5jef3xm0gdYehkBXJbef3xm0gdYehkBXJbef3xm0gdYehkBXJbef3xm0gdYehkBXJbef3xm0gdYehkBXJbef3xm0gdYehkBXJbef3xm0gdYehkBXJbef3xm0gcYveyTAb3qhAFM7z8+E+kDjF5WALfff3wm0gcYvawAbr//+EykDzB6WQHcfv/xmUgfYPSyArj9/uMzkT7A6GUFcPv9x2cifYDRywrg9vuPz0T6AKOXFcDt9x+fifQBIEkAVBMA1QRANQFQTQBUEwDVBEA1AVBNAFQTANUEQDUBUE0AVBMA1QRANQFQTQBUEwDVBEA1AVBNAFQTANUEQDUBUE0AVHt8W+lDQMLj+0ofBBIEQDUBUE0AVBMA1QRANQFQTQBUe/y40oeBSY/3K30gmCQAqv0vABHQ4sPhFwAtBEC1nwYgAk73y+EXAKd7GoAIONWnhl8AnOrTAYiA03xp+AXAab4cgAg4xW8NvwA4xW8HIAJ2d2n4RcDOlgy/CNjR0uEXALtZHoAI2MVLhl8E7OClwy8C7mxk+EXAHY0Ovwi4k8jwC4G09Ny/WenHoEt63j9c6UehQ3rOn670A3Gm9Fx/eaUfjDOk5/jySj8ge0rP7fKVflD2kJ7TkZV+ZO4lPY/RlX58DP3tV/pjceZw/wf68+Bt1SxEmgAAAABJRU5ErkJggg==" style="width:44px;height:44px;border-radius:10px;flex-shrink:0;"/>
    <div style="flex:1;">
      <div style="font-weight:700;font-size:14px;color:#fff;">Install Smart Academy AI</div>
      <div style="font-size:12px;color:#93c5fd;margin-top:2px;">Add to home screen — works offline</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
      <button onclick="installPWA()" style="
        padding:7px 14px;background:linear-gradient(135deg,#10b981,#059669);
        color:#fff;border:none;border-radius:7px;font-weight:700;
        font-size:12px;cursor:pointer;white-space:nowrap;">
        ⬇️ Install
      </button>
      <button onclick="dismissInstallBanner()" style="
        padding:5px 14px;background:rgba(255,255,255,0.1);
        color:#93c5fd;border:1px solid rgba(255,255,255,0.1);
        border-radius:7px;font-size:11px;cursor:pointer;">
        Not now
      </button>
    </div>`;

  document.body.appendChild(banner);
}


function installPWA(){
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(result=>{
    if(result.outcome === 'accepted'){
      toast('✅ Smart Academy AI installed! Find it on your home screen 🎉','ok');
    }
    deferredPrompt = null;
    dismissInstallBanner();
  });
}


function dismissInstallBanner(){
  const banner = document.getElementById('pwa-banner');
  if(banner) banner.remove();
  // Remember dismissal for 7 days
  localStorage.setItem('pwa_dismissed', Date.now().toString());
}

// ════════════════════════════════════════════════
// PWA — Save Questions Offline
// ════════════════════════════════════════════════

// ── OFFLINE QUESTION CACHING ─────────────────────────────────────────
function saveQuestionsOffline(){
  if(!S.questions.length) return;
  try{
    const offlineData = {
      savedAt: new Date().toISOString(),
      name: S.name,
      subject: S.subject,
      level: S.level,
      lang: S.lang,
      qCount: S.qCount,
      questions: S.questions,
      answers: S.answers
    };
    localStorage.setItem('saa_offline_session', JSON.stringify(offlineData));
    console.log('[PWA] Questions saved offline');
  }catch(e){
    console.warn('[PWA] Could not save offline:', e);
  }
}

function saveQuestionsOfflineAuto(idx){
  if(idx === 0 && S.questions.length > 0){
    saveQuestionsOffline();
  }
}
