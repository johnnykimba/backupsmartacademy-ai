// ════════════════════════════════════════════════════════════════
// features/dualmind.js
// DualMind research chat: the dual-LLM (GPT-4o + Claude) research
// pipeline interface — file upload, clarifying questions, message
// rendering with markdown, scorecard/checkpoint display, session
// save/load/export, and the main send/API-call flow.
// Extracted from index.html (split, June 2026). Logic unchanged.
//
// DEPENDENCIES (must load before this file):
//   - core/session-state.js (S — S.researchCode)
//   - core/translations.js  (dmSyncLang uses language detection)
//   - features/access-codes.js (WORKER_URL constant)
//   - features/research-mode.js (the access gate that fronts this
//     feature — rgGrant unlocks the UI this file controls)
//
// NOTE: this is a SEPARATE, genuinely distinct feature from the
// research-mode GATE (research-mode.js) — that file controls
// access/unlocking; this file is the actual chat interface once
// unlocked. They were physically far apart in the original file.
//
// NOTE: a file named "DualMind Export.html" exists in the live
// GitHub repo but was confirmed to be an accidental/mistaken upload,
// not the real feature — this file (extracted directly from the
// working index.html) is the authoritative DualMind implementation.
// ════════════════════════════════════════════════════════════════

// ── DUALMIND STATE ───────────────────────────────────────────────
var dmModel = 'auto';
var dmPipelineMode = 'research'; // 'research' | 'professional'
var dmExcelText = ''; // stores Excel content as CSV text
var dmCurrentLang = 'English'; // updated by dmSend before each call
var dmClarifyCount = 0; // disabled
var dmPendingQuestion = ''; // original question waiting for clarifications
var dmPendingMessages = []; // messages waiting for clarifications
var dmClarifyAnswers = {}; // answers to clarifying questions
var dmMessages = [];
var dmLoading = false;
var dmSessionStats = {queries:0, scores:[], calls:0};
var dmPendingCheckpoint = null;
var dmImages = [];
var dmAllPages = [];
var dmExportData = []; // {role, text, scorecard, timestamp}

// ── FILE UPLOAD & PAGE RANGE ──────────────────────────────────────────
function dmUpdatePageRange(){
  var fromEl = document.getElementById('dm-from-page');
  var toEl = document.getElementById('dm-to-page');
  var status = document.getElementById('dm-page-status');
  if(!fromEl || !toEl) return;
  var from = parseInt(fromEl.value) || 1;
  var to = parseInt(toEl.value) || 1;
  var count = to - from + 1;
  if(status) status.textContent = '✅ ' + count + ' page(s) selected';
}

function dmUpdateFileLabel(){
  var lbl = document.getElementById('dm-file-label');
  var lblM = document.getElementById('dm-file-label-mobile');
  var parts = [];
  // Count PDF/image pages
  var pageCount = dmAllPages.length || dmImages.length;
  if(pageCount > 0){
    // Distinguish PDF pages from images
    var pdfPages = dmAllPages.filter(function(p){ return p.label && p.label.indexOf('Page') === 0; }).length;
    var imgCount = dmAllPages.filter(function(p){ return p.label && p.label.indexOf('Image') === 0; }).length;
    var directImgs = dmImages.length - dmAllPages.length;
    if(pdfPages > 0) parts.push('📄 ' + pdfPages + ' PDF page' + (pdfPages>1?'s':''));
    if(imgCount > 0) parts.push('🖼 ' + imgCount + ' photo' + (imgCount>1?'s':''));
    if(directImgs > 0) parts.push('🖼 ' + directImgs + ' photo' + (directImgs>1?'s':''));
  }
  if(dmExcelText) parts.push('📊 Excel');
  if(parts.length === 0) return;
  var total = parts.length;
  var summary = total + ' file' + (total>1?'s':'') + ' attached: ' + parts.join(' · ');
  if(lbl){ lbl.textContent = '✅ ' + summary; lbl.style.display = 'block'; }
  if(lblM){ lblM.textContent = '✅ ' + summary; lblM.style.display = 'block'; }
  var delbtn = document.getElementById('dm-delete-btn');
  if(delbtn) delbtn.style.display = 'inline-block';
}

function dmClearFile(){
  // Clear all uploaded files but keep chat history
  dmImages = [];
  dmAllPages = [];
  dmExcelText = '';
  // Reset UI
  var lbl = document.getElementById('dm-file-label');
  if(lbl){ lbl.textContent = ''; lbl.style.display = 'none'; }
  var lblM = document.getElementById('dm-file-label-mobile');
  if(lblM){ lblM.textContent = ''; lblM.style.display = 'none'; }
  var delbtn = document.getElementById('dm-delete-btn');
  if(delbtn) delbtn.style.display = 'none';
  var sel = document.getElementById('dm-page-selector');
  if(sel) sel.style.display = 'none';
  var hint = document.getElementById('dm-drop-hint');
  if(hint) hint.style.display = 'block';
  var welcome = document.getElementById('dm-welcome');
  if(welcome){ welcome.style.maxHeight = ''; welcome.style.overflow = ''; welcome.style.padding = '4px 4px'; welcome.style.display = 'flex'; }
  // Reset file inputs
  var fi = document.getElementById('dm-file-input');
  if(fi) fi.value = '';
  var pi = document.getElementById('dm-photo-input');
  if(pi) pi.value = '';
  toast('Files removed', 'ok');
}

function dmFullReset(){
  // Clear all DualMind state
  dmMessages = [];
  dmImages = [];
  dmAllPages = [];
  dmExcelText = '';
  dmLoading = false;
  // Clear chat window
  var win = document.getElementById('dm-chat-window');
  if(win) win.innerHTML = '';
  // Reset file label
  var lbl = document.getElementById('dm-file-label');
  if(lbl){ lbl.textContent=''; lbl.style.display='none'; }
  var lblM = document.getElementById('dm-file-label-mobile');
  if(lblM){ lblM.textContent=''; lblM.style.display='none'; }
  // Show drop hint
  var hint = document.getElementById('dm-drop-hint');
  if(hint) hint.style.display='block';
  // Show welcome chips
  var welcome = document.getElementById('dm-welcome');
  if(welcome){ welcome.style.display='flex'; welcome.style.maxHeight=''; welcome.style.overflow=''; welcome.style.padding='4px 4px'; }
  // Reset PDF range display
  var pdfInfo = document.getElementById('dm-pdf-info');
  if(pdfInfo) pdfInfo.style.display='none';
  // Clear session storage — force re-authentication on next visit
  sessionStorage.removeItem('saa_current_research_code');
  sessionStorage.removeItem('saa_research_unlocked');
}

// ── CLARIFYING QUESTIONS FLOW ───────────────────────────────────────────
function dmSetClarify(n){
  dmClarifyCount = n;
  // Update button styles
  for(var i=0;i<=10;i++){
    var btn = document.getElementById('dmcb-'+i);
    if(!btn) continue;
    if(i===n){
      btn.style.background = 'rgba(6,182,212,0.8)';
      btn.style.color = '#fff';
    } else {
      btn.style.background = 'rgba(255,255,255,0.06)';
      btn.style.color = 'rgba(255,255,255,0.5)';
    }
  }
}

function dmShowClarifyPanel(questions){
  // questions = [{q:'...', suggestions:['a','b','c']}]
  var panel = document.getElementById('dm-clarify-panel');
  var container = document.getElementById('dm-clarify-questions');
  if(!panel || !container) return;
  container.innerHTML = '';
  dmClarifyAnswers = {};
  questions.forEach(function(item, idx){
    var qDiv = document.createElement('div');
    qDiv.style.cssText = 'margin-bottom:12px;';
    // Question text
    var qText = document.createElement('div');
    qText.style.cssText = 'font-size:12px;color:#fff;font-weight:600;margin-bottom:6px;';
    qText.textContent = (idx+1) + '. ' + item.q;
    qDiv.appendChild(qText);
    // Suggestion buttons
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;';
    (item.suggestions||[]).forEach(function(s, si){
      var sb = document.createElement('button');
      sb.textContent = s;
      sb.dataset.idx = idx;
      sb.dataset.si = si;
      sb.style.cssText = 'padding:5px 10px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.3);border-radius:6px;color:#06b6d4;font-size:11px;cursor:pointer;';
      sb.onclick = function(){
        // Deselect others for this question
        btnRow.querySelectorAll('button').forEach(function(b){ b.style.background='rgba(6,182,212,0.1)'; b.style.color='#06b6d4'; });
        sb.style.background = 'rgba(6,182,212,0.5)';
        sb.style.color = '#fff';
        dmClarifyAnswers[idx] = s;
        // Hide other input
        var inp = document.getElementById('dm-clarify-inp-'+idx);
        if(inp) inp.value = '';
      };
      btnRow.appendChild(sb);
    });
    qDiv.appendChild(btnRow);
    // Other input
    var otherWrap = document.createElement('div');
    otherWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
    var otherLbl = document.createElement('span');
    otherLbl.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.4);white-space:nowrap;';
    otherLbl.textContent = 'Other:';
    var otherInp = document.createElement('input');
    otherInp.id = 'dm-clarify-inp-'+idx;
    otherInp.placeholder = 'Type your answer...';
    otherInp.style.cssText = 'flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#fff;padding:4px 8px;font-size:11px;outline:none;';
    otherInp.oninput = function(){
      if(otherInp.value.trim()){
        dmClarifyAnswers[idx] = otherInp.value.trim();
        // Deselect suggestion buttons
        btnRow.querySelectorAll('button').forEach(function(b){ b.style.background='rgba(6,182,212,0.1)'; b.style.color='#06b6d4'; });
      }
    };
    otherWrap.appendChild(otherLbl);
    otherWrap.appendChild(otherInp);
    qDiv.appendChild(otherWrap);
    container.appendChild(qDiv);
  });
  panel.style.display = 'block';
}

function dmSubmitClarifications(){
  var panel = document.getElementById('dm-clarify-panel');
  if(panel) panel.style.display = 'none';
  // Build clarification context
  var clarContext = 'Clarification answers provided by the user before analysis:\n';
  var qEls = document.getElementById('dm-clarify-questions').children;
  for(var i=0;i<qEls.length;i++){
    var qText = qEls[i].querySelector('div');
    var ans = dmClarifyAnswers[i] || '(no answer provided)';
    if(qText) clarContext += qText.textContent + '\nAnswer: ' + ans + '\n\n';
  }
  // Append clarifications to messages and send
  var msgs = dmPendingMessages.slice();
  msgs.push({role:'user', content: clarContext + '\nNow please proceed with the full analysis of my original question.'});
  dmSendWithMessages(msgs, true);
}

function dmSkipClarifications(){
  var panel = document.getElementById('dm-clarify-panel');
  if(panel) panel.style.display = 'none';
  dmSendWithMessages(dmPendingMessages, true);
}

// ── LANGUAGE, PIPELINE MODE, MODEL SELECTION ───────────────────────────
function dmSyncLang(){
  var langEl = document.getElementById('dm-lang');
  var lang = langEl ? langEl.value : 'English';

  var t = {
    English:    { drop:'📄 Drop any files here — PDF, Excel, JPG, PNG — multiple files supported', placeholder:'Ask a question about your document... (Enter to send, Shift+Enter for new line)', profChips:['Generate executive summary','Risk assessment report','Validate methodology','Compare against industry standard','Technical findings report','Identify critical gaps'], resChips:['Summarize key findings','What caused this anomaly?','Solve all questions in the document','Generate a full report','Is this interpretation reliable?','Compare section 1 and section 2'] },
    French:     { drop:'Deposez un PDF ou image ici', placeholder:'Posez une question sur votre document...', profChips:['Resume executif','Evaluation des risques','Valider methodologie','Normes du secteur','Resultats techniques','Lacunes critiques'], resChips:['Resultats cles','Cause de cette anomalie?','Resoudre les questions','Rapport complet','Interpretation fiable?','Sections 1 et 2'] },
    Spanish:    { drop:'📄 Suelta un PDF o imagen aquí — o usa los botones Foto / PDF arriba', placeholder:'Haz una pregunta sobre tu documento... (Enter para enviar, Shift+Enter para nueva línea)', profChips:['Generar resumen ejecutivo','Informe de evaluación de riesgos','Validar metodología','Comparar con estándar de la industria','Informe de hallazgos técnicos','Identificar brechas críticas'], resChips:['Resumir hallazgos clave','¿Qué causó esta anomalía?','Resolver todas las preguntas del documento','Generar un informe completo','¿Es confiable esta interpretación?','Comparar sección 1 y sección 2'] },
    Portuguese: { drop:'📄 Arraste um PDF ou imagem aqui — ou use os botões Foto / PDF acima', placeholder:'Faça uma pergunta sobre o seu documento... (Enter para enviar, Shift+Enter para nova linha)', profChips:['Gerar resumo executivo','Relatório de avaliação de riscos','Validar metodologia','Comparar com padrão da indústria','Relatório de resultados técnicos','Identificar lacunas críticas'], resChips:['Resumir principais descobertas','O que causou esta anomalia?','Resolver todas as questões do documento','Gerar relatório completo','Esta interpretação é confiável?','Comparar seção 1 e seção 2'] },
    Arabic:     { drop:'📄 أسقط ملف PDF أو صورة هنا — أو استخدم أزرار الصورة / PDF أعلاه', placeholder:'اطرح سؤالاً حول مستندك... (Enter للإرسال، Shift+Enter لسطر جديد)', profChips:['إنشاء ملخص تنفيذي','تقرير تقييم المخاطر','التحقق من المنهجية','المقارنة بمعيار الصناعة','تقرير النتائج التقنية','تحديد الثغرات الحرجة'], resChips:['تلخيص النتائج الرئيسية','ما الذي تسبب في هذا الشذوذ؟','حل جميع الأسئلة في الوثيقة','إنشاء تقرير كامل','هل هذا التفسير موثوق؟','مقارنة القسم 1 والقسم 2'] },
    Hindi:      { drop:'📄 यहाँ PDF या छवि छोड़ें — या ऊपर Photo / PDF बटन का उपयोग करें', placeholder:'अपने दस्तावेज़ के बारे में प्रश्न पूछें... (भेजने के लिए Enter, नई पंक्ति के लिए Shift+Enter)', profChips:['कार्यकारी सारांश बनाएं','जोखिम मूल्यांकन रिपोर्ट','पद्धति को मान्य करें','उद्योग मानक से तुलना करें','तकनीकी निष्कर्ष रिपोर्ट','महत्वपूर्ण कमियाँ पहचानें'], resChips:['मुख्य निष्कर्षों का सारांश','इस विसंगति का कारण क्या था?','दस्तावेज़ के सभी प्रश्न हल करें','पूरी रिपोर्ट बनाएं','क्या यह व्याख्या विश्वसनीय है?','खंड 1 और खंड 2 की तुलना करें'] },
    Chinese:    { drop:'📄 将PDF或图片拖放到此处 — 或使用上方的照片/PDF按钮', placeholder:'提问关于您的文档... (回车发送，Shift+回车换行)', profChips:['生成执行摘要','风险评估报告','验证方法论','与行业标准比较','技术发现报告','识别关键差距'], resChips:['总结主要发现','是什么导致了这个异常?','解答文档中的所有问题','生成完整报告','这个解读可靠吗?','比较第1节和第2节'] },
    Russian:    { drop:'📄 Перетащите PDF или изображение сюда — или используйте кнопки Фото / PDF выше', placeholder:'Задайте вопрос о вашем документе... (Enter для отправки, Shift+Enter для новой строки)', profChips:['Создать executive summary','Отчёт об оценке рисков','Проверить методологию','Сравнить с отраслевым стандартом','Отчёт о технических находках','Выявить критические пробелы'], resChips:['Обобщить ключевые выводы','Что стало причиной аномалии?','Решить все вопросы в документе','Создать полный отчёт','Надёжна ли эта интерпретация?','Сравнить разделы 1 и 2'] },
    German:     { drop:'📄 PDF oder Bild hier ablegen — oder die Foto / PDF Schaltflächen oben verwenden', placeholder:'Stellen Sie eine Frage zu Ihrem Dokument... (Enter zum Senden, Shift+Enter für neue Zeile)', profChips:['Executive Summary erstellen','Risikobewertungsbericht','Methodik validieren','Mit Branchenstandard vergleichen','Technischer Befundbericht','Kritische Lücken identifizieren'], resChips:['Wichtigste Erkenntnisse zusammenfassen','Was verursachte diese Anomalie?','Alle Fragen im Dokument lösen','Vollständigen Bericht erstellen','Ist diese Interpretation zuverlässig?','Abschnitt 1 und 2 vergleichen'] },
    Swahili:    { drop:'📄 Weka PDF au picha hapa — au tumia vitufe vya Picha / PDF hapo juu', placeholder:'Uliza swali kuhusu hati yako... (Enter kutuma, Shift+Enter kwa mstari mpya)', profChips:['Tengeneza muhtasari wa mtendaji','Ripoti ya tathmini ya hatari','Thibitisha mbinu','Linganisha na kiwango cha tasnia','Ripoti ya matokeo ya kiufundi','Tambua mapungufu muhimu'], resChips:['Fanya muhtasari wa matokeo muhimu','Ni nini kilisababisha hali hii isiyo ya kawaida?','Suluhisha maswali yote kwenye hati','Tengeneza ripoti kamili','Je, tafsiri hii inategemewa?','Linganisha sehemu ya 1 na ya 2'] }
  };

  var tr = t[lang] || t['English'];

  // Update drop hint
  var drop = document.getElementById('dm-drop-hint');
  if(drop) drop.textContent = tr.drop;

  // Update textarea placeholder
  var inp = document.getElementById('dm-input');
  if(inp) inp.placeholder = tr.placeholder;

  // Update chips
  var welcome = document.getElementById('dm-welcome');
  if(welcome){
    var chips = welcome.querySelectorAll('.dm-chip');
    var chipTexts = (dmPipelineMode === 'professional') ? tr.profChips : tr.resChips;
    chips.forEach(function(c, i){ if(chipTexts[i]) c.textContent = chipTexts[i]; });
  }
}

function dmSetPipelineMode(mode){
  dmPipelineMode = mode;
  var isProf = mode === 'professional';

  // Toggle buttons
  var rBtn = document.getElementById('dm-mode-btn-research');
  var pBtn = document.getElementById('dm-mode-btn-professional');
  var badge = document.getElementById('dm-mode-badge');
  var label = document.getElementById('dm-mode-label');
  var title = document.getElementById('dm-mode-title');
  var subtitle = document.getElementById('dm-mode-subtitle');

  if(isProf){
    if(rBtn){ rBtn.style.background='transparent'; rBtn.style.color='rgba(255,255,255,0.4)'; }
    if(pBtn){ pBtn.style.background='linear-gradient(135deg,#7c3aed,#a78bfa)'; pBtn.style.color='#fff'; }
    if(badge){ badge.style.background='rgba(124,58,237,0.12)'; badge.style.borderColor='rgba(124,58,237,0.3)'; badge.style.color='#a78bfa'; badge.textContent='Expert · Formal · Domain-specific'; }
    if(label){ label.style.color='#a78bfa'; label.textContent='💼 Professional Mode'; }
    if(title) title.textContent='DualMind Professional Pipeline';
    if(subtitle) subtitle.textContent='Domain-expert analysis · Formal report · High confidence threshold';
  } else {
    if(rBtn){ rBtn.style.background='linear-gradient(135deg,#1a56db,#06b6d4)'; rBtn.style.color='#fff'; }
    if(pBtn){ pBtn.style.background='transparent'; pBtn.style.color='rgba(255,255,255,0.4)'; }
    if(badge){ badge.style.background='rgba(6,182,212,0.1)'; badge.style.borderColor='rgba(6,182,212,0.25)'; badge.style.color='#06b6d4'; badge.textContent='General Analysis'; }
    if(label){ label.style.color='#06b6d4'; label.textContent='🔬 Research Mode'; }
    if(title) title.textContent='DualMind Research Pipeline';
    if(subtitle) subtitle.textContent='LLM 1 analyses · LLM 2 verifies · Complexity-routed pipeline';
  }
  // Update welcome chips
  var welcome = document.getElementById('dm-welcome');
  if(welcome){
    var chips = welcome.querySelectorAll('.dm-chip');
    if(isProf){
      var profExamples = ['Generate executive summary','Risk assessment report','Validate methodology','Compare against industry standard','Technical findings report','Identify critical gaps'];
      chips.forEach(function(c,i){ if(profExamples[i]) c.textContent=profExamples[i]; });
    } else {
      var resExamples = ['Summarize key findings','What caused this anomaly?','Solve all questions in the document','Generate a full report','Is this interpretation reliable?','Compare section 1 and section 2'];
      chips.forEach(function(c,i){ if(resExamples[i]) c.textContent=resExamples[i]; });
    // Re-apply language translation after mode switch
    setTimeout(dmSyncLang, 0);
    }
  }
}

function dmSetModel(m){
  dmModel = m;
  var configs = {
    gpt:   {bg:'rgba(16,163,127,0.2)', color:'#10a37f', border:'rgba(16,163,127,0.5)'},
    auto:  {bg:'rgba(124,77,255,0.2)', color:'#a78bfa', border:'rgba(124,77,255,0.5)'},
    claude:{bg:'rgba(201,100,66,0.2)', color:'#c96442', border:'rgba(201,100,66,0.5)'}
  };
  ['gpt','auto','claude'].forEach(function(k){
    document.querySelectorAll('#dm-tab-'+k).forEach(function(btn){
      if(k===m){
        btn.style.background=configs[k].bg;
        btn.style.color=configs[k].color;
        btn.style.borderColor=configs[k].border;
      } else {
        btn.style.background='rgba(255,255,255,0.04)';
        btn.style.color='rgba(255,255,255,0.35)';
        btn.style.borderColor='rgba(255,255,255,0.1)';
      }
    });
  });
}

// ── PIPELINE STEP INDICATOR (S0-S5 progress display) ───────────────────
function dmSetStep(n){
  for(var i=0;i<=5;i++){
    var el=document.getElementById('dm-step-'+i);
    if(!el) continue;
    var dot=el.querySelector('.dm-dot');
    if(i<n){ el.style.color='#10b981'; if(dot){dot.style.background='#10b981';dot.style.boxShadow='none';} }
    else if(i===n){ el.style.color='#06b6d4'; if(dot){dot.style.background='#06b6d4';dot.style.boxShadow='0 0 6px #06b6d4';} }
    else { el.style.color='rgba(255,255,255,0.3)'; if(dot){dot.style.background='rgba(255,255,255,0.15)';dot.style.boxShadow='none';} }
  }
}

function dmResetSteps(){
  for(var i=0;i<=5;i++){
    var el=document.getElementById('dm-step-'+i); if(!el) continue;
    el.style.color='rgba(255,255,255,0.3)';
    var dot=el.querySelector('.dm-dot');
    if(dot){dot.style.background='rgba(255,255,255,0.15)';dot.style.boxShadow='none';}
  }
}

// ── DOCUMENT/IMAGE UPLOAD HANDLING ──────────────────────────────────────
async function dmHandleFile(input){
  var files = Array.from(input.files);
  if(!files.length) return;

  var lbl = document.getElementById('dm-file-label');
  var sel = document.getElementById('dm-page-selector');
  var hint = document.getElementById('dm-drop-hint');
  var delbtn = document.getElementById('dm-delete-btn');
  var welcome = document.getElementById('dm-welcome');

  if(lbl){ lbl.textContent = '⏳ Loading ' + files.length + ' file(s)...'; lbl.style.display = 'block'; }
  if(hint) hint.style.display = 'none';
  if(welcome){ welcome.style.maxHeight = '0'; welcome.style.overflow = 'hidden'; welcome.style.padding = '0'; }

  // Track what was already loaded before this upload
  var prevPdfPages = dmAllPages.filter(function(p){ return p.label && p.label.indexOf(' p.') !== -1; }).length;
  var prevImgs = dmAllPages.filter(function(p){ return p.label && p.label.indexOf(' p.') === -1; }).length;
  var prevExcel = dmExcelText ? 1 : 0;
  var pdfCount = 0, imgCount = 0, excelCount = 0, totalPages = prevPdfPages;

  for(var fi = 0; fi < files.length; fi++){
    var file = files[fi];
    var fn = file.name.toLowerCase();

    // ── EXCEL ──
    if(fn.endsWith('.xls') || fn.endsWith('.xlsx')){
      try{
        if(typeof XLSX === 'undefined') await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        var buf = await file.arrayBuffer();
        var wb = XLSX.read(buf, {type:'array'});
        var txt = '';
        wb.SheetNames.forEach(function(sn){
          txt += '=== '+file.name+' | '+sn+' ===\n' + XLSX.utils.sheet_to_csv(wb.Sheets[sn]) + '\n\n';
        });
        dmExcelText = (dmExcelText ? dmExcelText + '\n\n' : '') + txt;
        excelCount++;
      }catch(e){ toast('Excel error: ' + file.name, 'err'); }

    // ── PDF ──
    } else if(fn.endsWith('.pdf') || file.type === 'application/pdf'){
      try{
        if(!window.pdfjsLib){
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        if(lbl) lbl.textContent = '⏳ Reading PDF: ' + file.name;
        var buf2 = await file.arrayBuffer();
        var pdf = await window.pdfjsLib.getDocument({data: buf2}).promise;
        var pages = pdf.numPages;
        var maxPages = 150; // Research mode limit
        if(pages > maxPages){
          toast('⚠️ Research mode limited to ' + maxPages + ' pages. First ' + maxPages + ' pages loaded.', 'warn');
          pages = maxPages;
        } else if(pages > 30){
          alert('📄 Large document: ' + pages + ' pages loaded.\n\nTip: Use the page range selector to choose the most relevant pages for faster and more accurate analysis.\n\nFor example: select pages 5–20 if that is where your key data is.');
        }
        for(var pg = 1; pg <= pages; pg++){
          var page = await pdf.getPage(pg);
          // Use lower resolution when multiple files to avoid token limit
          var scale = (files.length > 1) ? 1.0 : 1.5;
          var vp = page.getViewport({scale: scale});
          var canvas = document.createElement('canvas');
          canvas.width = vp.width; canvas.height = vp.height;
          await page.render({canvasContext: canvas.getContext('2d'), viewport: vp}).promise;
          // Lower JPEG quality for multi-file to reduce token count
          var quality = (files.length > 1) ? 0.6 : 0.8;
          var b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
          dmAllPages.push({b64: b64, label: file.name + ' p.' + pg});
          dmImages.push(b64);
        }
        totalPages += pages;
        pdfCount++;
        // Warn if too many pages with multiple file types
        if(files.length > 1 && totalPages > 10){
          toast('⚠️ ' + totalPages + ' PDF pages with multiple files — use page range to limit to 5-8 pages for best results', 'warn');
        }
        // Show page range selector
        if(sel){
          sel.style.display = 'block';
          var fromEl = document.getElementById('dm-from-page');
          var toEl = document.getElementById('dm-to-page');
          if(fromEl){ fromEl.min = 1; fromEl.value = 1; fromEl.max = dmImages.length; }
          if(toEl){ toEl.min = 1; toEl.value = dmImages.length; toEl.max = dmImages.length; }
          dmUpdatePageRange();
        }
      }catch(e){ toast('PDF error: ' + file.name + ' — ' + e.message, 'err'); }

    // ── IMAGE ──
    } else if(file.type.startsWith('image/')){
      try{
        var b64img = await new Promise(function(res, rej){
          var r = new FileReader();
          r.onload = function(){ res(r.result.split(',')[1]); };
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        dmImages.push(b64img);
        dmAllPages.push({b64: b64img, label: file.name});
        imgCount++;
      }catch(e){ toast('Image error: ' + file.name, 'err'); }
    }
  }

  // Update label showing all file names
  var nameList = [];
  // PDF filenames
  var pdfNames = [];
  dmAllPages.forEach(function(p){
    if(p.label && p.label.indexOf(' p.') !== -1){
      var fname = p.label.split(' p.')[0];
      if(pdfNames.indexOf(fname) === -1) pdfNames.push(fname);
    }
  });
  pdfNames.forEach(function(n){ nameList.push('📄 '+n); });
  // Excel
  if(dmExcelText){
    // Extract filenames from Excel text headers
    var excelNames = [];
    var matches = dmExcelText.match(/=== ([^|]+) \|/g);
    if(matches) matches.forEach(function(m){
      var n = m.replace('=== ','').replace(' |','').trim();
      if(excelNames.indexOf(n) === -1) excelNames.push(n);
    });
    excelNames.forEach(function(n){ nameList.push('📊 '+n); });
    if(!excelNames.length) nameList.push('📊 Excel');
  }
  // Image filenames
  dmAllPages.forEach(function(p){
    if(p.label && p.label.indexOf(' p.') === -1 && p.name){
      nameList.push('🖼 '+p.name);
    } else if(p.label && p.label.indexOf(' p.') === -1 && p.label.indexOf('p.') === -1){
      nameList.push('🖼 '+p.label);
    }
  });
  if(nameList.length > 0){
    var summary = '✅ ' + nameList.length + ' file' + (nameList.length > 1 ? 's' : '') + ': ' + nameList.join(' · ');
    if(lbl){ lbl.textContent = summary; lbl.style.display = 'block'; }
    if(delbtn) delbtn.style.display = 'inline-block';
    if(pdfCount > 0 || imgCount > 0 || excelCount > 0) toast('✅ ' + (pdfCount+imgCount+excelCount) + ' file(s) added', 'ok');
  }
  // Reset input so next upload triggers onchange
  input.value = '';
}

// ── MESSAGE RENDERING (markdown, HTML escaping) ────────────────────────
function dmEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }


// ── Markdown renderer with LaTeX protection ──

function dmRenderMarkdown(text){
  if(!text) return '';
  if(!window.marked || !window.marked.parse){
    return dmEsc(text).replace(/\n/g,'<br>');
  }
  try {
    // Step 1: protect LaTeX expressions from markdown processing
    var latexBlocks = [];
    var protected_text = text
      .replace(/\$\$([\s\S]*?)\$\$/g, function(m, inner){
        latexBlocks.push('$$'+inner+'$$');
        return 'LATEX_BLOCK_'+(latexBlocks.length-1)+'_END';
      })
      .replace(/\$([^$\n]+?)\$/g, function(m, inner){
        latexBlocks.push('$'+inner+'$');
        return 'LATEX_INLINE_'+(latexBlocks.length-1)+'_END';
      })
      .replace(/\\\(([\s\S]*?)\\\)/g, function(m, inner){
        latexBlocks.push('\\('+inner+'\\)');
        return 'LATEX_INLINE_'+(latexBlocks.length-1)+'_END';
      })
      .replace(/\\\[([\s\S]*?)\\\]/g, function(m, inner){
        latexBlocks.push('\\['+inner+'\\]');
        return 'LATEX_BLOCK_'+(latexBlocks.length-1)+'_END';
      });

    // Step 2: parse markdown
    var html = window.marked.parse(protected_text);

    // Step 3: restore LaTeX
    html = html
      .replace(/LATEX_BLOCK_(\d+)_END/g, function(m, i){ return latexBlocks[parseInt(i)]; })
      .replace(/LATEX_INLINE_(\d+)_END/g, function(m, i){ return latexBlocks[parseInt(i)]; });

    return html;
  } catch(e) {
    return dmEsc(text).replace(/\n/g,'<br>');
  }
}

function dmAddMessage(role, content, extras){
  extras=extras||{};
  var win=document.getElementById('dm-chat-window');
  var welcome=document.getElementById('dm-welcome');
  if(welcome) welcome.remove();

  var div=document.createElement('div');
  var lbl=extras.model||dmModel;
  var lblColor=lbl==='gpt'?'#10a37f':lbl==='claude'?'#c96442':'#a78bfa';
  var lblText=lbl==='gpt'?'⚡ LLM 1':lbl==='claude'?'◆ LLM 2':'🔀 DualMind Auto';
  var ts=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

  if(role==='user'){
    div.innerHTML='<div style="display:flex;justify-content:flex-end;margin-bottom:4px;">'
      +'<div style="background:linear-gradient(135deg,rgba(6,182,212,0.12),rgba(124,58,237,0.12));border:1px solid rgba(6,182,212,0.2);padding:10px 14px;border-radius:12px 12px 2px 12px;max-width:80%;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.9);white-space:pre-wrap;">'+dmEsc(content)+'</div></div>';
    dmExportData.push({role:'user',text:content,timestamp:ts});
  } else {
    var html='<div style="margin-bottom:4px;">';
    html+='<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;color:'+lblColor+';display:flex;align-items:center;gap:6px;">'+lblText+'<span style="color:rgba(255,255,255,0.2);font-size:9px;">'+ts+'</span></div>';
    html+='<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);padding:14px;border-radius:2px 12px 12px 12px;">';
    if(extras.checkpoint) html+=dmRenderCheckpoint(extras.checkpoint);
    if(content){
      html+='<div class="dm-msg-content dm-markdown" style="font-size:13px;line-height:1.85;color:rgba(255,255,255,0.88);">'+dmRenderMarkdown(content)+'</div>';
    }
    if(extras.scorecard) html+=dmRenderScorecard(extras.scorecard);
    html+='</div></div>';
    div.innerHTML=html;
    setTimeout(function(){
      // Animate score bars first (fast, non-blocking)
      div.querySelectorAll('.dm-bar-fill').forEach(function(bar){
        var w=bar.getAttribute('data-width');
        setTimeout(function(){ bar.style.width=w+'%'; },50);
      });
      // MathJax in a separate timeout so it doesn't block UI
      setTimeout(function(){
        if(window.MathJax&&MathJax.typesetPromise){
          MathJax.typesetPromise([div]).catch(function(){});
        }
      }, 100);
    },0);
    dmExportData.push({role:'ai',text:content,scorecard:extras.scorecard||null,timestamp:ts});
  } // end else
  win.appendChild(div);
  win.scrollTop=win.scrollHeight;
  return div;
} // end dmAddMessage

// ── TYPING INDICATOR ──────────────────────────────────────────────────
function dmShowTyping(label){
  var win=document.getElementById('dm-chat-window');
  var div=document.createElement('div');
  div.id='dm-typing';
  div.innerHTML='<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.25);border-radius:2px 12px 12px 12px;width:fit-content;">'
    +'<div style="display:flex;gap:5px;align-items:center;">'
    +'<div style="width:8px;height:8px;border-radius:50%;background:#06b6d4;animation:typingBounce 1.2s infinite;"></div>'
    +'<div style="width:8px;height:8px;border-radius:50%;background:#06b6d4;animation:typingBounce 1.2s 0.2s infinite;"></div>'
    +'<div style="width:8px;height:8px;border-radius:50%;background:#06b6d4;animation:typingBounce 1.2s 0.4s infinite;"></div>'
    +'</div><span id="dm-typing-lbl" style="font-size:12px;font-weight:700;color:#06b6d4;animation:dmLabelPulse 2s ease-in-out infinite;">'+(label||'Processing...')+'</span></div>';
  win.appendChild(div);
  win.scrollTop=win.scrollHeight;
}
function dmUpdateTyping(label){ var el=document.getElementById('dm-typing-lbl'); if(el) el.textContent=label; }
function dmRemoveTyping(){ var el=document.getElementById('dm-typing'); if(el) el.remove(); }

// ── Checkpoint rendering ──

// ── CHECKPOINT & QUALITY SCORECARD DISPLAY ──────────────────────────────
function dmRenderCheckpoint(cp){
  var complexity=cp.complexity||2;
  var segs='';
  for(var i=1;i<=3;i++){
    var color=i<=complexity?(complexity===1?'#10b981':complexity===2?'#f59e0b':'#ef4444'):'rgba(255,255,255,0.1)';
    segs+='<div style="height:3px;flex:1;border-radius:2px;background:'+color+';transition:background 0.3s;"></div>';
  }
  var available=Array.isArray(cp.data_available)?cp.data_available.join(', ')||'None':cp.data_available||'None';
  var missing=Array.isArray(cp.data_missing)?cp.data_missing.join(', ')||'None':cp.data_missing||'None';
  return '<div style="background:rgba(6,182,212,0.05);border:1px solid rgba(6,182,212,0.2);border-radius:8px;padding:12px;margin-bottom:12px;">'
    +'<div style="font-size:11px;font-weight:800;color:#06b6d4;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">⚡ Pipeline Interpretation</div>'
    +'<div style="font-size:11px;margin-bottom:4px;"><span style="color:rgba(255,255,255,0.4);min-width:110px;display:inline-block;">Interpreted as:</span> '+dmEsc(cp.interpreted_as||'—')+'</div>'
    +'<div style="font-size:11px;margin-bottom:4px;"><span style="color:rgba(255,255,255,0.4);min-width:110px;display:inline-block;">Domain:</span> '+dmEsc(cp.domain||'—')+'</div>'
    +'<div style="font-size:11px;margin-bottom:4px;"><span style="color:rgba(255,255,255,0.4);min-width:110px;display:inline-block;">Question type:</span> '+dmEsc(cp.question_type||'—')+'</div>'
    +'<div style="font-size:11px;margin-bottom:8px;"><span style="color:rgba(255,255,255,0.4);min-width:110px;display:inline-block;">Complexity:</span> '+complexity+'/3 <div style="display:flex;gap:3px;margin-top:4px;">'+segs+'</div></div>'
    +'<div style="font-size:11px;margin-bottom:4px;"><span style="color:rgba(255,255,255,0.4);min-width:110px;display:inline-block;">Available:</span> '+dmEsc(available)+'</div>'
    +'<div style="font-size:11px;"><span style="color:rgba(255,255,255,0.4);min-width:110px;display:inline-block;">Missing:</span> <span style="color:#ef4444;">'+dmEsc(missing)+'</span></div>'
    +'</div>';
}

function dmRenderScorecard(sc){
  var combined=sc.combined_score||Math.round(((sc.answer_score||0)+(sc.confidence_score||0))/2);
  var color=combined>=90?'#10b981':combined>=75?'#06b6d4':combined>=60?'#f59e0b':'#ef4444';
  var grade=sc.grade||(combined>=90?'Excellent':combined>=75?'Good':combined>=60?'Acceptable':combined>=40?'Weak':'Unreliable');
  var verdict=sc.verdict||(combined>=90?'Publish / Act on it':combined>=75?'Minor review needed':combined>=60?'Validate key points':combined>=40?'Collect more data':'Do not act on this');

  var items=[
    {label:'Relevance',val:sc.relevance,max:20},
    {label:'Evidence',val:sc.evidence_quality,max:20},
    {label:'Completeness',val:sc.completeness,max:15},
    {label:'Logic',val:sc.logical_consistency,max:15},
    {label:'Actionability',val:sc.actionability,max:15},
    {label:'Clarity',val:sc.clarity,max:10},
    {label:'Uncertainty',val:sc.honest_uncertainty,max:5},
  ];

  var itemsHtml=items.map(function(item){
    var pct=Math.round(((item.val||0)/item.max)*100);
    return '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:6px;padding:8px;">'
      +'<div style="font-size:9px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">'+item.label+' /'+item.max+'</div>'
      +'<div style="height:3px;background:rgba(255,255,255,0.08);border-radius:2px;margin-bottom:4px;overflow:hidden;">'
      +'<div class="dm-bar-fill" data-width="'+pct+'" style="height:100%;width:0%;background:'+color+';border-radius:2px;transition:width 0.8s ease;"></div></div>'
      +'<div style="font-size:14px;font-weight:800;color:'+color+';font-family:DM Sans,sans-serif;">'+(item.val||0)+'</div></div>';
  }).join('');

  return '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:14px;margin-top:14px;">'
    +'<div style="font-size:10px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">📊 Answer Quality Scorecard</div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(95px,1fr));gap:6px;margin-bottom:12px;">'+itemsHtml+'</div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:12px 16px;">'
    +'<div><div style="font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Combined Score</div>'
    +'<div style="font-size:34px;font-weight:900;color:'+color+';font-family:DM Sans,sans-serif;">'+combined+'<span style="font-size:14px;color:rgba(255,255,255,0.3)">/100</span></div>'
    +'<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px;">'+dmEsc(verdict)+'</div></div>'
    +'<div style="text-align:right;"><span style="padding:5px 14px;border-radius:20px;font-size:12px;font-weight:800;background:'+color+'22;color:'+color+';border:1px solid '+color+'44;font-family:DM Sans,sans-serif;">'+dmEsc(grade)+'</span>'
    +'<div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:8px;">Answer: '+(sc.answer_score||'—')+'/100<br>Confidence: '+(sc.confidence_score||'—')+'/100</div></div>'
    +'</div></div>';
}

function dmParseResponse(text){
  var checkpoint=null, scorecard=null, cleanText=text;
  var blocks=text.match(/```json[\s\S]*?```/g)||[];
  blocks.forEach(function(b){
    try{ var p=JSON.parse(b.replace(/```json|```/g,'').trim()); if(p.checkpoint) checkpoint=p.checkpoint; if(p.scorecard) scorecard=p.scorecard; }catch(e){}
  });
  try{ var m=text.match(/\{[\s\S]*?"scorecard"[\s\S]*?\}/); if(m){ var p=JSON.parse(m[0]); if(p.scorecard) scorecard=p.scorecard; } }catch(e){}
  try{ var m=text.match(/\{[\s\S]*?"checkpoint"[\s\S]*?\}/); if(m){ var p=JSON.parse(m[0]); if(p.checkpoint) checkpoint=p.checkpoint; } }catch(e){}
  // Remove JSON blocks but be conservative - only remove the actual scorecard/checkpoint JSON
  cleanText = text
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/\{\s*"scorecard"\s*:[\s\S]*?\}\s*\}/g, '')
    .replace(/\{\s*"checkpoint"\s*:[\s\S]*?\}\s*\}/g, '')
    .trim();
  return {checkpoint:checkpoint, scorecard:scorecard, cleanText:cleanText};
}

// ── SESSION STATS ─────────────────────────────────────────────────────
function dmUpdateStats(score){
  dmSessionStats.queries++;
  dmSessionStats.scores.push(score);
  var avg=Math.round(dmSessionStats.scores.reduce(function(a,b){return a+b;},0)/dmSessionStats.scores.length);
  var top=Math.max.apply(null,dmSessionStats.scores);
  var q=document.getElementById('dm-stat-queries'); if(q) q.textContent=dmSessionStats.queries;
  var a=document.getElementById('dm-stat-avg'); if(a) a.textContent=avg;
  var t=document.getElementById('dm-stat-top'); if(t) t.textContent=top;
  // Persist to localStorage for admin
  var tq=parseInt(localStorage.getItem('dm_total_queries')||'0')+1;
  localStorage.setItem('dm_total_queries',tq);
  var allScores=JSON.parse(localStorage.getItem('dm_all_scores')||'[]');
  allScores.push(score);
  localStorage.setItem('dm_all_scores',JSON.stringify(allScores));
}
function dmUpdateCalls(n){
  dmSessionStats.calls+=n;
  // Persist to localStorage for admin
  var tc=parseInt(localStorage.getItem('dm_total_calls')||'0')+n;
  localStorage.setItem('dm_total_calls',tc);
}

// ── SESSION SAVE/LOAD/DELETE/RENDER ─────────────────────────────────────
function dmSaveSession(){
  if(!dmMessages.length){ toast('Nothing to save yet','warn'); return; }
  var sessions=JSON.parse(localStorage.getItem('dm_sessions')||'[]');
  var name='Session '+new Date().toLocaleDateString()+' '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  sessions.unshift({name:name, messages:dmMessages, exportData:dmExportData, stats:dmSessionStats, timestamp:Date.now()});
  if(sessions.length>10) sessions=sessions.slice(0,10); // keep last 10
  localStorage.setItem('dm_sessions',JSON.stringify(sessions));
  dmRenderSavedList();
  toast('✅ Session saved','ok');
}

function dmLoadSession(idx){
  var sessions=JSON.parse(localStorage.getItem('dm_sessions')||'[]');
  var s=sessions[idx];
  if(!s) return;
  dmClearSession(true);
  dmMessages=s.messages||[];
  dmExportData=s.exportData||[];
  dmSessionStats=s.stats||{queries:0,scores:[],calls:0};
  // Re-render stats
  var q=document.getElementById('dm-stat-queries'); if(q) q.textContent=dmSessionStats.queries;
  var c=document.getElementById('dm-stat-calls'); if(c) c.textContent=dmSessionStats.calls;
  if(dmSessionStats.scores.length){
    var avg=Math.round(dmSessionStats.scores.reduce(function(a,b){return a+b;},0)/dmSessionStats.scores.length);
    var top=Math.max.apply(null,dmSessionStats.scores);
    var a=document.getElementById('dm-stat-avg'); if(a) a.textContent=avg;
    var t=document.getElementById('dm-stat-top'); if(t) t.textContent=top;
  }
  // Re-render messages from exportData
  dmExportData.forEach(function(item){
    if(item.role==='user') dmAddMessage('user',item.text);
    else dmAddMessage('ai',item.text,{scorecard:item.scorecard||null,model:'auto'});
  });
  toast('✅ Session loaded','ok');
}

function dmDeleteSession(idx){
  var sessions=JSON.parse(localStorage.getItem('dm_sessions')||'[]');
  sessions.splice(idx,1);
  localStorage.setItem('dm_sessions',JSON.stringify(sessions));
  dmRenderSavedList();
}

function dmRenderSavedList(){
  var list=document.getElementById('dm-saved-list');
  if(!list) return;
  var sessions=JSON.parse(localStorage.getItem('dm_sessions')||'[]');
  if(!sessions.length){ list.innerHTML='<div style="font-size:10px;color:rgba(255,255,255,0.25);text-align:center;padding:6px;">No saved sessions</div>'; return; }
  list.innerHTML=sessions.map(function(s,i){
    return '<div style="display:flex;align-items:center;gap:4px;padding:5px 6px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:6px;">'
      +'<div onclick="dmLoadSession('+i+')" style="flex:1;font-size:10px;color:rgba(255,255,255,0.6);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+dmEsc(s.name)+'">'+dmEsc(s.name.slice(0,22))+'</div>'
      +'<button onclick="dmDeleteSession('+i+')" style="padding:2px 6px;background:transparent;border:none;color:rgba(239,68,68,0.5);cursor:pointer;font-size:11px;">×</button>'
      +'</div>';
  }).join('');
}

// ── SESSION EXPORT (download as text file) ──────────────────────────────
function dmExportSession(){
  if(!dmExportData.length){ toast('Nothing to export yet','warn'); return; }

  var date = new Date().toLocaleString();
  var qCount = dmExportData.filter(function(i){ return i.role==='user'; }).length;
  var mode = dmPipelineMode === 'professional' ? 'Professional Mode' : 'Research Mode';

  var convHtml = '';
  dmExportData.forEach(function(item){
    if(item.role==='user'){
      convHtml += '<div class="q-block">'
        +'<div class="q-label">QUERY</div>'
        +'<div class="q-text">'+dmEsc(item.text||'').replace(/\n/g,'<br>')+'</div>'
        +'</div>';
    } else {
      var rendered = (window.marked && window.marked.parse)
        ? window.marked.parse(item.text||'')
        : dmEsc(item.text||'').replace(/\n/g,'<br>');
      convHtml += '<div class="a-block">'
        +'<div class="a-label">AI ANALYSIS <span class="ts">'+item.timestamp+'</span></div>'
        +'<div class="a-text">'+rendered+'</div>';
      if(item.scorecard){
        var sc = item.scorecard;
        var col = sc.combined_score>=90?'#059669':sc.combined_score>=75?'#0284c7':sc.combined_score>=60?'#d97706':'#dc2626';
        var items = [
          {l:'Relevance',v:sc.relevance,m:20},{l:'Evidence',v:sc.evidence_quality,m:20},
          {l:'Completeness',v:sc.completeness,m:15},{l:'Logic',v:sc.logical_consistency,m:15},
          {l:'Actionability',v:sc.actionability,m:15},{l:'Clarity',v:sc.clarity,m:10},
          {l:'Uncertainty',v:sc.honest_uncertainty,m:5}
        ];
        var barsHtml = items.map(function(it){
          var pct = Math.round(((it.v||0)/it.m)*100);
          return '<div class="sc-item"><div class="sc-lbl">'+it.l+'</div>'
            +'<div class="sc-bar"><div style="width:'+pct+'%;height:100%;background:'+col+';border-radius:2px;"></div></div>'
            +'<div class="sc-val">'+(it.v||0)+'/'+it.m+'</div></div>';
        }).join('');
        convHtml += '<div class="scorecard">'
          +'<div class="sc-top"><span class="sc-title">Quality Scorecard</span>'
          +'<span class="sc-num" style="color:'+col+'">'+sc.combined_score+'<span style="font-size:13px;color:#94a3b8;">/100</span></span>'
          +'<span class="sc-grade" style="background:'+col+'20;color:'+col+'">'+dmEsc(sc.grade||'')+'</span></div>'
          +'<div class="sc-grid">'+barsHtml+'</div>'
          +'<div class="sc-verdict">'+dmEsc(sc.verdict||'')+'</div>'
          +'</div>';
      }
      convHtml += '</div>';
    }
  });

  var ts = String(Date.now());
  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    +'<title>DualMind Report</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Serif+4:wght@300;400;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">'
    +'<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></scr'+'ipt>'
    +'<script>window.MathJax={tex:{inlineMath:[["$","$"],["\\\\(","\\\\)"]],displayMath:[["$$","$$"],["\\\\[","\\\\]"]],processEscapes:true}};</scr'+'ipt>'
    +'<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" async></scr'+'ipt>'
    +'<style>'
    +'*{margin:0;padding:0;box-sizing:border-box;}'
    +'body{font-family:"Source Serif 4",Georgia,serif;background:#f5f3f0;color:#1a1a2e;font-size:15px;line-height:1.8;}'
    +'.toolbar{position:fixed;top:0;left:0;right:0;background:rgba(255,255,255,0.97);backdrop-filter:blur(8px);border-bottom:1px solid #e2e8f0;padding:12px 40px;display:flex;align-items:center;justify-content:space-between;z-index:99;}'
    +'.tbar-title{font-family:"Playfair Display",serif;font-size:15px;font-weight:700;}'
    +'.tbar-btns{display:flex;gap:8px;}'
    +'.btn-p{padding:7px 18px;background:#1a1a2e;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-family:"Source Serif 4",serif;}'
    +'.btn-w{padding:7px 18px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-family:"Source Serif 4",serif;}'
    +'#doc{max-width:840px;margin:76px auto 60px;background:#fff;border-radius:12px;box-shadow:0 8px 48px rgba(0,0,0,0.1);overflow:hidden;}'
    +'.cover{background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:56px 56px 48px;color:#fff;}'
    +'.cov-tag{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:36px;}'
    +'.cov-h1{font-family:"Playfair Display",serif;font-size:36px;font-weight:900;line-height:1.15;margin-bottom:12px;}'
    +'.cov-sub{font-size:12px;color:rgba(255,255,255,0.45);letter-spacing:2px;text-transform:uppercase;margin-bottom:44px;}'
    +'.cov-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;border-top:1px solid rgba(255,255,255,0.08);padding-top:28px;}'
    +'.cov-ml{font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;}'
    +'.cov-mv{font-size:14px;font-weight:600;}'
    +'.body{padding:44px 56px;}'
    +'.q-block{margin-bottom:28px;padding:18px 22px;background:#f0f4ff;border-left:3px solid #2563eb;border-radius:0 8px 8px 0;}'
    +'.q-label{font-size:9px;font-weight:700;letter-spacing:3px;color:#2563eb;margin-bottom:6px;}'
    +'.q-text{font-style:italic;color:#334155;}'
    +'.a-block{margin-bottom:36px;}'
    +'.a-label{font-size:9px;font-weight:700;letter-spacing:3px;color:#059669;margin-bottom:10px;display:flex;align-items:center;gap:8px;}'
    +'.ts{font-size:9px;color:#94a3b8;font-weight:400;}'
    +'.a-text{color:#334155;font-size:14px;line-height:1.85;}'
    +'.a-text h1,.a-text h2,.a-text h3{font-family:"Playfair Display",serif;color:#0f172a;margin:18px 0 8px;}'
    +'.a-text h2{font-size:19px;}.a-text h3{font-size:16px;}'
    +'.a-text p{margin-bottom:10px;}'
    +'.a-text ul,.a-text ol{padding-left:22px;margin-bottom:10px;}'
    +'.a-text li{margin-bottom:4px;}'
    +'.a-text code{font-family:"JetBrains Mono",monospace;font-size:12px;background:#f1f5f9;padding:1px 5px;border-radius:3px;}'
    +'.a-text pre{background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px;overflow:auto;margin:10px 0;}'
    +'.a-text table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px;}'
    +'.a-text th{background:#f8fafc;padding:7px 11px;border:1px solid #e2e8f0;font-weight:600;text-align:left;}'
    +'.a-text td{padding:7px 11px;border:1px solid #e2e8f0;}'
    +'.scorecard{margin-top:18px;background:#f0fffe;border:1px solid #d1fae5;border-radius:8px;padding:18px 22px;}'
    +'.sc-top{display:flex;align-items:center;gap:10px;margin-bottom:14px;}'
    +'.sc-title{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#64748b;flex:1;}'
    +'.sc-num{font-family:"Playfair Display",serif;font-size:26px;font-weight:900;}'
    +'.sc-grade{padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;}'
    +'.sc-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;}'
    +'.sc-item{display:flex;align-items:center;gap:6px;}'
    +'.sc-lbl{font-size:10px;color:#64748b;min-width:84px;}'
    +'.sc-bar{flex:1;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;}'
    +'.sc-val{font-size:10px;font-weight:700;color:#1a1a2e;min-width:28px;text-align:right;}'
    +'.sc-verdict{font-size:12px;color:#64748b;font-style:italic;border-top:1px solid #e2e8f0;padding-top:10px;}'
    +'.sep{border:none;border-top:1px solid #f1f5f9;margin:28px 0;}'
    +'.footer{text-align:center;padding:20px;background:#f8fafc;font-size:10px;color:#94a3b8;letter-spacing:2px;text-transform:uppercase;}'
    +'@media print{.toolbar{display:none!important;}body{background:#fff;}#doc{box-shadow:none;margin:0;border-radius:0;}}'
    +'</style></head><body>'
    +'<div class="toolbar"><div class="tbar-title">🧠 DualMind Research Report</div>'
    +'<div class="tbar-btns">'
    +'<button class="btn-p" onclick="dlPDF()">⬇ Download PDF</button>'
    +'<button class="btn-w" onclick="dlWord()">📄 Download Word</button>'
    +'</div></div>'
    +'<div id="doc">'
    +'<div class="cover">'
    +'<div class="cov-tag">Smart Academy AI · DualMind Pipeline</div>'
    +'<div class="cov-h1">Research Analysis Report</div>'
    +'<div class="cov-sub">'+mode+' · Dual-LLM Verified Analysis</div>'
    +'<div class="cov-meta">'
    +'<div><div class="cov-ml">Date</div><div class="cov-mv">'+date+'</div></div>'
    +'<div><div class="cov-ml">Queries</div><div class="cov-mv">'+qCount+' question'+(qCount!==1?'s':'')+'</div></div>'
    +'<div><div class="cov-ml">Pipeline</div><div class="cov-mv">DualMind v2.1</div></div>'
    +'</div></div>'
    +'<div class="body">'+convHtml+'</div>'
    +'<div class="footer">Smart Academy AI · DualMind Research Pipeline · Confidential</div>'
    +'</div>'
    +'<scr'+'ipt>'
    +'function dlPDF(){'
    +'var b=document.querySelector(".btn-p");b.textContent="⏳ Generating...";b.disabled=true;'
    +'var opt={margin:0,filename:"DualMind-Report-'+ts+'.pdf",'
    +'image:{type:"jpeg",quality:0.98},'
    +'html2canvas:{scale:2,useCORS:true,logging:false},'
    +'jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}};'
    +'html2pdf().set(opt).from(document.getElementById("doc")).save()'
    +'.then(function(){b.textContent="⬇ Download PDF";b.disabled=false;});'
    +'}'
    +'function dlWord(){'
    +'var c=document.getElementById("doc").innerHTML;'
    +'var w="<html><head><meta charset=UTF-8>'
    +'<style>body{font-family:Calibri,sans-serif;font-size:11pt;line-height:1.6;color:#1a1a2e;}'
    +'h1,h2,h3{color:#0f172a;}table{border-collapse:collapse;width:100%;}'
    +'td,th{border:1px solid #ccc;padding:5pt;font-size:10pt;}'
    +'</style></head><body>"+c+"</body></html>";'
    +'var blob=new Blob([w],{type:"application/msword"});'
    +'var url=URL.createObjectURL(blob);'
    +'var a=document.createElement("a");'
    +'a.href=url;a.download="DualMind-Report-'+ts+'.doc";'
    +'document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);'
    +'}'
    +'</scr'+'ipt></body></html>';

  var win = window.open('','_blank');
  if(win){
    win.document.write(html);
    win.document.close();
    toast('✅ Report ready — click Download PDF or Word','ok');
  } else {
    var blob = new Blob([html],{type:'text/html'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href=url; a.download='DualMind-Report-'+ts+'.html';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    toast('✅ Report downloaded — open and use buttons','ok');
  }
}

// ── EXAMPLE PROMPTS & SESSION CLEAR ──────────────────────────────────────
function dmUseExample(el){
  var inp=document.getElementById('dm-input');
  if(inp){ inp.value=el.textContent; inp.focus(); }
}

// ── Clear session ──
function dmClearSession(silent){
  dmMessages=[];dmExportData=[];
  dmSessionStats={queries:0,scores:[],calls:0};
  dmPendingCheckpoint=null;
  ['dm-stat-queries','dm-stat-calls'].forEach(function(id){ var el=document.getElementById(id); if(el) el.textContent='0'; });
  ['dm-stat-avg','dm-stat-top'].forEach(function(id){ var el=document.getElementById(id); if(el) el.textContent='—'; });
  var win=document.getElementById('dm-chat-window');
  if(win) win.innerHTML='<div id="dm-welcome" style="text-align:center;padding:40px 20px;">'
    +'<div style="font-size:40px;margin-bottom:12px;">🧠</div>'
    +'<div style="font-size:18px;font-weight:900;color:#fff;margin-bottom:6px;font-family:DM Sans,sans-serif;">DualMind Research Pipeline</div>'
    +'<div style="font-size:12px;color:rgba(255,255,255,0.4);max-width:380px;margin:0 auto 20px;line-height:1.6;">Session cleared. Upload a document or ask a new question.</div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">'
    +'<span class="dm-chip" onclick="dmUseExample(this)">Summarize key findings</span>'
    +'<span class="dm-chip" onclick="dmUseExample(this)">Solve all questions in the document</span>'
    +'<span class="dm-chip" onclick="dmUseExample(this)">Generate a full report</span>'
    +'</div></div>';
  dmResetSteps();
  if(!silent) toast('Session cleared','ok');
}

// ── MAIN SEND FLOW ────────────────────────────────────────────────────
function dmSend(){
  if(dmLoading) return;
  var inp=document.getElementById('dm-input');
  var text=(inp?inp.value.trim():'');
  if(!text){ toast('Please type a question','warn'); return; }
  var langEl=document.getElementById('dm-lang'); var lang=langEl?langEl.value:'English';
  dmCurrentLang = lang;

  // Debug — show what's loaded
  console.log('[DualMind Send] dmAllPages:', dmAllPages.length, 'dmImages:', dmImages.length, 'dmExcelText:', dmExcelText ? dmExcelText.length + ' chars' : 'none');
  dmAllPages.forEach(function(p,i){ console.log('  Page',i,p.label); });

  // Apply page range filter — only to PDF pages, keep direct photos
  var fromEl = document.getElementById('dm-from-page');
  var toEl = document.getElementById('dm-to-page');
  if(fromEl && toEl && dmAllPages.length > 0){
    var from = Math.max(1, parseInt(fromEl.value)||1) - 1; // 0-indexed
    var to = Math.min(dmAllPages.length, parseInt(toEl.value)||dmAllPages.length);
    // Separate PDF pages from direct photos
    var pdfPages = dmAllPages.filter(function(p){ return p.label && p.label.indexOf(' p.') !== -1; });
    var directPhotos = dmAllPages.filter(function(p){ return p.label && p.label.indexOf(' p.') === -1; });
    // Apply range to PDF pages only
    var selectedPdfPages = pdfPages.slice(from, to);
    // Rebuild dmImages: selected PDF pages + all direct photos
    dmImages = selectedPdfPages.map(function(p){ return p.b64; })
              .concat(directPhotos.map(function(p){ return p.b64; }));
  }

  var userContent;
  // Always build rich content with Excel + images + question
  var textBlock = '[Language: '+lang+']\n\n';
  if(dmExcelText) textBlock += '[Excel/Spreadsheet Data]\n'+dmExcelText+'\n\n';
  textBlock += '[Question]\n'+text;

  if(dmImages.length){
    userContent=[{type:'text',text:textBlock}];
    dmImages.forEach(function(img){
      // Detect actual image type from base64 header
      var mediaType = 'image/jpeg';
      if(img.startsWith('iVBORw0KGgo')) mediaType = 'image/png';
      else if(img.startsWith('/9j/')) mediaType = 'image/jpeg';
      else if(img.startsWith('R0lGOD')) mediaType = 'image/gif';
      else if(img.startsWith('UklGR')) mediaType = 'image/webp';
      userContent.push({type:'image_url',image_url:{url:'data:'+mediaType+';base64,'+img}});
    });
  } else {
    userContent = textBlock;
  }
  if(inp){ inp.value=''; inp.style.height='auto'; }
  dmAddMessage('user',text);
  var msgs = dmMessages.slice();
  // If Excel loaded and no images, prepend Excel data
  if(dmExcelText && !dmImages.length){
    userContent = '[Language: '+lang+']\n\n[Excel Data]\n'+dmExcelText+'\n\n[Question]\n'+text;
  }
  msgs.push({role:'user',content:userContent});

  // If clarification count > 0, ask LLM for clarifying questions first
  if(dmClarifyCount > 0){
    dmPendingQuestion = text;
    dmPendingMessages = msgs;
    dmAskClarifyingQuestions(msgs, dmClarifyCount);
  } else {
    dmMessages.push({role:'user',content:userContent});
    dmCallAPI(dmMessages);
  }
}

async function dmAskClarifyingQuestions(msgs, n){
  dmLoading = true;
  var sendBtn = document.getElementById('dm-send-btn');
  if(sendBtn) sendBtn.disabled = true;
  dmShowTyping('Generating ' + n + ' clarifying question' + (n>1?'s':'') + '...');

  var clarifyPrompt = 'Before answering, generate EXACTLY ' + n + ' clarifying question(s) that would help you give a better answer. '
    + 'Rules: (1) Only ask what is genuinely unclear — if context makes it obvious, skip it. '
    + '(2) Each question must require a SHORT answer (one word or one sentence max). '
    + '(3) For each question, suggest 2-3 likely answer options based on the document context. '
    + '(4) NEVER rephrase or repeat the user original question back. '
    + '(5) Questions should clarify: abbreviations, units, dates, ambiguous terms, data errors, missing context. '
    + '(6) Cover any domain — science, law, medicine, geology, finance, engineering, education. '
    + 'Respond ONLY with a JSON array, no other text: '
    + '[{"q":"question text","suggestions":["option1","option2","option3"]}, ...] '
    + 'If nothing is unclear, return an empty array: []';

  var clarifyMsgs = msgs.slice();
  clarifyMsgs.push({role:'user', content: clarifyPrompt});

  try {
    var res = await fetch(WORKER_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET, action:'dualmind', messages:clarifyMsgs, model:'llm1', pipelineMode:dmPipelineMode, lang:dmCurrentLang, apiKey:getApiKey(), clarifyMode:true})
    });
    var data = await res.json();
    dmRemoveTyping();
    dmLoading = false;
    if(sendBtn) sendBtn.disabled = false;

    var raw = (data.reply||'').trim();
    // Extract JSON array from response
    var match = raw.match(/\[[\s\S]*\]/);
    var questions = [];
    if(match){
      try{ questions = JSON.parse(match[0]); }catch(e){ questions = []; }
    }
    if(!questions.length){
      // No clarification needed — proceed directly
      dmMessages = dmPendingMessages;
      dmCallAPI(dmMessages);
    } else {
      dmShowClarifyPanel(questions);
    }
  } catch(e){
    dmRemoveTyping();
    dmLoading = false;
    if(sendBtn) sendBtn.disabled = false;
    // On error proceed directly
    dmMessages = dmPendingMessages;
    dmCallAPI(dmMessages);
  }
}

// ── API CALL (sends to worker, handles dual-LLM response) ──────────────
function dmSendWithMessages(msgs, skipClarify){
  dmMessages = msgs;
  dmCallAPI(msgs);
}

// ── Call API ──
async function dmCallAPI(msgs){
  dmLoading=true;
  var sendBtn=document.getElementById('dm-send-btn');
  if(sendBtn) sendBtn.disabled=true;
  dmSetStep(0);
  dmShowTyping('⏳ Be patient — LLMs are analysing your documents...');

  var stepN=0;
  var stepLabels=[
    '🔍 Decomposing your question...',
    '🧠 Be patient — LLM 1 is reading your documents...',
    '✅ Be patient — LLM 2 is verifying the analysis...',
    '📝 Generating your answer...',
    '📊 Scoring confidence...',
    '⏳ Almost done — finalising response...'
  ];
  var stepDelay=dmModel==='auto'?3500:2000; // slower so user can read messages
  var stepInterval=setInterval(function(){
    stepN++; if(stepN<=5){ dmSetStep(stepN); dmUpdateTyping(stepLabels[stepN-1]||'Processing...'); }
  },stepDelay);

  try{
    dmUpdateCalls(dmModel==='auto'?3:1);
    var res=await fetch(WORKER_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_appSecret:APP_SECRET,action:'dualmind',messages:msgs,model:dmModel,pipelineMode:dmPipelineMode,lang:dmCurrentLang,apiKey:getApiKey()})
    });
    var data=await res.json();
    clearInterval(stepInterval);
    dmRemoveTyping();
    dmSetStep(5);

    if(data.error){ dmAddMessage('ai','❌ Error: '+data.error,{model:dmModel}); return; }

    var parsed=dmParseResponse(data.reply||'');
    var displayText = parsed.cleanText || (data.reply ? '*(Response received — no text extracted)*' : '*(Empty response from pipeline)*');
    dmAddMessage('ai',displayText,{checkpoint:parsed.checkpoint,scorecard:parsed.scorecard,model:dmModel});
    dmMessages.push({role:'assistant',content:data.reply});
    if(parsed.scorecard) dmUpdateStats(parsed.scorecard.combined_score||0);
    setTimeout(dmResetSteps,2000);

    // Track cost for RM/RS/RY codes
    var resCode = (typeof S !== 'undefined' && S.researchCode)
      ? S.researchCode
      : sessionStorage.getItem('saa_current_research_code');
    console.log('[Cost Track] resCode:', resCode, 'usage:', JSON.stringify(data.usage));
    if(data.usage && resCode && resCode !== 'RM-ADMIN'){
      // Save to localStorage so admin table picks it up
      try {
        var lk = 'saa_cost_'+resCode;
        var ld = JSON.parse(localStorage.getItem(lk)||'null') || {code:resCode,inputTokens:0,outputTokens:0,calls:0};
        ld.inputTokens  += (data.usage.prompt_tokens||0);
        ld.outputTokens += (data.usage.completion_tokens||0);
        ld.calls = (ld.calls||0) + 1;
        ld.lastCall = Date.now();
        localStorage.setItem(lk, JSON.stringify(ld));
        // Also ensure RM code is in saa_codes so admin table can find it
        try {
          var allCodes = JSON.parse(localStorage.getItem('saa_codes')||'[]');
          var exists = allCodes.some(function(x){ return x.code === resCode; });
          if(!exists){
            allCodes.push({code:resCode, type:'Research', expiry:'', created:Date.now()});
            localStorage.setItem('saa_codes', JSON.stringify(allCodes));
          }
        } catch(e2){}
      } catch(e){}
      // Also send to KV via Worker
      try {
        fetch(WORKER_URL,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({_appSecret:APP_SECRET, action:'track-cost',
            code:resCode, usage:data.usage, type:'research'})
        }).catch(function(){});
      } catch(e){}
    }

  }catch(err){
    clearInterval(stepInterval);
    dmRemoveTyping();
    dmResetSteps();
    dmAddMessage('ai','❌ Connection error: '+err.message,{model:dmModel});
  }finally{
    dmLoading=false;
    if(sendBtn) sendBtn.disabled=false;
  }
}

// ── INITIALIZATION (runs once on script load) ───────────────────────────
// ── Init ──
(function(){
  dmSetModel('auto');
  dmRenderSavedList();
  // Restore research code from session
  var savedRCode = sessionStorage.getItem('saa_current_research_code');
  if(savedRCode && typeof S !== 'undefined') S.researchCode = savedRCode;
})();

