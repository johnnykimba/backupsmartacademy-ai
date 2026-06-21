// ════════════════════════════════════════════════════════════════
// features/quiz.js
// Quiz engine: initialization, question display, answer submission,
// feedback/scoring, hints, challenges, replacement questions, and
// the triangle-diagram geometry renderer used by some quiz questions.
// Extracted from index.html (split, June 2026). Logic unchanged.
//
// DEPENDENCIES (must load before this file):
//   - core/math-utils.js    (fixMath, fixFreeTextMath, quizFracDisplay,
//                            cleanLatex — all used in quiz rendering)
//   - core/session-state.js (S, selectedOpt, selectedConf, hintUsed)
//   - core/ui-helpers.js    (addAI, toast)
//   - features/tutor.js     (renderConfidenceBar — used in buildFeedback
//                            to show AI confidence on results screen)
//
// NOTE on fixMath: initQuiz() used to contain its OWN local copy of
// fixMath, nested inside this function (a known scope bug — see
// math-utils.js header for details). That nested definition has been
// REMOVED here; initQuiz now calls the single global fixMath from
// core/math-utils.js instead. The calls themselves (and their
// behavior) are 100% unchanged — only the duplicate definition is gone.
//
// NOTE on callAPI: this generic "call the worker" helper was
// physically far away in the original file (near other API helpers),
// but is ONLY ever called by reqHint/challengeQ/replaceQ below — all
// three quiz functions. Moved here since it's quiz-only in practice.
// ════════════════════════════════════════════════════════════════

// ── QUIZ AUTO-SUBMIT (on timer expiry) ────────────────────────────
function autoSubmitQuiz(){
  stopQuizTimer();
  toast('⏰ Time is up! Submitting quiz...','warn');
  setTimeout(function(){
    // Fill remaining unanswered questions as wrong
    if(S.questions && S.answers){
      while(S.answers.length < S.questions.length){
        S.answers.push({correct:false, selected:null, timedOut:true});
      }
    }
    // Calculate results
    var c = S.answers ? S.answers.filter(function(a){return a.correct;}).length : 0;
    var t = S.questions ? S.questions.length : 0;
    var p = t > 0 ? Math.round(c/t*100) : 0;
    // Go to results
    showPage('page-results');
    if(typeof buildResults === 'function') buildResults(c, t, p);
  }, 1500);
}

// ── QUIZ INITIALIZATION (generates questions from uploaded doc) ──
async function initQuiz(){
  // Clear ALL previous question UI immediately
  var qui = document.getElementById('question-ui');
  if(qui) qui.innerHTML = '';
  // Clear tutor history from previous session
  if(typeof tutorHistory !== 'undefined') tutorHistory = [];
  var chatBox = document.getElementById('chat-box');
  if(chatBox) chatBox.innerHTML = '';

  // Check images exist before starting
  if((!S.images || !S.images.length) && !saPDFText){
    removeTyping();
    addAI(`⚠️ **No document found, ${S.name}.**\n\nPlease go back and upload your document first.`);
    return;
  }

  var _wt = saT('quiz_loading_msg') || 'Welcome, {name}! I\'ve received your {pages} page(s).\n\nReading your document now...';
  var _wtMsg = _wt.replace('{name}', S.name||'').replace('{pages}', saPDFText ? '1 Excel file' : (S.extractedPageCount || S.images.filter(function(i){return i.type!=='excel';}).length || 0));
  addAI('👋 ' + _wtMsg);
  showTyping();

  const sys = buildSystem();
  const usr = buildUserMsg();

  try {
    const WORKER_URL = 'https://smartacademy-ai.kasongokimba.workers.dev';

    const res = await fetch(WORKER_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        _appSecret: APP_SECRET,
        apiKey:  getApiKey(),
        // Learner profile — Cloudflare uses this to build the prompt
        name:     S.name,
        level:    S.level,
        subject:  S.subject,
        lang:     S.lang,
        qCount:   S.qCount,
        diffMode: S.diffMode,  // doc | hard | easy
        code:     S.code,
        codeType: S.codeType,
        seed:     Date.now().toString(36) + Math.random().toString(36).slice(2,8),
        max_tokens: S.qCount > 15 ? 8000 : 6000,
        // Only the user message with images — NO prompt sent from browser
        messages: [{role:'user', content: usr}]
      })
    });
    const data = await res.json();
    S.isNewQRetry = false; // reset retry flag
    removeTyping();

    // Track OpenAI cost for this session
    if(data.usage && S.code){
      saaTrackCost(S.code, data.usage, 'quiz');
    }

    // Log response status for debugging
    console.log('[Quiz] Worker response status:', res.status);

    // Handle Worker errors
    if(!res.ok){
      addAI(`❌ **Server error (${res.status})**\n\nThe AI service returned an error.\n\nPlease try again in a moment.`);
      return;
    }

    // Handle OpenAI errors (wrong key, quota, etc.)
    if(data.error){
      const errMsg = data.error.message || data.error || 'Unknown error';
      addAI(`❌ **API Error:** ${errMsg}\n\nPlease check your OpenAI API key in the Admin panel.`);
      return;
    }

    const txt = data.choices?.[0]?.message?.content || '';
    let parsed;
    try{
      // Clean the response — remove markdown, extra text
      let clean = txt.replace(/```json/g,'').replace(/```/g,'').trim();
      // Find JSON object in response
      const jsonStart = clean.indexOf('{');
      const jsonEnd   = clean.lastIndexOf('}');
      if(jsonStart !== -1 && jsonEnd !== -1){
        clean = clean.substring(jsonStart, jsonEnd + 1);
      }
      // First attempt
      try{ parsed = JSON.parse(clean); }
      catch(e1){
        // JSON was likely truncated — try to salvage complete questions
        // Find last complete question by locating last "pageRef" field close
        let salvaged = clean;
        const lastComplete = salvaged.lastIndexOf('"pageRef"');
        if(lastComplete !== -1){
          const closeAfter = salvaged.indexOf('}', lastComplete);
          if(closeAfter !== -1){
            salvaged = salvaged.slice(0, closeAfter+1) + ']}';
            // Ensure outer wrapper
            if(!salvaged.includes('"questions"')) salvaged = '{"questions":[' + salvaged;
          }
        }
        try{ parsed = JSON.parse(salvaged); }
        catch(e2){ throw e1; } // re-throw original if salvage also fails
      }
    }catch(e){
      console.error('[Quiz] Parse error:', e.message, 'Response:', txt?.substring(0,200));
      // Check if it is an OpenAI error message
      if(txt && txt.length > 0){
        addAI(`⚠️ **${S.name}, I had trouble formatting the questions.**\n\nAI Response received but could not be parsed.\n\nPlease try again — this sometimes happens with complex documents.\n\nTip: Try uploading fewer pages (2-3 pages work best).`);
      } else {
        addAI(`⚠️ **${S.name}, I had trouble reading the document.**\n\nNo response received from AI.\n\nPlease check:\n✔ Internet connection\n✔ Document is clear and readable\n✔ Try again`);
      }
      return;
    }

    // Handle image quality feedback
    if(parsed.imageQuality === 'rejected'){
      addAI(`❌ **${S.name}, I cannot read this image reliably.**\n\n${parsed.qualityNote || 'The image appears too dark, blurry, or angled.'}\n\nPlease retake using these tips:\n✔ Good lighting, no shadows\n✔ Camera directly above the page\n✔ Page completely flat\n✔ Image in sharp focus\n\nUpload your new image and restart the session.`);
      return;
    }
    if(parsed.imageQuality === 'marginal'){
      addAI(`⚠️ **Image quality note:** ${parsed.qualityNote || 'This image is usable but not ideal. Some words may have been misread.'}\n\nI will proceed — but please review extracted content carefully.`);
    }

    // Flag uncertain sections if any
    if(parsed.uncertainSections && parsed.uncertainSections.length > 0){
      addAI(`🔍 **Uncertain sections detected:**\n${parsed.uncertainSections.map(s=>`• ${s}`).join('\n')}\n\nIf any of these look wrong, please restart and correct your image.`);
    }

    S.questions = parsed.questions||[];

    S.questions = S.questions.map(q => ({
      ...q,
      text: fixMath(q.text || q.question || ''),
      question: fixMath(q.question || ''),
      solution: fixMath(q.solution || ''),
      options: q.options ? Object.fromEntries(Object.entries(q.options).map(([k,v])=>[k,fixMath(String(v||''))])) : q.options,
      correctAnswer: fixMath(q.correctAnswer || ''),
      correct: q.correct || q.correctAnswer || ''
    }));

    // ── DUPLICATE OPTIONS CHECK — flag if the AI repeated an option's text ──
    // (the prompt explicitly forbids this, but LLMs occasionally do it anyway).
    // We don't auto-fix the duplicate (risky without another AI call), but we log
    // it clearly so it's visible during testing/QA rather than silently shipped.
    S.questions.forEach(function(q, qi){
      if(!q.options) return;
      var seen = {};
      Object.keys(q.options).forEach(function(letter){
        var val = String(q.options[letter]||'').trim().toLowerCase();
        if(!val) return;
        if(seen[val]){
          console.warn('[Quiz] Duplicate option text detected in Q'+(qi+1)+': option '+letter+' repeats option '+seen[val]+' ("'+q.options[letter]+'")');
        } else {
          seen[val] = letter;
        }
      });
    });

    // ── ANSWER ON PAGE SAFETY — if question needs calculation, never hide page ──
    S.questions.forEach(function(q){
      if(!q.answerOnPage) return;
      // If internalProof has arithmetic (=, +, -, ×, ÷), it's a calculation → don't hide
      var proof = q.internalProof || '';
      if(/[+\-×÷=]/.test(proof) || /\d+\s*[\+\-\*\/]\s*\d+/.test(q.text||'')){
        q.answerOnPage = false;
      }
    });

    // ── PROOF CROSS-CHECK — fix AI calculation vs answer mismatches ──
    // Resolves an option string to a single numeric value ONLY if the ENTIRE
    // string matches a known single-value shape (number, fraction, π-fraction,
    // with optional unit/degree/percent). Multi-term expressions (polynomials,
    // equations with variables, "undefined"/"DNE"/limits) return null and are
    // safely skipped — never partially parsed, so no garbage/false matches.
    var normalizeToValue = function(str){
      var s = String(str||'').trim();
      var m;
      // nπ/m, π/m, nπ  (e.g. "π/4", "-π/3", "2π/3", "π")
      m = s.match(/^(-?)(\d*\.?\d*)\s*π\s*(?:\/\s*(\d+(?:\.\d+)?))?$/);
      if(m && (m[2] || s.indexOf('π') !== -1)){
        var sign = m[1] ? -1 : 1;
        var coef = m[2] ? parseFloat(m[2]) : 1;
        var denom = m[3] ? parseFloat(m[3]) : 1;
        return sign * coef * Math.PI / denom;
      }
      // plain fraction a/b with optional unit (e.g. "2/4", "3/4 cm", "-2/4")
      m = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*[a-zA-Z°%]{0,4}$/);
      if(m) return parseFloat(m[1]) / parseFloat(m[2]);
      // plain number with optional unit/degree/percent (e.g. "70°", "-4.5", "12.3 cm")
      m = s.match(/^(-?\d+(?:\.\d+)?)\s*[a-zA-Z°%]{0,4}$/);
      if(m) return parseFloat(m[1]);
      return null; // anything else (polynomials, equations, "undefined", "DNE", limits) → skip safely
    };

    S.questions.forEach(function(q){
      if(!q.internalProof || !q.correct || !q.options) return;

      // Only proceed if ALL options resolve to single values — otherwise this is
      // an algebraic/complex-answer question and we leave the AI's answer untouched.
      var allResolved = Object.values(q.options).every(function(opt){
        return normalizeToValue(opt) !== null;
      });
      if(!allResolved) return;

      // Extract the proof's final result the same way (handles "= 70", "= 2/4", "= π/4")
      var proofMatches = q.internalProof.match(/=\s*(-?[^=\n]+)$/);
      var calcResult = proofMatches ? normalizeToValue(proofMatches[1].trim().split(/[,.;]\s|$/)[0]) : null;
      if(calcResult === null){
        // fallback: try last "= <value>" segment more loosely
        var segs = q.internalProof.split('=');
        calcResult = normalizeToValue(segs[segs.length-1].trim());
      }
      if(calcResult === null) return;

      var chosenVal = normalizeToValue(q.options[q.correct]);
      if(chosenVal === null || Math.abs(chosenVal - calcResult) < 0.0001) return; // already correct

      var corrected = null;
      Object.keys(q.options).forEach(function(letter){
        var v = normalizeToValue(q.options[letter]);
        if(v !== null && Math.abs(v - calcResult) < 0.0001) corrected = letter;
      });
      if(corrected && corrected !== q.correct){
        console.warn('[Quiz] Proof mismatch corrected: '+q.correct+'→'+corrected+' proof='+calcResult+' chosen='+chosenVal);
        q.correct = corrected;
        q.correctAnswer = q.options[corrected];
      }
    });

    // ── RANDOMIZE questions and options ───────────
    // Shuffle question order
    for(let i = S.questions.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [S.questions[i], S.questions[j]] = [S.questions[j], S.questions[i]];
    }

    // Shuffle options within each question (keeping correct field updated)
    S.questions.forEach(q => {
      const letters = ['A','B','C','D','E'];
      const entries = letters.map(l => [l, q.options[l]]).filter(([,v]) => v);
      // Shuffle entries
      for(let i = entries.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [entries[i], entries[j]] = [entries[j], entries[i]];
      }
      // Rebuild options with new letters
      const correctValue = q.options[q.correct];
      const newOptions = {};
      entries.forEach(([, val], idx) => {
        newOptions[letters[idx]] = val;
      });
      q.options = newOptions;
      // Update correct field to new letter
      const newCorrectLetter = Object.keys(newOptions).find(k => newOptions[k] === correctValue);
      if(newCorrectLetter) q.correct = newCorrectLetter;
    });

    // Trim to requested count if AI returned more
    if(S.questions.length > S.qCount){
      S.questions = S.questions.slice(0, S.qCount);
    }

    // ── ASSIGN SUB-PAGE LABELS (Page 1 Q1, Page 1 Q2) ──────────
    // When multiple questions come from the same page, label them Page 1 Q1, Page 1 Q2 etc.
    // Assign simple page labels — use actual PDF page number if available
    S.questions.forEach(function(q){
      var pg = parseInt(q.pageRef)||0;
      if(pg > 0){
        // pageRef is 1-based index into S.images array
        var imgEntry = S.images[pg-1];
        var actualPage = (imgEntry && imgEntry.pdfPage) ? imgEntry.pdfPage : pg;
        q.pageLabel = 'Page ' + actualPage;
      } else {
        q.pageLabel = '';
      }
    });

    // Warn if AI returned fewer questions than requested
    if(S.questions.length < S.qCount){
      console.warn(`[Quiz] AI returned ${S.questions.length} questions, expected ${S.qCount}`);
    }

    // Check we actually have questions
    if(!S.questions.length){
      addAI(`⚠️ **${S.name}, I could not generate questions from this document.**\n\nThis can happen when:\n• The image is unclear or too dark\n• The document has very little text\n• The content is not suitable for quiz questions\n\nPlease try:\n✔ Upload a clearer image\n✔ Upload more pages\n✔ Try a different document`);
      return;
    }

    const topic = parsed.topic||S.subject;
    S.quizActive = true;
    addAI(`✅ **Document locked, ${S.name}!**\n\n📄 **Topic:** ${topic}\n📝 **Questions:** ${S.questions.length}\n\nLet's begin! 🎯`);
    // Mode B — warn upfront that no diagrams available
    if(S.diffMode === 'hard'){
      setTimeout(function(){
        addAI(`📝 **Note:** These questions go beyond your document.\n\nDiagrams are not available in this mode — read each question carefully and answer from the description only.`);
      }, 800);
    }
    
    // Call presentQ directly - no setTimeout
    try{
      presentQ(0);
    }catch(e){
      toast('presentQ error: '+e.message,'err');
      console.error('presentQ failed:', e);
    }
  } catch(err){
    removeTyping();
    addAI(`❌ Connection error. Check your internet and try again.\n\n_${err.message}_`);
  }
}

// ── PRESENT CURRENT QUESTION ───────────────────────────────────────
function presentQ(idx){
  if(idx>=S.questions.length){endQuiz();return;}
  S.currentQ=idx;
  selectedOpt=null;
  hintUsed=false;
  updateProg();

  // Clear stale hints/challenges/explanations from the PREVIOUS question.
  // Without this, the chat-box (sticky-positioned to the right on wide screens)
  // keeps showing old AI messages (hints, challenge responses, detailed solutions)
  // stacked on top of each other as the learner progresses through questions —
  // making it look like explanations belong to the wrong question.
  var chatBox = document.getElementById('chat-box');
  if(chatBox) chatBox.innerHTML = '';

  const q=S.questions[idx];
  if(!q||!q.text||!q.options){
    if(idx+1<S.questions.length)presentQ(idx+1);else endQuiz();return;
  }
  const opts=Object.entries(q.options).filter(([,v])=>v);
  if(!opts.length){
    if(idx+1<S.questions.length)presentQ(idx+1);else endQuiz();return;
  }

  const qn=`Q${idx+1} of ${S.qCount}`;
  const hasTri = false; // Drawings disabled — removed for clean UX
  const hasSVG = false;
  const hasVisual = false;
  const pageRef = parseInt(q.pageRef)||0;
  const pageLabel = q.pageLabel || (pageRef > 0 ? 'Page '+pageRef : '');
  const answerOnPage = q.answerOnPage===true;
  const ui=document.getElementById('question-ui');
  if(!ui)return;

  let html='';
  html+=`<div style="background:linear-gradient(135deg,#1e3a8a,#1e40af);border-radius:14px;padding:20px;color:#fff;font-family:sans-serif;margin-bottom:12px;">`;
  // Clean documentReference — ignore if it just says "Question X" (AI artifact)
  const docRef = (q.documentReference||'').replace(/^question\s*\d+[a-z]?$/i,'').trim();
  html+=`<div style="margin-bottom:12px;font-size:12px;color:#93c5fd;">${qn}${pageLabel ? ` &nbsp;·&nbsp; 📄 ${pageLabel}` : (docRef ? ` &nbsp;·&nbsp; 📄 ${docRef}` : '')}</div>`;
  if(hasTri||hasSVG) html+=`<div id="drawing-panel-${idx}" style="margin-bottom:12px;background:#0f172a;border-radius:8px;padding:6px;max-width:320px;"><div id="visual-content-${idx}"></div></div>`;
  // quizFracDisplay is defined globally (see top-level declaration before presentQ)
  // so it can also be used by the results-review screen (AI calculation, previous question, etc.)
  html+=`<div style="font-size:16px;font-weight:600;line-height:1.6;margin-bottom:16px;">${quizFracDisplay(q.text)}</div>`;

  // Mode B — no View Page, show note instead
  if(S.diffMode === 'hard'){
    html+=`<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#f59e0b;font-weight:600;">
      📝 These questions go beyond your document. Answer from the description only — no diagram available.
    </div>`;
  } else if(pageRef > 0 && S.images && S.images[pageRef-1]){
    // Mode A — View Page always shown, always blurred
    var imgEntry2 = S.images[pageRef-1];
    var actualPg = (imgEntry2 && imgEntry2.pdfPage) ? imgEntry2.pdfPage : pageRef;
    html+=`<button onclick="viewQuestionPage(${idx})" id="btn-view-page-${idx}"
      style="margin-bottom:14px;padding:8px 16px;background:rgba(0,212,224,0.15);border:1px solid rgba(0,212,224,0.4);border-radius:8px;color:#00d4e0;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;">
      📄 View Page ${actualPg}
    </button>`;
    html+=`<div id="page-viewer-${idx}" style="display:none;margin-bottom:14px;border-radius:10px;overflow:hidden;position:relative;"></div>`;
  }

  html+=`<div id="opts">`;
  opts.forEach(([l,t])=>{
    const st=quizFracDisplay(t);
    html+=`<div onclick="selectOpt('${l}')" id="opt-${l}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;cursor:pointer;margin-bottom:8px;color:#fff;font-size:14px;">`;
    html+=`<span id="badge-${l}" style="width:26px;height:26px;min-width:26px;background:rgba(255,255,255,0.15);border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;">${l}</span>`;
    html+=`<span>${st}</span></div>`;
  });
  html+=`</div>`;
  html+=`<button id="btn-sub" onclick="submitAns()" style="margin-top:12px;width:100%;padding:12px;background:#374151;color:#9ca3af;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:not-allowed;">${saT("select_first")||"Select an answer first"}</button>`;
  if(quizVoiceMode){
    html+=`<button onclick="quizStartListening()" style="margin-top:8px;width:100%;padding:10px;background:linear-gradient(135deg,rgba(124,58,237,0.3),rgba(124,58,237,0.1));border:1px solid rgba(124,58,237,0.5);border-radius:8px;color:#a78bfa;font-size:13px;font-weight:700;cursor:pointer;" id="btn-mic-quiz">🎤 Tap to speak your answer (A, B, C or D)</button>`;
  }
  html+=`</div>`;

  ui.innerHTML=html;

  // Auto-read question if enabled
  if(quizAutoRead){
    setTimeout(function(){ quizReadQuestion(q.text||'', opts); }, 300);
  } else if(quizVoiceMode){
    setTimeout(quizStartListening, 300);
  }

  // Render LaTeX math in question
  if(window.MathJax && MathJax.typesetPromise){
    MathJax.typesetPromise([ui]).catch(function(){});
  }
  if(hasTri||hasSVG){
    const panel=document.getElementById(`drawing-panel-${idx}`);
    const vc=document.getElementById(`visual-content-${idx}`);
    if(panel&&vc){
      if(hasTri){
        const triHTML=drawTriangle(q.triangle);
        if(triHTML){panel.style.display='block';vc.innerHTML=triHTML;}
        else{
          panel.style.display='none';
          // Also hide View Page button since diagram is unavailable
          const vpBtn=document.getElementById(`btn-view-page-${idx}`);
          const vpViewer=document.getElementById(`page-viewer-${idx}`);
          if(vpBtn) vpBtn.style.display='none';
          if(vpViewer) vpViewer.style.display='none';
        }
      } else if(hasSVG){panel.style.display='block';vc.innerHTML=renderShapeSVG(q.visual);}
    }
  }

  window.scrollTo(0,0);
  toast(`Q${idx+1} loaded ✅`,'ok');
}

// ── TOGGLE SOURCE-PAGE VIEWER FOR A QUESTION ──────────────────────
function viewQuestionPage(idx){
  const q = S.questions[idx];
  if(!q) return;
  const pageRef = parseInt(q.pageRef)||0;
  const answerOnPage = q.answerOnPage===true;
  const viewer = document.getElementById(`page-viewer-${idx}`);
  const btn = document.getElementById(`btn-view-page-${idx}`);
  if(!viewer) return;

  // Toggle
  if(viewer.style.display==='block'){
    viewer.style.display='none';
    if(btn) btn.textContent=`📄 View Page ${pageRef}`;
    return;
  }

  const img = S.images[pageRef-1];
  if(!img) return;

  // Mode A — blur only if answer is on this page
  const alwaysBlur = S.diffMode !== 'hard';
  if(answerOnPage){
    // Answer directly visible on page — do NOT show page at all
    viewer.innerHTML=`
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:24px;margin-bottom:8px;">🔒</div>
        <div style="font-size:13px;font-weight:700;color:#ef4444;">Page hidden</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;">The answer is visible on this page — try to answer without it first.</div>
      </div>`;
  } else {
    // Answer not on page — show normally
    viewer.innerHTML=`
      <img src="${img.data}" style="width:100%;display:block;border-radius:10px;" alt="Page ${pageRef}">
      <div style="font-size:11px;color:rgba(255,255,255,0.5);text-align:center;margin-top:6px;">Page ${pageRef} — answer requires calculation, not shown here</div>`;
  }

  viewer.style.display='block';
  if(btn) btn.textContent=`📄 Hide ${q.pageLabel || 'Page '+pageRef}`;
  viewer.scrollIntoView({behavior:'smooth',block:'nearest'});
}


// ── TRIANGLE DIAGRAM RENDERER (for geometry questions) ────────────
function drawTriangle(tri){
  if(!tri||typeof tri!=='object') return '';
  // Get keys — support any vertex labels (A/B/C, J/K/L, P/Q/R etc.)
  var keys = Object.keys(tri).filter(function(k){ return k !== 'unknown'; });
  if(keys.length < 3) return '';
  var kA=keys[0], kB=keys[1], kC=keys[2];
  var ang_A=parseFloat(tri[kA])||0,ang_B=parseFloat(tri[kB])||0,ang_C=parseFloat(tri[kC])||0;
  var unk=(tri.unknown||'').toUpperCase();
  if(Math.abs(ang_A+ang_B+ang_C-180)>2) return '';
  var W=300,H=200,mg=42,bY=H-mg,bL=mg,bR=W-mg,bN=bR-bL;
  function d2r(d){return d*Math.PI/180;}
  var Ax,Ay,Bx,By,Cx,Cy;
  var r90A=Math.abs(ang_A-90)<0.5,r90B=Math.abs(ang_B-90)<0.5,r90C=Math.abs(ang_C-90)<0.5;
  if(r90C){
    Cx=bL;Cy=bY;Bx=bR;By=bY;
    var hC=bN*Math.tan(d2r(ang_B));
    if(hC>H-mg*2){var sc=(H-mg*2)/hC;hC=Math.round(hC*sc);Bx=bL+Math.round(bN*sc);}
    Ax=bL;Ay=bY-Math.round(hC);
  } else if(r90B){
    Cx=bL;Cy=bY;Bx=bR;By=bY;
    var hB=bN*Math.tan(d2r(ang_A));
    if(hB>H-mg*2){var sb=(H-mg*2)/hB;hB=Math.round(hB*sb);Bx=bL+Math.round(bN*sb);}
    Ax=bL;Ay=bY-Math.round(hB);
  } else if(r90A){
    Ax=bL;Ay=mg;Cx=bL;Cy=bY;
    var wA=(bY-mg)*Math.tan(d2r(ang_B));
    if(wA>W-mg*2)wA=W-mg*2;
    Bx=bL+Math.round(wA);By=mg;
  } else {
    Cx=bL;Cy=bY;Bx=bR;By=bY;
    var tC=Math.tan(d2r(ang_C)),tB2=Math.tan(d2r(ang_B)),den=tC+tB2;
    var apx=bL+Math.round(bN*tC/den),apy=bY-Math.round(bN*tC*tB2/den);
    if(apy<mg)apy=mg;
    Ax=apx;Ay=apy;
    if(ang_B>ang_C){var tmp=Cx;Cx=Bx;Bx=tmp;}
  }
  var gcx=(Ax+Bx+Cx)/3,gcy=(Ay+By+Cy)/3;
  function pOut(px,py,d){var dx=px-gcx,dy=py-gcy,l=Math.sqrt(dx*dx+dy*dy)||1;return[Math.round(px+dx/l*d),Math.round(py+dy/l*d)];}
  function pIn(px,py,d){var dx=gcx-px,dy=gcy-py,l=Math.sqrt(dx*dx+dy*dy)||1;return[Math.round(px+dx/l*d),Math.round(py+dy/l*d)];}
  var al=pOut(Ax,Ay,26),bl=pOut(Bx,By,26),cl=pOut(Cx,Cy,26);
  var ai=pIn(Ax,Ay,30),bi=pIn(Bx,By,30),ci=pIn(Cx,Cy,30);
  var KC='#93c5fd', UC='#f59e0b', LC='#ffffff';
  function aval(l,v){
    if(l.toUpperCase()===unk) return '?';
    // Right angles shown by square marker only — no label
    var r90map = {kA:r90A, kB:r90B, kC:r90C};
    if((l===kA&&r90A)||(l===kB&&r90B)||(l===kC&&r90C)) return '';
    return v+'°';
  }
  function acol(l){return l.toUpperCase()===unk?UC:KC;}
  var rbox='',bs=14;
  if(r90C) rbox='<rect x="'+Cx+'" y="'+(Cy-bs)+'" width="'+bs+'" height="'+bs+'" fill="none" stroke="#10b981" stroke-width="2"/>';
  else if(r90B) rbox='<rect x="'+(Bx-bs)+'" y="'+(By-bs)+'" width="'+bs+'" height="'+bs+'" fill="none" stroke="#10b981" stroke-width="2"/>';
  else if(r90A) rbox='<rect x="'+Ax+'" y="'+Ay+'" width="'+bs+'" height="'+bs+'" fill="none" stroke="#10b981" stroke-width="2"/>';
  var avA=aval(kA,ang_A);
  var avB=aval(kB,ang_B);
  var avC=aval(kC,ang_C);
  return '<div style="text-align:left;"><div style="display:inline-block;width:100%;max-width:300px;background:#0f172a;border:1px solid rgba(59,130,246,0.3);border-radius:10px;padding:6px;box-sizing:border-box;">'
    +'<svg viewBox="0 0 '+W+' '+H+'" width="100%" xmlns="http://www.w3.org/2000/svg">'
    +'<rect width="'+W+'" height="'+H+'" fill="#0f172a" rx="10"/>'
    +'<polygon points="'+Ax+','+Ay+' '+Bx+','+By+' '+Cx+','+Cy+'" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linejoin="round"/>'
    +rbox
    +'<text x="'+al[0]+'" y="'+al[1]+'" text-anchor="middle" fill="'+LC+'" font-size="17" font-weight="bold" font-family="sans-serif">'+kA+'</text>'
    +'<text x="'+bl[0]+'" y="'+bl[1]+'" text-anchor="middle" fill="'+LC+'" font-size="17" font-weight="bold" font-family="sans-serif">'+kB+'</text>'
    +'<text x="'+cl[0]+'" y="'+cl[1]+'" text-anchor="middle" fill="'+LC+'" font-size="17" font-weight="bold" font-family="sans-serif">'+kC+'</text>'
    +'<text x="'+ai[0]+'" y="'+(ai[1]+5)+'" text-anchor="middle" fill="'+acol(kA)+'" font-size="14" font-weight="bold" font-family="sans-serif">'+avA+'</text>'
    +'<text x="'+bi[0]+'" y="'+(bi[1]+5)+'" text-anchor="middle" fill="'+acol(kB)+'" font-size="14" font-weight="bold" font-family="sans-serif">'+avB+'</text>'
    +'<text x="'+ci[0]+'" y="'+(ci[1]+5)+'" text-anchor="middle" fill="'+acol(kC)+'" font-size="14" font-weight="bold" font-family="sans-serif">'+avC+'</text>'
    +'</svg>'
    +'<div style="font-size:10px;color:rgba(255,255,255,0.35);text-align:right;padding:2px 4px;font-style:italic;">Not drawn to scale</div>'
    +'</div></div>';
}

// ── OPTION SELECTION (A/B/C/D/E) ──────────────────────────────────
function selectOpt(l){
  selectedOpt = l;

  // Reset ALL option divs — deselect everything first
  ['A','B','C','D','E'].forEach(function(opt){
    var el = document.getElementById('opt-'+opt);
    if(el){
      el.style.background = 'rgba(255,255,255,0.08)';
      el.style.border = '1px solid rgba(255,255,255,0.15)';
      el.style.boxShadow = 'none';
      var badge = el.querySelector('span');
      if(badge){ badge.style.background = 'rgba(255,255,255,0.12)'; badge.style.color = '#fff'; }
    }
  });
  // Also reset any buttons inside #opts as fallback
  document.querySelectorAll('#opts button, #opts div[id^="opt-"]').forEach(function(b){
    b.style.background = 'rgba(255,255,255,0.08)';
    b.style.border = '1px solid rgba(255,255,255,0.15)';
  });

  // Highlight ONLY the selected option
  var sel = document.getElementById('opt-'+l);
  if(sel){
    sel.style.background = 'rgba(255,255,255,0.22)';
    sel.style.border = '2px solid #ffffff';
    sel.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.1)';
    var badge = sel.querySelector('span');
    if(badge){ badge.style.background = '#ffffff'; badge.style.color = '#1e40af'; }
  }

  // Enable submit
  var sub = document.getElementById('btn-sub');
  if(sub){
    sub.disabled = false;
    sub.style.opacity = '1';
    sub.style.cursor = 'pointer';
  }
}

// ── CONFIDENCE SELECTION (SURE / GUESS) ───────────────────────────
function setConf(c){
  selectedConf=c;
  document.getElementById('cf-sure').classList.toggle('active',c==='SURE');
  document.getElementById('cf-guess').classList.toggle('active',c==='GUESS');
}

// ── REQUEST A HINT (via AI) ────────────────────────────────────────
async function reqHint(){
  if(hintUsed){toast('Only one hint per question!','err');return;}
  hintUsed=true;
  document.getElementById('btn-hint').disabled=true;
  document.getElementById('btn-hint').textContent='💡 Used';
  S.hints.push(S.currentQ);
  const q = S.questions[S.currentQ];
  const apiKey = getApiKey();
  showTyping();
  try{
    const res = await callAPI(`The learner needs a hint for: "${q.text}". Subject: ${S.subject}. Give a gentle 1-2 sentence hint in ${S.lang} that guides without revealing the answer.`);
    removeTyping();
    addAI(`💡 **Hint for ${S.name}:**\n\n${fixFreeTextMath(res)}`);
  }catch{
    removeTyping();
    addAI('💡 Review the key definitions in your document for this topic.');
  }
}

// ── CHALLENGE A QUESTION AS FLAWED (via AI) ───────────────────────
async function challengeQ(){
  const q = S.questions[S.currentQ];
  addUser('❓ I want to challenge this question.');
  showTyping();
  try{
    const res = await callAPI(`A learner challenges: "${q.text}" with options ${JSON.stringify(q.options)}. Correct: ${q.correct}. Is this question fair and from the document? Respond in ${S.lang}. If flawed start with QUESTION_FLAWED.`);
    removeTyping();
    if(res.startsWith('QUESTION_FLAWED')){
      addAI(`Great catch, **${S.name}**! 🎯 Replacing this question...`);
      await replaceQ();
    } else {
      addAI(`I've re-checked, **${S.name}**. The question stands:\n\n${fixFreeTextMath(res)}`);
    }
  }catch{removeTyping();addAI('Unable to re-check. Please proceed with your best answer.');}
}

// ── REPLACE CURRENT QUESTION WITH A NEW ONE (via AI) ──────────────
async function replaceQ(){
  try{
    const res = await callAPI(`Generate one replacement ${S.questions[S.currentQ].difficulty} difficulty question for ${S.subject} at ${S.level} in ${S.lang}. Return ONLY JSON: {"text":"...","difficulty":"...","options":{"A":"...","B":"...","C":"...","D":"...","E":"..."},"correct":"A","explanation":"...","wrongExplanation":"..."}`);
    const newQ = JSON.parse(res.replace(/```json|```/g,'').trim());
    S.questions[S.currentQ]=newQ;
    presentQ(S.currentQ);
  }catch{addAI('Unable to replace. Moving to next question.');moveNext();}
}

// ── SUBMIT ANSWER FOR CURRENT QUESTION ─────────────────────────────
async function submitAns(){
  if(!selectedOpt){toast('Please select an answer','err');return;}
  const q = S.questions[S.currentQ];

  // ── BULLETPROOF CORRECT DETECTION ─────────────

  // Step 1: Normalize AI correct field
  let correctLetter = (q.correct || '').toString().trim().toUpperCase();
  const lm = correctLetter.match(/[A-E]/);
  correctLetter = lm ? lm[0] : correctLetter;

  // Step 2: Get text values of selected and correct options
  const selectedText = (q.options[selectedOpt] || '').toString().trim();
  const correctText  = (q.options[correctLetter] || '').toString().trim();

  // Step 3: Letter match — primary check
  const letterMatch = selectedOpt === correctLetter;

  // Step 4: Text match — backup if letter mapping fails
  const textMatch = selectedText.length > 0 && correctText.length > 0 &&
    selectedText.toLowerCase() === correctText.toLowerCase();

  // CORRECT = letter matches OR exact text matches
  // Do NOT use numeric matching — numbers appear in proof working and cause false positives
  const correct = letterMatch || textMatch;

  // Update q.correct to normalized letter for display
  q.correct = correctLetter;

  const conf = selectedConf || 'not stated';

  // Disable all option buttons and divs after submission
  document.querySelectorAll('#opts button').forEach(function(b){
    b.disabled=true; b.style.cursor='default';
  });
  ['A','B','C','D','E'].forEach(function(opt){
    var el = document.getElementById('opt-'+opt);
    if(el){ el.style.pointerEvents='none'; el.style.cursor='default'; }
  });
  const subEl = document.getElementById('btn-sub');
  if(subEl) subEl.disabled=true;

  // Highlight correct and wrong using inline styles
  const correctEl = document.getElementById(`opt-${correctLetter}`);
  if(correctEl){
    correctEl.style.background = 'rgba(16,185,129,0.25)';
    correctEl.style.border = '2px solid #10b981';
    const badge = correctEl.querySelector('span:first-child');
    if(badge){ badge.style.background = '#10b981'; badge.style.color = '#fff'; }
  }
  if(!correct){
    const wrongEl = document.getElementById(`opt-${selectedOpt}`);
    if(wrongEl){
      wrongEl.style.background = 'rgba(239,68,68,0.2)';
      wrongEl.style.border = '2px solid #ef4444';
      const badge = wrongEl.querySelector('span:first-child');
      if(badge){ badge.style.background = '#ef4444'; badge.style.color = '#fff'; }
    }
  }

  // Record answer
  S.answers.push({qIdx:S.currentQ, chosen:selectedOpt, correct, conf, hint:S.hints.includes(S.currentQ)});

  // Update streak
  if(correct){S.streak++;S.maxStreak=Math.max(S.maxStreak,S.streak);}
  else{
    const prev=S.streak; S.streak=0;
    if(prev>=3) addAI(`Your ${prev}-answer streak ends here — keep going! 💪`);
  }
  updateStreak();

  // Running score
  const totalAnswered = S.answers.length;
  const totalCorrect  = S.answers.filter(a=>a.correct).length;
  const totalQ        = S.questions.length;
  const pct           = Math.round((totalCorrect/totalAnswered)*100);
  const resultColor   = correct ? '#10b981' : '#ef4444';

  // Score badge — append to question-ui directly
  const ui = document.getElementById('question-ui');
  if(ui){
    const badge = document.createElement('div');
    badge.style.cssText = `display:flex;align-items:center;justify-content:space-between;
      margin-top:14px;padding:14px 18px;
      background:${correct?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)'};
      border:2px solid ${resultColor};border-radius:12px;flex-wrap:wrap;gap:10px;`;
    badge.innerHTML = `
      <div style="font-size:20px;font-weight:800;color:${resultColor};">
        ${correct?('✅ '+(saT('correct')||'CORRECT')):('❌ '+(saT('wrong_word')||'WRONG'))}
      </div>
      <div style="text-align:right;">
        <div style="font-size:22px;font-weight:800;color:#3b82f6;">${totalCorrect} / ${totalQ}</div>
        <div style="font-size:16px;font-weight:700;color:${pct>=50?'#10b981':'#ef4444'}">${pct}%</div>
      </div>`;
    // Append to the first child div of question-ui
    const card = ui.firstElementChild;
    if(card) card.appendChild(badge);
    else ui.appendChild(badge);
  }

  // Build AI feedback
  showTyping();
  await buildFeedback(q, correct, conf);
  removeTyping();
  checkMilestone();

  const delay = correct ? 2200 : 4400;
  setTimeout(()=>{
    const next = S.currentQ + 1;
    if(next < S.questions.length){ presentQ(next); }
    else{ document.getElementById('question-ui').innerHTML=''; endQuiz(); }
  }, delay);
}

// ── BUILD FEEDBACK (correct/incorrect explanation + confidence) ───
async function buildFeedback(q, correct, conf){
  try{
    const totalCorrect = S.answers.filter(a=>a.correct).length;
    const totalQ       = S.questions.length;
    const pct          = Math.round((totalCorrect / S.answers.length) * 100);
    const scoreLine    = `\n\n📊 **${saT('score_lbl')||'Score:'} ${totalCorrect} / ${totalQ} — ${pct}%**`;

    const d = q._debug || {};

    // Safe fallbacks for all values
    const selOpt  = d.selectedOpt  || selectedOpt  || '?';
    const selText = d.selectedText || (q.options && q.options[selOpt]) || '?';
    const corLet  = d.correctLetter || q.correct || '?';
    const corText = d.correctText  || (q.options && q.options[corLet]) || '?';

    const prevQ      = `📌 **${saT('prev_q')||'Previous question:'}**\n${quizFracDisplay(q.text || '')}`;
    const yourAns    = `\n\n👤 **${saT('your_ans')||'Your answer:'}** ${selOpt}) ${quizFracDisplay(selText)}`;
    const correctAns = `\n✅ **${saT('correct_ans')||'Correct answer:'}** ${corLet}) ${quizFracDisplay(corText)}`;

    const proof = q.internalProof
      ? `\n\n🔢 **${saT('ai_calc')||'AI calculation:'}**\n${quizFracDisplay(q.internalProof)}`
      : '';

    const comparison = correct
      ? `\n⚖️ **${quizFracDisplay(selText)} = ${quizFracDisplay(corText)} ✅**`
      : `\n⚖️ **${quizFracDisplay(selText)} ≠ ${quizFracDisplay(corText)} ❌**`;

    const resultLine = correct
      ? `\n\n🎯 **${saT('you_right')||'You are RIGHT!'}**`
      : `\n\n❌ **${saT('you_wrong')||'You are WRONG.'}**`;

    const solution = (!correct && q.explanation)
      ? `\n\n📖 **${saT('solution_lbl')||'Solution:'}** ${quizFracDisplay(typeof fixMath==='function'?fixMath(q.explanation):q.explanation)}`
      : '';

    // Request detailed solution from AI if wrong
    if(!correct){
      setTimeout(async function(){
        try {
          var detailPrompt = `The student got this wrong.\n\nQuestion: ${q.text}\nCorrect answer: ${corLet}) ${corText}\n\nGive a detailed step-by-step solution in ${S.lang}. Show all working clearly. Explain WHY each step is done. Suitable for a ${S.level} student studying ${S.subject}.`;
          var res = await fetch('https://smartacademy-ai.kasongokimba.workers.dev', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              action: 'tutor',
              name:    S.name,
              level:   S.level,
              subject: S.subject,
              lang:    S.lang || 'English',
              question: detailPrompt,
              history: [],   // no history — clean standalone call
              images:  []    // no images needed for solution
            })
          });
          var data = await res.json();
          if(data.answer){
            var solAnswer = data.answer;
            // Extract confidence score
            var solConfMatch = solAnswer.match(/\[CONFIDENCE:(\d+)\]/i);
            var solConfidence = solConfMatch ? Math.min(100,Math.max(0,parseInt(solConfMatch[1]))) : null;
            if(solConfMatch) solAnswer = solAnswer.replace(/\s*\[CONFIDENCE:\d+\]/i,'').trimEnd();
            // Use shared helper — same defensive math-formatting fix applied to hints/challenges
            var stillStuckTip = '\n\n<span style="color:#06b6d4;font-style:italic;">💬 '+(saT('still_stuck_tip')||'Still not clear? Scroll down and ask the same question to your virtual tutor (**Ask the Tutor**) for a more detailed, conversational explanation. You can also switch to Claude using the toggle there to see a different explanation style.')+'</span>';
            addAI(`📐 **${saT('solution_lbl')||'Detailed Solution:'}**\n\n${fixFreeTextMath(solAnswer)}${stillStuckTip}`);
            // Show confidence bar
            if(solConfidence !== null){
              var tutorBox = document.getElementById('chat-box');
              if(tutorBox) renderConfidenceBar(solConfidence, tutorBox);
            }
          }
        } catch(e){ console.warn('Detailed solution error:', e); }
      }, 1000);
    }

    if(correct){
      addAI(`${prevQ}${yourAns}${correctAns}${proof}${comparison}${resultLine}${scoreLine}`);
    } else {
      addAI(`${prevQ}${yourAns}${correctAns}${proof}${comparison}${resultLine}${solution}${scoreLine}\n\n📌 ${saT('may_retry')||'This may reappear in retry!'} 💪`);
    }
  } catch(err){
    // Safety net — even if feedback fails, quiz must continue
    console.warn('buildFeedback error:', err);
    addAI(correct ? `🎯 **Correct!** Well done, ${S.name}!` : `❌ **Wrong.** Keep going, ${S.name}! 💪`);
  }
}

// ── STREAK MILESTONE CELEBRATION MESSAGES ─────────────────────────
function checkMilestone(){
  const msgs={3:`🔥 3 correct in a row, ${S.name}! On fire!`,5:`⚡ 5 straight correct! Incredible, ${S.name}!`,7:`🌟 7 in a row! You're mastering this, ${S.name}!`};
  if(msgs[S.streak])setTimeout(()=>addAI(msgs[S.streak]),200);
}

// ── END QUIZ SESSION ───────────────────────────────────────────────
function endQuiz(){
  S.quizActive = false;
  const c=S.answers.filter(a=>a.correct).length;
  const t=S.answers.length;
  const p=t>0 ? Math.round((c/t)*100) : 0;
  // Store results globally so results page can recover them
  window._lastResults = {c,t,p};
  addAI(`🎉 **Session complete, ${S.name}!**\n\n**Score: ${c}/${t} — ${p}%**\n\nGenerating your results...`);
  // Save first question text before anything resets
  S._sampleQuestion = (S.questions && S.questions.length) ? (S.questions[0].text||S.questions[0].question||S.questions[0].q||'') : '';
  saaProgressSave({score:c, total:t, pct:p, subject:S.docName||'', date:Date.now()});
  updateStudyStreak(); // update streak on quiz completion
  // Show celebration for 85%+
  setTimeout(function(){ showCelebration(p, S.name); }, 1600);
  stopQuizTimer(); // stop timer on completion
  setTimeout(()=>{
    showPage('page-results');
    buildResults(c,t,p);
    // Double-check after render in case DOM wasn't ready
    setTimeout(function(){
      var scoreEl = document.getElementById('res-score');
      if(scoreEl && scoreEl.textContent === '0/0' && t > 0){
        buildResults(c,t,p);
      }
    }, 300);
  },1500);
}

// ── GENERIC WORKER API CALL HELPER (quiz-only: hint/challenge/replace) ──
async function callAPI(prompt){
  const WORKER_URL = 'https://smartacademy-ai.kasongokimba.workers.dev';

  const res = await fetch(WORKER_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      _appSecret: APP_SECRET,
      apiKey:  getApiKey(), // fallback if Cloudflare key fails
      name:    S.name,
      level:   S.level,
      subject: S.subject,
      lang:    S.lang,
      qCount:  S.qCount,
      diffMode: S.diffMode,
      max_tokens: 800,
      messages:[{role:'user', content:prompt}]
    })
  });

  const data = await res.json();
  if(data.usage && S.code) saaTrackCost(S.code, data.usage, 'tutor');
  if(data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || '';
}
