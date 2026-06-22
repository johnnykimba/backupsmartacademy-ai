// ════════════════════════════════════════════════════════════════
// features/tutor.js
// "Ask the Tutor" chat feature: starting/exiting tutor chat, sending
// messages, streaming AI responses, confidence display, satellite
// map rendering for geo-coordinate answers, text-to-speech download.
// Extracted from index.html (split, June 2026). Logic unchanged.
//
// DEPENDENCIES (must load before this file):
//   - core/math-utils.js   (fixMath, cleanLatex used by sendTutorMessage)
//   - core/session-state.js (S — student/session profile)
//   - core/ui-helpers.js   (addAI, toast, md2html, _tutorMsgTexts)
//
// EXPORTS USED BY OTHER FEATURES:
//   - renderConfidenceBar() is called from quiz.js (buildFeedback)
//     to show the AI's confidence score on the results-review screen.
//
// NOTE: _tutorMsgTexts is no longer declared in this file — it was
// promoted to core/ui-helpers.js since addAI (also shared) needs it
// too. The comment that used to mark its declaration point here has
// been removed; behavior is unchanged, only the declaration's home.
// ════════════════════════════════════════════════════════════════

var tutorHistory=[];
var _tutorRetried=false; // prevents infinite retry loops
function renderSessionStreak(){
  renderStreakBadge('streak-badge-session');
}

function startTutorChat(){
  // ── CHECK: Document must be uploaded AND pages selected ────────
  var hasImages = S.images && S.images.length > 0;
  if(!hasImages){
    // PDF loaded but pages not yet extracted
    var pdfLoaded = typeof pdfDoc !== 'undefined' && pdfDoc !== null;
    if(pdfLoaded){
      toast(saT('err_pdf_extract')||'Please click "Use Selected Pages" to extract PDF pages first','err'); return;
    }
    toast(saT('err_no_doc')||'Please upload your document or images first','err'); return;
  }
  tutorHistory=[];
  var msgs=document.getElementById('tutor-messages');
  if(msgs) msgs.innerHTML='';
  var bar=document.getElementById('tutor-input-bar');
  if(bar) bar.style.display='block';
  var lbl=document.getElementById('tutor-subject-label');
  if(lbl) lbl.textContent=(S.subject||'General')+' — '+(S.name||'Learner');
  showPage('page-tutor');
  // Build welcome in selected UI language
  var _wLang = typeof saLang !== 'undefined' ? saLang : 'en';
  var _wMsgs = {
    en: 'Hi {name}! I have read your {subject}.\n\nAsk me anything about it and I will explain clearly. For maths and science I will show step-by-step working.\n\n💡 Try asking:\n- Explain [concept] from the document\n- How do I solve [problem type]?\n- What is the difference between X and Y?',
    fr: 'Salut {name} ! J\'ai lu votre {subject}.\n\nPosez-moi n\'importe quelle question et j\'expliquerai clairement. Pour les maths et les sciences je montrerai les étapes.\n\n💡 Essayez :\n- Expliquer [concept] du document\n- Comment résoudre [type de problème] ?\n- Quelle est la différence entre X et Y ?',
    pt: 'Olá {name}! Li o seu {subject}.\n\nPergunte-me qualquer coisa e explicarei claramente. Para matemática e ciências mostrarei o passo a passo.\n\n💡 Tente perguntar:\n- Explicar [conceito] do documento\n- Como resolvo [tipo de problema]?\n- Qual é a diferença entre X e Y?',
    es: '¡Hola {name}! He leído tu {subject}.\n\nPregúntame cualquier cosa y explicaré claramente. Para matemáticas y ciencias mostraré el paso a paso.\n\n💡 Prueba preguntando:\n- Explica [concepto] del documento\n- ¿Cómo resuelvo [tipo de problema]?\n- ¿Cuál es la diferencia entre X e Y?',
    sw: 'Habari {name}! Nimesoma {subject} yako.\n\nNiulize chochote na nitaeleza kwa uwazi. Kwa hisabati na sayansi nitaonyesha hatua kwa hatua.\n\n💡 Jaribu kuuliza:\n- Eleza [dhana] kutoka kwa hati\n- Ninatatua vipi [aina ya tatizo]?\n- Tofauti kati ya X na Y ni nini?',
    de: 'Hallo {name}! Ich habe dein {subject} gelesen.\n\nFrage mich alles und ich erkläre es klar. Für Mathe und Naturwissenschaften zeige ich Schritt für Schritt.\n\n💡 Versuche zu fragen:\n- Erkläre [Konzept] aus dem Dokument\n- Wie löse ich [Problemtyp]?\n- Was ist der Unterschied zwischen X und Y?',
    zh: '你好 {name}！我已阅读您的 {subject}。\n\n请随时提问，我会清晰解释。对于数学和科学，我将展示分步解题过程。\n\n💡 试着问：\n- 解释文档中的[概念]\n- 如何解决[问题类型]？\n- X 和 Y 有什么区别？',
    ru: 'Привет, {name}! Я прочитал ваш {subject}.\n\nСпрашивайте всё что угодно — объясню ясно. По математике и наукам покажу решение пошагово.\n\n💡 Попробуйте спросить:\n- Объясни [понятие] из документа\n- Как решить [тип задачи]?\n- В чём разница между X и Y?',
    hi: 'नमस्ते {name}! मैंने आपका {subject} पढ़ लिया है।\n\nकुछ भी पूछें और मैं स्पष्ट रूप से समझाऊंगा। गणित और विज्ञान के लिए चरण-दर-चरण हल दिखाऊंगा।\n\n💡 पूछने की कोशिश करें:\n- दस्तावेज़ से [अवधारणा] समझाएं\n- मैं [समस्या प्रकार] कैसे हल करूं?\n- X और Y में क्या अंतर है?',
  };
  var _wTemplate = _wMsgs[_wLang] || _wMsgs['en'];
  var _wName = (S.name && S.name.trim()) ? S.name.trim() : (saT('there_word')||'there');
  var _wSubj = (S.subject && S.subject.trim()) ? S.subject.trim() : (saT('document_word')||'document');
  var _wMsg = _wTemplate
    .replace(/\{name\}/g, _wName)
    .replace(/\{subject\}/g, _wSubj);
}
function exitTutorChat(){
  tutorHistory=[];
  var bar=document.getElementById('tutor-input-bar');
  if(bar) bar.style.display='none';
  showPage('page-profile');
}
function addTutorMsg(role,text){
  var msgs=document.getElementById('tutor-messages');
  if(!msgs) return;

  // Extract confidence score from text before rendering
  var tutorConfidence = null;
  if(role === 'ai'){
    var tcMatch = text.match(/\[CONFIDENCE:(\d+)\]/i);
    if(tcMatch){
      tutorConfidence = Math.min(100, Math.max(0, parseInt(tcMatch[1])));
      text = text.replace(/\s*\[CONFIDENCE:\d+\]/i,'').trimEnd();
    }
    // Also apply fixMath
    if(typeof fixMath === 'function') text = fixMath(text);
  }
  var div=document.createElement('div');
  div.style.display='flex';
  div.style.gap='10px';
  div.style.marginBottom='12px';
  if(role==='user') div.style.flexDirection='row-reverse';
  // For AI/system: no avatar, full width bubble. For user: keep avatar + right-align
  if(role === 'user'){
    var av=document.createElement('div');
    av.style.cssText='width:32px;height:32px;min-width:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;background:rgba(255,255,255,0.1);';
    av.textContent='👤';
    div.appendChild(av);
  }
  var bub=document.createElement('div');
  bub.style.cssText='width:100%;padding:14px 16px;color:#fff;font-size:14px;line-height:1.8;';
  bub.style.borderRadius= '8px';
  bub.style.background= role==='ai' ? 'rgba(245,158,11,0.15)' : role==='system' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.1)';
  bub.style.border= role==='ai' ? '1px solid rgba(245,158,11,0.3)' : role==='system' ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(255,255,255,0.15)';
  var isOutOfScope = role !== 'system' && (text.indexOf('OUT OF SCOPE:') !== -1 || text.indexOf('⚠️') === 0);
  if(isOutOfScope){
    bub.style.background='rgba(245,158,11,0.08)';
    bub.style.border='1px solid rgba(245,158,11,0.4)';
    // Add warning banner
    var warn=document.createElement('div');
    warn.style.cssText='background:rgba(245,158,11,0.2);border-radius:6px;padding:6px 10px;margin-bottom:8px;font-size:12px;font-weight:700;color:#f59e0b;';
    warn.textContent='⚠️ '+(saT('out_of_scope')||'Question outside document scope — general answer provided');
    bub.appendChild(warn);
    // Remove the OUT OF SCOPE: prefix from text
    text = text.replace(/⚠️\s*OUT OF SCOPE:\s*/,'').replace(/OUT OF SCOPE:\s*/,'');
  }
  var content=document.createElement('div');
  var cleanedText = typeof cleanLatex==='function' ? cleanLatex(text) : text;
  content.innerHTML = typeof md2html==='function' ? md2html(cleanedText) : cleanedText.split('\n').join('<br>');
  bub.appendChild(content);

  // Download button — only for AI answers after the welcome message
  if(role==='ai' && role!=='system'){
    var dlBar=document.createElement('div');
    dlBar.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid rgba(245,158,11,0.2);gap:8px;';

    // 🔊 Listen button
    var speakMsgId = 'tutor-' + Date.now();
    var plainT = text.replace(/\*\*/g,'').replace(/#+\s*/g,'').replace(/```[\s\S]*?```/g,'').replace(/\*/g,'').replace(/\n+/g,' ').trim();
    _tutorMsgTexts[speakMsgId] = plainT;
    var spkBtn=document.createElement('button');
    spkBtn.id = 'btn-'+speakMsgId;
    spkBtn.style.cssText='flex:1;padding:8px 0;background:#06b6d4;border:none;border-radius:10px;color:#0a1628;font-size:13px;font-weight:800;cursor:pointer;font-family:\'DM Sans\',sans-serif;';
    spkBtn.textContent='🔊 Listen';
    spkBtn.onclick=(function(id,btn){ return function(){ speakTutorMsg(btn,id); }; })(speakMsgId,spkBtn);
    dlBar.appendChild(spkBtn);

    // Download Word button
    var dlBtn=document.createElement('button');
    dlBtn.style.cssText='flex:1;padding:8px 0;background:rgba(30,58,138,0.3);border:1px solid rgba(59,130,246,0.5);border-radius:10px;color:#93c5fd;font-size:12px;font-weight:700;cursor:pointer;font-family:\'DM Sans\',sans-serif;';
    dlBtn.innerHTML='📄 Word';
    (function(t){ dlBtn.onclick=function(){ downloadTutorAnswer(t); }; })(text);
    dlBar.appendChild(dlBtn);

    // Download PDF button
    var dlPdfBtn=document.createElement('button');
    dlPdfBtn.style.cssText='flex:1;padding:8px 0;background:rgba(127,29,29,0.3);border:1px solid rgba(239,68,68,0.5);border-radius:10px;color:#fca5a5;font-size:12px;font-weight:700;cursor:pointer;font-family:\'DM Sans\',sans-serif;';
    dlPdfBtn.innerHTML='📕 PDF';
    (function(t){ dlPdfBtn.onclick=function(){ downloadTutorAnswerPDF(t); }; })(text);
    dlBar.appendChild(dlPdfBtn);

    bub.appendChild(dlBar);

    // Auto-speak handled by tutorAutoSpeak() called after response is complete
  }

  if(role === 'user'){
    div.appendChild(av);
  }
  div.appendChild(bub);
  msgs.appendChild(div);

  // Render confidence bar under AI messages
  if(role === 'ai' && tutorConfidence !== null){
    renderConfidenceBar(tutorConfidence, msgs);
  }

  // MathJax render
  if(window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([div]).catch(function(){});

  msgs.scrollTop=msgs.scrollHeight;
  return bub; // returned so streaming can update it
}
function downloadTutorAnswer(answerText){
  var questionText='';
  for(var i=tutorHistory.length-1;i>=0;i--){
    if(tutorHistory[i].role==='user'){ questionText=tutorHistory[i].content; break; }
  }
  var cleanAnswer = typeof cleanLatex==='function' ? cleanLatex(answerText) : latexToReadable(answerText);
  var bodyHtml = typeof md2html==='function' ? md2html(cleanAnswer) : cleanAnswer.split('\n').join('<br>');
  var now = new Date().toLocaleString('en-GB');
  var safeName = (S.name||'Learner').replace(/\s+/g,'_');
  var safeSubj = (S.subject||'Answer').replace(/\s+/g,'_');

  var qBlock = questionText
    ? '<h2 style="color:#1a56db;font-size:13pt;margin-bottom:4pt;">Your Question</h2>'
      + '<p style="background:#dce8ff;padding:10pt 14pt;border-left:4pt solid #1a56db;font-size:11pt;">'
      + questionText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      + '</p>'
    : '';

  // Word-compatible HTML using mso namespace
  var wordHtml = '<!DOCTYPE html>'
    + '<html xmlns:o="urn:schemas-microsoft-com:office:office" '
    + 'xmlns:w="urn:schemas-microsoft-com:office:word" '
    + 'xmlns="http://www.w3.org/TR/REC-html40">'
    + '<head><meta charset="UTF-8">'
    + '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View>'
    + '<w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->'
    + '<style>'
    + '@page{size:A4;margin:2.5cm 2cm;}'
    + 'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1e293b;line-height:1.6;}'
    + 'h1{font-family:Calibri,Arial,sans-serif;font-size:16pt;color:#1a56db;border-bottom:2pt solid #1a56db;padding-bottom:4pt;margin-bottom:6pt;}'
    + 'h2{font-family:Calibri,Arial,sans-serif;font-size:13pt;color:#0f2044;margin-top:14pt;}'
    + 'h3{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#0f2044;margin-top:10pt;}'
    + '.meta{font-size:9pt;color:#64748b;border-bottom:1pt solid #e2e8f0;padding-bottom:8pt;margin-bottom:16pt;}'
    + '.ans-heading{font-size:10pt;font-weight:bold;text-transform:uppercase;letter-spacing:1pt;color:#d97706;margin-bottom:6pt;}'
    + '.ans-box{background:#fffbeb;border-left:4pt solid #f59e0b;padding:12pt 16pt;font-size:11pt;}'
    + '.ans-box strong{color:#0f2044;}'
    + 'code{font-family:Courier New,monospace;font-size:10pt;background:#f1f5f9;}'
    + '.footer{font-size:8pt;color:#94a3b8;text-align:center;margin-top:24pt;border-top:1pt solid #e2e8f0;padding-top:8pt;}'
    + '</style></head><body>'
    + '<h1>Smart Academy AI &#8212; Tutor Answer</h1>'
    + '<div class="meta"><b>'+(S.name||'Learner')+'</b>'
    + ' &nbsp;|&nbsp; Subject: <b>'+(S.subject||'General')+'</b>'
    + ' &nbsp;|&nbsp; Level: '+(S.level||'')
    + ' &nbsp;|&nbsp; Date: '+now+'</div>'
    + qBlock
    + '<div class="ans-heading">Tutor Answer</div>'
    + '<div class="ans-box">'+bodyHtml+'</div>'
    + '<div class="footer">Generated by Smart Academy AI &middot; www.smartacademy-ai.com</div>'
    + '</body></html>';

  var blob=new Blob([wordHtml],{type:'application/msword'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;
  a.download='SmartAcademy_Tutor_'+safeName+'_'+safeSubj+'.doc';
  a.click();
  URL.revokeObjectURL(url);
  toast('Answer downloaded as Word document!','ok');
}

function downloadTutorAnswerPDF(answerText){
  var questionText='';
  for(var i=tutorHistory.length-1;i>=0;i--){
    if(tutorHistory[i].role==='user'){ questionText=tutorHistory[i].content; break; }
  }
  var cleanAnswer = typeof cleanLatex==='function' ? cleanLatex(answerText) : latexToReadable(answerText);
  var bodyHtml = typeof md2html==='function' ? md2html(cleanAnswer) : cleanAnswer.split('\n').join('<br>');
  var now = new Date().toLocaleString('en-GB');
  var safeName = (S.name||'Learner').replace(/\s+/g,'_');
  var safeSubj = (S.subject||'Answer').replace(/\s+/g,'_');
  var qBlock = questionText
    ? '<h2 style="color:#1a56db;">Your Question</h2><p style="background:#dce8ff;padding:10px 14px;border-left:4px solid #1a56db;">'+questionText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</p>'
    : '';
  var win = window.open('','_blank');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SAA Tutor — '+safeName+'</title>'
    +'<style>body{font-family:Arial,sans-serif;max-width:750px;margin:40px auto;padding:20px;color:#1e293b;line-height:1.7;}'
    +'h1{color:#1a56db;border-bottom:2px solid #1a56db;padding-bottom:6px;}'
    +'h2,h3{color:#0f2044;}.meta{color:#64748b;font-size:12px;margin-bottom:20px;border-bottom:1px solid #e2e8f0;padding-bottom:10px;}'
    +'.q-box{background:#dce8ff;border-left:4px solid #1a56db;padding:12px 16px;margin-bottom:16px;}'
    +'.ans-label{font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#d97706;margin-bottom:6px;}'
    +'.ans-box{background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;}'
    +'.footer{font-size:11px;color:#94a3b8;text-align:center;margin-top:30px;border-top:1px solid #e2e8f0;padding-top:10px;}'
    +'@media print{body{margin:1cm;}}</style></head><body>'
    +'<h1>Smart Academy AI — Tutor Answer</h1>'
    +'<div class="meta"><b>'+(S.name||'Learner')+'</b> &nbsp;|&nbsp; '+(S.subject||'General')+' &nbsp;|&nbsp; '+now+'</div>'
    +qBlock
    +'<div class="ans-label">Tutor Answer</div>'
    +'<div class="ans-box">'+bodyHtml+'</div>'
    +'<div class="footer">Generated by Smart Academy AI · www.smartacademy-ai.com</div>'
    +'<script>window.onload=function(){window.print();}<\/script>'
    +'</body></html>');
  win.document.close();
  toast('PDF print dialog opened — choose Save as PDF','ok');
}

function setStudyLLM(model){
  _studyLLM = model;
  var gptBtn = document.getElementById('study-llm-gpt');
  var claudeBtn = document.getElementById('study-llm-claude');
  var label = document.getElementById('study-llm-label');
  if(model === 'claude'){
    if(gptBtn){ gptBtn.style.background='rgba(6,182,212,0.15)'; gptBtn.style.color='#94a3b8'; gptBtn.style.border='2px solid rgba(6,182,212,0.3)'; }
    if(claudeBtn){ claudeBtn.style.background='linear-gradient(135deg,#7c3aed,#a78bfa)'; claudeBtn.style.color='#fff'; claudeBtn.style.border='none'; }
    if(label) label.textContent='Using Claude Sonnet';
    toast('🧠 Switched to Claude Sonnet','ok');
  } else {
    if(gptBtn){ gptBtn.style.background='linear-gradient(135deg,#1a56db,#06b6d4)'; gptBtn.style.color='#fff'; gptBtn.style.border='none'; }
    if(claudeBtn){ claudeBtn.style.background='rgba(167,139,250,0.15)'; claudeBtn.style.color='#a78bfa'; claudeBtn.style.border='2px solid #a78bfa'; }
    if(label) label.textContent='Using GPT-4o';
    toast('🤖 Switched to GPT-4o','ok');
  }
}

function showTutorTyping(){
  var msgs=document.getElementById('tutor-messages');
  if(!msgs) return;
  var d=document.createElement('div');
  d.id='tutor-typing';
  d.style.cssText='display:flex;gap:10px;margin-bottom:12px;align-items:flex-start;';
  d.innerHTML='<div style="width:36px;height:36px;min-width:36px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-size:18px;">🏫</div>'
    +'<div style="padding:12px 16px;border-radius:4px 16px 16px 16px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);">'
    +'<span style="display:inline-block;width:8px;height:8px;background:#f59e0b;border-radius:50%;animation:bounce 1.2s ease infinite;margin-right:4px;"></span>'
    +'<span style="display:inline-block;width:8px;height:8px;background:#f59e0b;border-radius:50%;animation:bounce 1.2s ease infinite 0.2s;margin-right:4px;"></span>'
    +'<span style="display:inline-block;width:8px;height:8px;background:#f59e0b;border-radius:50%;animation:bounce 1.2s ease infinite 0.4s;"></span>'
    +'</div>';
  msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
}
function hideTutorTyping(){
  var el=document.getElementById('tutor-typing');
  if(el) el.remove();
}
var _tutorLLM = 'gpt';
var _studyLLM = 'gpt'; // for summarize/keypoints
function renderConfidenceBar(score, container){
  var msgs = container || document.getElementById('tutor-messages');
  if(!msgs || score === null || score === undefined) return;
  var color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';
  var label = score >= 80 ? 'High confidence' : score >= 60 ? 'Moderate confidence' : score >= 40 ? 'Low confidence' : 'Uncertain';
  var bar = document.createElement('div');
  bar.style.cssText = 'margin:2px 0 10px 0;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.08);';
  bar.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">'
    +'<span style="font-size:10px;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:1px;">AI Confidence</span>'
    +'<span style="font-size:12px;font-weight:700;color:'+color+';">'+score+'/100 — '+label+'</span>'
    +'</div>'
    +'<div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">'
    +'<div style="height:100%;width:'+score+'%;background:'+color+';border-radius:3px;transition:width 0.6s ease;"></div>'
    +'</div>';
  msgs.appendChild(bar);
  msgs.scrollTop = msgs.scrollHeight;
}

// Parse DMS or decimal coordinates from any text string
function parseDMSFromText(text){
  var results = [];
  var idx = 1;
  // DMS: 4°19'30.00"S, 15°19'19.20"E
  var dmsRe = /(\d{1,3})[°º](\d{1,2})['\u2019]?([\d.]+)["\u201d]?\s*([NSns])[,;\s]+(\d{1,3})[°º](\d{1,2})['\u2019]?([\d.]+)["\u201d]?\s*([EWew])/g;
  var m;
  while((m = dmsRe.exec(text)) !== null){
    var lat = parseInt(m[1]) + parseInt(m[2])/60 + parseFloat(m[3])/3600;
    if(/[Ss]/.test(m[4])) lat = -lat;
    var lng = parseInt(m[5]) + parseInt(m[6])/60 + parseFloat(m[7])/3600;
    if(/[Ww]/.test(m[8])) lng = -lng;
    results.push({lat:parseFloat(lat.toFixed(6)), lng:parseFloat(lng.toFixed(6)), name:'P'+idx++});
  }
  // Decimal with ≥3 decimal places: -10.456737, 25.625410 (reliable coords, not random numbers)
  if(results.length === 0){
    var decRe = /(-?\d{1,3}\.\d{3,})\s*[NSns]?\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})\s*[EWew]?/g;
    while((m = decRe.exec(text)) !== null){
      var la = parseFloat(m[1]);
      var lo = parseFloat(m[2]);
      if(Math.abs(la) <= 90 && Math.abs(lo) <= 180 && la !== lo){
        results.push({lat:la, lng:lo, name:'P'+idx++});
      }
    }
  }
  return results;
}

function tutorShowSatelliteMap(coords, zoom, label){
  var msgs = document.getElementById('tutor-messages');
  if(!msgs || !coords || coords.length === 0) return;

  var mapWrap = document.createElement('div');
  mapWrap.style.cssText = 'margin:6px 0 8px 0;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.3);width:100%;';
  var mapHeader = document.createElement('div');
  mapHeader.style.cssText = 'background:#0f2044;padding:8px 12px;font-size:11px;font-weight:700;color:#06b6d4;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:6px;';
  mapHeader.innerHTML = '🛰️ Satellite Map' + (label ? ' — '+label : '');
  var mapDiv = document.createElement('div');
  var mapId = 'tutor-map-' + Date.now();
  mapDiv.id = mapId;
  mapDiv.style.cssText = 'height:300px;width:100%;background:#1a2a4a;';
  mapWrap.appendChild(mapHeader);
  mapWrap.appendChild(mapDiv);
  msgs.appendChild(mapWrap);
  msgs.scrollTop = msgs.scrollHeight;

  function initMap(){
    // Small delay to ensure DOM is rendered before Leaflet measures the div
    setTimeout(function(){
      try{
        var center = coords[0];
        var map = window.L.map(mapId, {zoomControl:true}).setView([center.lat, center.lng], zoom || 14);
        window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
          attribution:'Esri World Imagery', maxZoom:19
        }).addTo(map);
        window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{
          maxZoom:19, opacity:0.7
        }).addTo(map);
        var latlngs = [];
        coords.forEach(function(c, i){
          latlngs.push([c.lat, c.lng]);
          var icon = window.L.divIcon({
            className:'',
            html:'<div style="background:#f59e0b;color:#000;font-weight:700;font-size:11px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5);">'+(c.name||'P'+(i+1))+'</div>',
            iconSize:[24,24], iconAnchor:[12,12]
          });
          window.L.marker([c.lat, c.lng], {icon:icon}).addTo(map)
            .bindPopup('<b>'+(c.name||'Point '+(i+1))+'</b><br>'+c.lat.toFixed(6)+', '+c.lng.toFixed(6))
            .openPopup();
        });
        if(latlngs.length > 1){
          window.L.polyline(latlngs, {color:'#f59e0b', weight:2, dashArray:'4'}).addTo(map);
          map.fitBounds(latlngs, {padding:[30,30]});
        }
        map.invalidateSize();
      }catch(e){ mapDiv.innerHTML='<div style="color:#f59e0b;padding:20px;text-align:center;">Map error: '+e.message+'</div>'; }
    }, 200);
  }

  if(window.L){
    initMap();
  } else {
    if(!document.getElementById('leaflet-css')){
      var link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = initMap;
    document.head.appendChild(script);
  }
}

function setTutorLLM(model){
  _tutorLLM = model;
  var gptBtn = document.getElementById('tutor-llm-gpt');
  var claudeBtn = document.getElementById('tutor-llm-claude');
  var label = document.getElementById('tutor-llm-label');
  if(model === 'claude'){
    if(gptBtn){ gptBtn.style.background='rgba(6,182,212,0.15)'; gptBtn.style.color='#94a3b8'; gptBtn.style.border='2px solid rgba(6,182,212,0.3)'; }
    if(claudeBtn){ claudeBtn.style.background='linear-gradient(135deg,#7c3aed,#a78bfa)'; claudeBtn.style.color='#fff'; claudeBtn.style.border='none'; }
    if(label) label.textContent='Using Claude Sonnet';
    if(typeof toast==='function') toast('🧠 Switched to Claude','ok');
  } else {
    if(gptBtn){ gptBtn.style.background='linear-gradient(135deg,#1a56db,#06b6d4)'; gptBtn.style.color='#fff'; gptBtn.style.border='none'; }
    if(claudeBtn){ claudeBtn.style.background='rgba(167,139,250,0.15)'; claudeBtn.style.color='#a78bfa'; claudeBtn.style.border='2px solid #a78bfa'; }
    if(label) label.textContent='Using GPT-4o';
    if(typeof toast==='function') toast('🤖 Switched to GPT-4o','ok');
  }
}

async function sendTutorMessage(){
  var input=document.getElementById('tutor-input');
  if(!input) return;
  var question=input.value.trim();
  if(!question) return;

  // Unlock audio on mobile — browser requires user gesture before speech
  if(window.speechSynthesis){
    var unlock = new SpeechSynthesisUtterance(' ');
    unlock.volume = 0.01; unlock.rate = 10;
    window.speechSynthesis.speak(unlock);
    window._audioUnlocked = true;
  }

  addTutorMsg('user',question);
  tutorHistory.push({role:'user',content:question});
  input.value='';
  input.style.height='auto';
  showTutorTyping();
  try{
    var imgs=[];
    // Skip images if Excel is loaded (type excel = not a real image)
    if(S.images && S.images.length>0 && !saPDFText){
      imgs=S.images.map(function(img){
        if(img && img.type === 'excel') return null;
        if(img.b64) return img.b64;
        if(img.data) return img.data.split(',')[1];
        return img;
      }).filter(Boolean);
      // Safety cap: if total base64 payload is too large (>6MB), drop later pages
      // to avoid hitting API/request size limits that cause silent failures
      var totalSize = imgs.reduce(function(sum,s){ return sum + s.length; }, 0);
      var MAX_PAYLOAD = 6 * 1024 * 1024; // 6MB of base64 text
      while(totalSize > MAX_PAYLOAD && imgs.length > 1){
        var removed = imgs.pop();
        totalSize -= removed.length;
      }
    }
    console.log('[Tutor] S.images.length='+(S.images?S.images.length:0)+' | imgs being sent='+imgs.length+' | total base64 size='+(imgs.reduce(function(s,x){return s+x.length;},0))+' chars | saPDFText='+(saPDFText?'yes('+saPDFText.length+' chars)':'no'));
    // Check current question AND last 4 history messages for coordinates
    var _recentText = question + ' ' + tutorHistory.slice(-4).map(function(h){return h.content||'';}).join(' ');
    var _hasDecimalCoords = /(-?\d{1,3}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/.test(_recentText);
    var _hasDMSCoords = /\d{1,3}[°º]\d{1,2}['′]\s*[\d.]+/.test(_recentText);
    var _isMapRequest = /\bplot\b|\bmap\b|\bsatellite\b|\bcoordinates\b|\bplot.*point|draw.*point/i.test(question);
    var questionHasCoords = _hasDecimalCoords || _hasDMSCoords || (_isMapRequest && (_hasDecimalCoords || _hasDMSCoords));
    // Also force JSON if question is just a map keyword and history has coords
    if(!questionHasCoords && _isMapRequest && /(-?\d{1,3}\.\d{3,})/.test(_recentText)) questionHasCoords = true;

    var payload={
      action:'tutor',
      name:S.name||'Learner',
      level:S.level||'High School',
      subject:S.subject||'General',
      lang:S.lang||'English',
      question:question,
      history:tutorHistory.slice(-8),
      images:imgs,
      pdfText: saPDFText || '',
      model: _tutorLLM || 'gpt',
      stream: !questionHasCoords  // disable streaming for map/coord requests
    };
    console.log('[Tutor] Sending request: images.length='+imgs.length+', stream='+payload.stream+', model='+payload.model+', question="'+question+'"');

    // Use streaming for normal answers
    var res = await fetch('https://smartacademy-ai.kasongokimba.workers.dev',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });

    // Check if response is SSE stream or JSON (map/diagram fallback)
    var contentType = res.headers.get('content-type')||'';
    if(contentType.includes('text/event-stream')){
      hideTutorTyping();
      // Create streaming bubble
      var streamBub = addTutorMsg('ai','');
      var streamText = '';
      var msgs2 = document.getElementById('tutor-messages');
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buf = '';
      while(true){
        var chunk = await reader.read();
        if(chunk.done) break;
        buf += decoder.decode(chunk.value, {stream:true});
        var lines = buf.split('\n'); buf = lines.pop();
        for(var li=0;li<lines.length;li++){
          var line = lines[li];
          if(!line.startsWith('data:')) continue;
          var raw = line.slice(5).trim();
          if(raw==='[DONE]') break;
          try{
            var ev = JSON.parse(raw);
            if(ev.t){
              streamText += ev.t;
              // Strip leading dashes from list items
              var display = streamText.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
                .replace(/\*(.+?)\*/g,'<em>$1</em>')
                .replace(/(^|\n)[•\-\*]\s+/g,'$1')
                .replace(/\n/g,'<br>');
              if(streamBub) streamBub.innerHTML = display;
              if(msgs2) msgs2.scrollTop = msgs2.scrollHeight;
            }
          }catch(e){}
        }
      }
      var answer = streamText;

      // ── SILENT AUTO-RETRY: if answer is empty or an error marker, retry once before showing anything ──
      var isFailedAnswer = !answer || answer.trim()==='' || /⚠️\s*(Could not|Connection error)/i.test(answer);
      if(isFailedAnswer && !_tutorRetried){
        _tutorRetried = true;
        if(streamBub && streamBub.parentElement) streamBub.parentElement.remove(); // remove the failed bubble
        showTutorTyping();
        await new Promise(function(r){ setTimeout(r, 800); }); // brief pause before retry
        try{
          var retryRes = await fetch('https://smartacademy-ai.kasongokimba.workers.dev',{
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
          });
          var retryCT = retryRes.headers.get('content-type')||'';
          if(retryCT.includes('text/event-stream')){
            hideTutorTyping();
            var rBub = addTutorMsg('ai','');
            var rText=''; var rMsgs=document.getElementById('tutor-messages');
            var rReader=retryRes.body.getReader(); var rDecoder=new TextDecoder(); var rBuf='';
            while(true){
              var rChunk=await rReader.read(); if(rChunk.done) break;
              rBuf+=rDecoder.decode(rChunk.value,{stream:true});
              var rLines=rBuf.split('\n'); rBuf=rLines.pop();
              for(var ri=0;ri<rLines.length;ri++){
                var rLine=rLines[ri]; if(!rLine.startsWith('data:')) continue;
                var rRaw=rLine.slice(5).trim(); if(rRaw==='[DONE]') break;
                try{
                  var rEv=JSON.parse(rRaw);
                  if(rEv.t){
                    rText+=rEv.t;
                    var rDisplay=rText.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/(^|\n)[•\-\*]\s+/g,'$1').replace(/\n/g,'<br>');
                    if(rBub) rBub.innerHTML=rDisplay;
                    if(rMsgs) rMsgs.scrollTop=rMsgs.scrollHeight;
                  }
                }catch(e){}
              }
            }
            answer = rText || answer; // use retry result if we got something
            if(rBub) streamBub = rBub; // continue using this bubble for the rest of the flow below
          }
        }catch(retryErr){ /* keep original (failed) answer if retry also fails */ }
        finally{ _tutorRetried = false; }
      }

      // Parse and strip confidence from streamed answer
      var confMatch = answer.match(/\[CONFIDENCE:(\d+)\]/i);
      var confidence = confMatch ? Math.min(100, Math.max(0, parseInt(confMatch[1]))) : null;
      if(confMatch) answer = answer.replace(/\s*\[CONFIDENCE:\d+\]/i, '').trimEnd();
      // Update bubble with clean text
      // Update bubble with clean text + math notation
      if(streamBub){
        var fixedAnswer = typeof fixMath === 'function' ? fixMath(answer) : answer;
        var cleanDisplay = typeof md2html === 'function' ? md2html(fixedAnswer)
          : fixedAnswer.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,'<em>$1</em>')
            .replace(/\n/g,'<br>');
        streamBub.innerHTML = cleanDisplay;
        if(window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([streamBub]).catch(function(){});
        // Store plain text for speak function using the bubble's msg ID
        var spkBtnFinal = streamBub.parentElement && streamBub.parentElement.querySelector('button[id^="btn-tutor-"]');
        if(spkBtnFinal){
          var finalMid = spkBtnFinal.id.replace('btn-','');
          window._tutorMsgTexts = window._tutorMsgTexts || {};
          window._tutorMsgTexts[finalMid] = answer.replace(/\*\*/g,'').replace(/\*/g,'').replace(/(^|\n)[•\-\*]\s+/g,'$1').trim();
        }
      }
      tutorHistory.push({role:'assistant',content:answer});
      saveOfflineTutorQA(question, answer);
      if(confidence !== null) renderConfidenceBar(confidence, msgs2);
      // Auto-speak — call directly with the answer text
      tutorAutoSpeak(answer);
      // Add Word + PDF download buttons to streamed bubble
      if(streamBub && streamBub.parentElement){
        var dlBar2 = document.createElement('div');
        dlBar2.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid rgba(245,158,11,0.2);gap:8px;';
        // Listen button
        var speakMsgId2 = 'tutor-' + Date.now();
        var plainT2 = answer.replace(/\*\*/g,'').replace(/#+\s*/g,'').replace(/```[\s\S]*?```/g,'').replace(/\*/g,'').replace(/\n+/g,' ').trim();
        window._tutorMsgTexts = window._tutorMsgTexts || {};
        window._tutorMsgTexts[speakMsgId2] = plainT2;
        var spkBtn2 = document.createElement('button');
        spkBtn2.id = 'btn-'+speakMsgId2;
        spkBtn2.style.cssText='flex:1;padding:8px 0;background:#06b6d4;border:none;border-radius:10px;color:#0a1628;font-size:13px;font-weight:800;cursor:pointer;font-family:\'DM Sans\',sans-serif;';
        spkBtn2.textContent='🔊 Listen';
        (function(id,btn){ spkBtn2.onclick=function(){ speakTutorMsg(btn,id); }; })(speakMsgId2, spkBtn2);
        dlBar2.appendChild(spkBtn2);
        // Word button
        var wBtn2 = document.createElement('button');
        wBtn2.style.cssText='flex:1;padding:8px 0;background:rgba(30,58,138,0.3);border:1px solid rgba(59,130,246,0.5);border-radius:10px;color:#93c5fd;font-size:12px;font-weight:700;cursor:pointer;font-family:\'DM Sans\',sans-serif;';
        wBtn2.innerHTML='📄 Word';
        (function(t){ wBtn2.onclick=function(){ downloadTutorAnswer(t); }; })(answer);
        dlBar2.appendChild(wBtn2);
        // PDF button
        var pBtn2 = document.createElement('button');
        pBtn2.style.cssText='flex:1;padding:8px 0;background:rgba(127,29,29,0.3);border:1px solid rgba(239,68,68,0.5);border-radius:10px;color:#fca5a5;font-size:12px;font-weight:700;cursor:pointer;font-family:\'DM Sans\',sans-serif;';
        pBtn2.innerHTML='📕 PDF';
        (function(t){ pBtn2.onclick=function(){ downloadTutorAnswerPDF(t); }; })(answer);
        dlBar2.appendChild(pBtn2);
        streamBub.parentElement.appendChild(dlBar2);
      }
      // Check for coords in streamed answer AND in the original question
      var clientCoords = parseDMSFromText(answer + ' ' + question);
      if(clientCoords.length > 0) tutorShowSatelliteMap(clientCoords, 16, 'Survey Points');

    } else {
      // Fallback JSON path (map/diagram requests)
      var data = await res.json();
      hideTutorTyping();
      var answer=data.answer||data.response||'';
      // Silent retry once if empty or error-like
      if((!answer || answer.trim()===''  || /⚠️\s*(Could not|Connection error)/i.test(answer)) && !_tutorRetried){
        _tutorRetried = true;
        showTutorTyping();
        await new Promise(function(r){ setTimeout(r,800); });
        try{
          var retryRes2 = await fetch('https://smartacademy-ai.kasongokimba.workers.dev',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
          var retryData2 = await retryRes2.json();
          hideTutorTyping();
          if(retryData2.answer) answer = retryData2.answer;
          data = retryData2;
        }catch(e){}
        finally{ _tutorRetried = false; }
      }
      if(!answer || answer.trim()===''){
        answer = 'Sorry, I had trouble reading that. Could you try asking again, or upload a clearer photo of the document?';
      }
      // Strip confidence tag
      var confMatch2 = answer.match(/\[CONFIDENCE:(\d+)\]/i);
      var confidence2 = confMatch2 ? Math.min(100,Math.max(0,parseInt(confMatch2[1]))) : null;
      if(confMatch2) answer = answer.replace(/\s*\[CONFIDENCE:\d+\]/i,'').trimEnd();
      tutorHistory.push({role:'assistant',content:answer});
      saveOfflineTutorQA(question, answer);
      var pageRefs=data.pageRefs||[];
      addTutorMsg('ai',answer);
      if((confidence2 !== null && confidence2 !== undefined) || (data.confidence !== null && data.confidence !== undefined)){
        renderConfidenceBar(confidence2 ?? data.confidence, document.getElementById('tutor-messages'));
      }
      // Auto-speak
      tutorAutoSpeak(answer);

      // Show SVG diagram if returned
      if(data.svg){
        var msgs=document.getElementById('tutor-messages');
        var svgWrap=document.createElement('div');
        svgWrap.style.cssText='margin:6px 0 8px 0;background:#fff;border-radius:10px;padding:10px;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
        svgWrap.innerHTML='<div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">📊 Diagram</div>'
          +data.svg
          +'<div style="margin-top:6px;text-align:right;"><button onclick="var b=new Blob([\''+data.svg.replace(/'/g,"\\'")+'\']),u=URL.createObjectURL(b),a=document.createElement(\'a\');a.href=u;a.download=\'diagram.svg\';a.click();" style="padding:4px 10px;background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;color:#1d4ed8;font-size:11px;font-weight:700;cursor:pointer;">⬇️ Download</button></div>';
        msgs.appendChild(svgWrap);
        msgs.scrollTop=msgs.scrollHeight;
      }

      // Show satellite map — worker coords first, then parse from answer+question
      if(data.mapCoords && data.mapCoords.length > 0){
        tutorShowSatelliteMap(data.mapCoords, data.mapZoom || 10, data.mapLabel || '');
      } else {
        var clientCoords = parseDMSFromText(answer + ' ' + question);
        if(clientCoords.length > 0) tutorShowSatelliteMap(clientCoords, 16, 'Survey Points');
      }
    if(pageRefs.length>0){
      var msgs=document.getElementById('tutor-messages');
      var bd=document.createElement('div');
      bd.style.cssText='display:flex;flex-wrap:wrap;gap:8px;padding-left:46px;margin-bottom:8px;';
      var lbl=document.createElement('span');
      lbl.style.cssText='font-size:12px;color:rgba(255,255,255,0.5);width:100%;margin-bottom:4px;';
      lbl.textContent='Jump to page:';
      bd.appendChild(lbl);
      pageRefs.forEach(function(pg){
        var btn=document.createElement('button');
        btn.style.cssText='padding:6px 14px;background:rgba(245,158,11,0.2);border:1px solid rgba(245,158,11,0.4);border-radius:8px;color:#f59e0b;font-size:13px;font-weight:700;cursor:pointer;';
        btn.textContent='📄 Page '+pg;
        btn.onclick=function(){
          if(S.quizActive){
            // Block all page viewing during quiz
            var blocked=document.createElement('div');
            blocked.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#0d1f3e;border:2px solid #f59e0b;border-radius:16px;padding:28px 32px;text-align:center;z-index:99999;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
            blocked.innerHTML='<div style="font-size:36px;margin-bottom:12px;">🔒</div>'
              +'<div style="font-size:17px;font-weight:800;color:#f59e0b;margin-bottom:8px;">Page Hidden</div>'
              +'<div style="font-size:14px;color:rgba(255,255,255,0.8);line-height:1.6;">Document pages are locked during the quiz to ensure a fair attempt.<br><br>Pages will be available again after you complete the quiz.</div>'
              +'<button onclick="this.parentElement.remove()" style="margin-top:16px;padding:10px 24px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;">OK</button>';
            document.body.appendChild(blocked);
            return;
          }
          var thumbs=document.querySelectorAll('.uthumb');
          if(thumbs[pg-1]){
            thumbs[pg-1].scrollIntoView({behavior:'smooth',block:'center'});
            thumbs[pg-1].style.outline='3px solid #f59e0b';
            setTimeout(function(){thumbs[pg-1].style.outline='';},2000);
          } else {
            alert('Page '+pg+'. Scroll up to your uploaded document pages.');
          }
        };
        bd.appendChild(btn);
      });
      if(msgs){msgs.appendChild(bd);msgs.scrollTop=msgs.scrollHeight;}
    }
    } // end else JSON path
  }catch(err){
    hideTutorTyping();
    addTutorMsg('ai','Could not connect to the tutor. Please check your internet connection and try again.');
  }
}
