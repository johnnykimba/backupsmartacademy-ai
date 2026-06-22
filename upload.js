// ════════════════════════════════════════════════════════════════
// features/upload.js
// Document upload handling: images, PDF, Word, and Excel files.
// Covers drag-and-drop, file-type detection, PDF page range
// selection/extraction, and thumbnail rendering.
// Extracted from index.html (split, June 2026). Logic unchanged.
//
// DEPENDENCIES (must load before this file):
//   - core/session-state.js (S — S.images, S.extractedPageCount)
//   - core/ui-helpers.js    (toast)
//   - External libs loaded elsewhere in the page: pdf.js (for pdfDoc),
//     SheetJS/XLSX (for Excel parsing in handlePDF)
//
// CALLED BY OTHER FEATURES:
//   - startSession() (setup/session-start code, not yet extracted)
//     checks S.images.length / saPDFText before calling initQuiz().
//
// KNOWN DEAD CODE: `saPages` is assigned in two places inside
// handlePDF() but never declared with var/let, and never read
// anywhere in the original file. It's an accidental implicit global
// left over from earlier development. Preserved as-is here (not
// removed, since deleting unused-looking code during a structural
// split risks breaking something not yet traced) — flagged for your
// awareness, safe to clean up later once confirmed truly unused.
// ════════════════════════════════════════════════════════════════

// ── UPLOAD STATE ───────────────────────────────────────────────────
var saPDFText = ''; // stores Excel/Word text content for AI sessions
let pdfDoc = null;
let pdfTotalPages = 0;

// ── HANDLE MULTIPLE MIXED FILES (images + PDFs + Excel together) ──
async function handleAllFiles(files){
  if(!files || !files.length) return;
  var imgs = [], pdfs = [], excels = [];
  Array.from(files).forEach(function(f){
    var fn = f.name.toLowerCase();
    if(fn.match(/\.(jpg|jpeg|png|webp)$/)) imgs.push(f);
    else if(fn.endsWith('.pdf')) pdfs.push(f);
    else if(fn.match(/\.xlsx?$/)) excels.push(f);
  });

  // Process images
  if(imgs.length) handleFiles(imgs);

  // Process PDFs — preserve existing images
  for(var i=0;i<pdfs.length;i++) await handlePDF(pdfs[i]);

  // Process Excel
  if(excels.length && typeof XLSX !== 'undefined'){
    var MAX_EXCEL = 5;
    var excelSkipped = 0;
    if(excels.length > MAX_EXCEL){
      excelSkipped = excels.length - MAX_EXCEL;
      excels = excels.slice(0, MAX_EXCEL);
    }
    var txt = '';
    for(var j=0;j<excels.length;j++){
      var buf = await excels[j].arrayBuffer();
      var wb = XLSX.read(buf,{type:'array'});
      wb.SheetNames.forEach(function(sn){
        txt += '=== '+excels[j].name+' | '+sn+' ===\n'+XLSX.utils.sheet_to_csv(wb.Sheets[sn])+'\n\n';
      });
    }
    saPDFText = (saPDFText ? saPDFText+'\n\n' : '') + txt;
    if(!S.images||!S.images.length) S.images=[{type:'excel',data:''}];
    var sessionSec=document.getElementById('session-section');
    if(sessionSec) sessionSec.style.display='block';
    if(excelSkipped > 0 && typeof toast === 'function'){
      toast('⚠️ Maximum 5 Excel files per session — ' + excelSkipped + ' file(s) skipped', 'err');
    }
  }

  var total = imgs.length+pdfs.length+excels.length;
  if(total>1) toast('✅ '+total+' files loaded ('+[imgs.length?imgs.length+' image':'',pdfs.length?pdfs.length+' PDF':'',excels.length?excels.length+' Excel':''].filter(Boolean).join(', ')+')','ok');
}

// ── HANDLE MULTIPLE PDF FILES ───────────────────────────────────────
async function handleMultiplePDFs(files){
  if(!files || !files.length) return;
  if(files.length === 1){ await handlePDF(files[0]); return; }

  toast('📂 Loading ' + files.length + ' files...', 'ok');
  var excelText = '';
  var fileNames = [];
  var excelCount = 0, pdfCount = 0, imgCount = 0;

  for(var i = 0; i < files.length; i++){
    var file = files[i];
    var fname = file.name.toLowerCase();
    var isExcel = fname.endsWith('.xls') || fname.endsWith('.xlsx');
    var isPDF = fname.endsWith('.pdf');
    var isImg = fname.endsWith('.jpg') || fname.endsWith('.jpeg') || fname.endsWith('.png');
    fileNames.push(file.name);

    if(isExcel && typeof XLSX !== 'undefined'){
      try {
        var buf = await file.arrayBuffer();
        var wb = XLSX.read(buf, {type:'array'});
        wb.SheetNames.forEach(function(sn){
          excelText += '=== FILE: ' + file.name + ' | Sheet: ' + sn + ' ===\n' + XLSX.utils.sheet_to_csv(wb.Sheets[sn]) + '\n\n';
        });
        excelCount++;
      } catch(e){ toast('Excel error: ' + file.name, 'err'); }

    } else if(isPDF){
      // Each PDF adds its rendered pages to S.images via handlePDF
      await handlePDF(file);
      pdfCount++;

    } else if(isImg){
      // Read image as base64 and add directly to S.images
      try {
        var imgB64 = await new Promise(function(res, rej){
          var r = new FileReader();
          r.onload = function(){ res(r.result); };
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        if(!S.images) S.images = [];
        S.images.push({data: imgB64, b64: imgB64.split(',')[1]});
        imgCount++;
      } catch(e){ toast('Image error: ' + file.name, 'err'); }
    }
  }

  // Merge all Excel text
  if(excelText){
    saPDFText = (saPDFText ? saPDFText + '\n\n' : '') + excelText;
    if(!S.images || !S.images.length) S.images = [{type:'excel', data:''}];
  }

  // Update counter
  var parts = [];
  if(pdfCount) parts.push(pdfCount + ' PDF');
  if(excelCount) parts.push(excelCount + ' Excel');
  if(imgCount) parts.push(imgCount + ' image');
  var ctr = document.getElementById('upload-counter');
  if(ctr){ ctr.textContent = '✅ ' + parts.join(' + ') + ' loaded'; ctr.style.color='#10b981'; }

  // Show sessions
  var sessionSec = document.getElementById('session-section');
  if(sessionSec) sessionSec.style.display = 'block';
  toast('✅ ' + files.length + ' files loaded (' + parts.join(', ') + ')', 'ok');
}

// ── HANDLE SINGLE PDF/WORD/EXCEL FILE (main upload handler) ────────
async function handlePDF(file){
  if(!file){
    toast('No file selected','err');
    return;
  }

  // Accept PDF, Word or Excel
  const fname = file.name.toLowerCase();
  const isPDF   = file.type === 'application/pdf' || fname.endsWith('.pdf');
  const isWord  = file.type === 'application/msword' ||
                  file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                  fname.endsWith('.doc') || fname.endsWith('.docx');
  const isExcel = file.type === 'application/vnd.ms-excel' ||
                  file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                  fname.endsWith('.xls') || fname.endsWith('.xlsx');

  // Handle Excel: convert to CSV text then treat as text document
  if(isExcel){
    try{
      toast('📊 Reading Excel file...','ok');
      const arrayBuffer = await file.arrayBuffer();
      // Use SheetJS if available, otherwise show toast
      if(typeof XLSX !== 'undefined'){
        const wb = XLSX.read(arrayBuffer, {type:'array'});
        var allText = '';
        wb.SheetNames.forEach(function(sheetName){
          const ws = wb.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(ws);
          allText += '=== Sheet: ' + sheetName + ' ===\n' + csv + '\n\n';
        });
        // Store as text document pages
        saPages = [{b64: btoa(unescape(encodeURIComponent(allText))), type:'text', name:file.name}];
        saPDFText = allText;
        // Set S.images with a text placeholder so sessions unlock
        S.images = [{data: 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(allText.substring(0,100)))), type:'excel'}];
        var ctr = document.getElementById('upload-counter');
        if(ctr){ ctr.textContent = '✅ Excel · ' + wb.SheetNames.length + ' sheet(s) loaded'; ctr.style.color='#10b981'; }
        toast('✅ Excel file read: ' + wb.SheetNames.length + ' sheet(s) loaded','ok');
        // Hide PDF controls, show session section directly
        var pdfSec = document.getElementById('upload-pdf-section');
        if(pdfSec) pdfSec.style.display = 'none';
        var sessionSec = document.getElementById('session-section');
        if(sessionSec) sessionSec.style.display = 'block';
      } else {
        toast('📊 Excel loaded — AI will process the data','ok');
        const b64 = await new Promise(function(res,rej){
          var r = new FileReader();
          r.onload = function(){ res(r.result.split(',')[1]); };
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        saPages = [{b64:b64, type:'excel', name:file.name}];
        var ctr = document.getElementById('upload-counter');
        if(ctr) ctr.textContent = '1 / 10 ' + (saT('pages_uploaded')||'pages uploaded');
        var useBtn = document.getElementById('use-pages-btn');
        if(useBtn) useBtn.style.display = 'block';
      }
    }catch(e){
      toast('Excel read error: '+e.message,'err');
    }
    return;
  }

  if(!isPDF && !isWord){
    toast('Please select a PDF or Word file (.pdf, .doc, .docx)','err');
    return;
  }

  // ── Handle Word documents — convert to images via mammoth + canvas ──
  if(isWord){
    const status = document.getElementById('pdf-status');
    status.textContent = '⏳ Loading Word document...';
    status.style.color = '#1a56db';
    try{
      if(!window.mammoth){
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
      }
      const arrayBuf = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({arrayBuffer: arrayBuf});
      const html = result.value;

      // Render HTML to canvas pages via iframe
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:800px;height:1100px;border:none;';
      document.body.appendChild(iframe);
      iframe.contentDocument.open();
      iframe.contentDocument.write(`<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;padding:40px;width:720px;">${html}
<!-- ── RESEARCH ACCESS GATE MODAL — body level ── -->
<div id="research-gate-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:99999;align-items:center;justify-content:center;padding:20px;">
  <div style="background:#0f172a;border:1px solid rgba(124,58,237,0.4);border-radius:16px;padding:28px;width:100%;max-width:380px;">
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:28px;margin-bottom:8px;">🔬</div>
      <div style="font-size:16px;font-weight:900;color:#fff;">Research Mode Access</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:4px;">Enter your Research Access Code</div>
    </div>
    <input id="research-gate-input" type="text" placeholder="e.g. RM-XXXX or RS-XXXX"
      style="width:100%;padding:12px 14px;background:rgba(255,255,255,0.07);border:1px solid rgba(124,58,237,0.4);border-radius:10px;color:#fff;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;box-sizing:border-box;text-transform:uppercase;margin-bottom:8px;"
      oninput="this.value=this.value.toUpperCase()"
      onkeydown="if(event.key==='Enter') verifyResearchGate()">
    <div id="research-gate-error" style="font-size:11px;color:#ef4444;margin-bottom:12px;min-height:16px;"></div>
    <button onclick="verifyResearchGate()" style="width:100%;padding:12px;background:linear-gradient(135deg,#1a56db,#7c3aed);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:'DM Sans',sans-serif;margin-bottom:10px;">🚀 Unlock Research</button>
    <button onclick="document.getElementById('research-gate-modal').style.display='none'" style="width:100%;padding:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:rgba(255,255,255,0.5);font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;">Cancel</button>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════
     ONBOARDING GUIDE OVERLAY
═══════════════════════════════════════════════════ -->
<div id="guide-overlay" style="display:none;position:fixed;inset:0;z-index:999990;background:#0a0f1e;overflow-y:auto;">

  <style>
    #guide-overlay { font-family: 'DM Sans', sans-serif; }
    .guide-lang-btn { padding:6px 14px;border-radius:20px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:'DM Sans',sans-serif; }
    .guide-lang-btn.active { background:rgba(255,255,255,0.12);color:#fff;border-color:rgba(255,255,255,0.4); }
    .guide-tab { padding:10px 20px;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.2s; }
    .guide-tab.active { background:linear-gradient(135deg,#1a56db,#06b6d4);color:#fff; }
    .guide-tab:not(.active) { background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5); }
    .guide-step { background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;margin-bottom:16px;display:flex;gap:16px;align-items:flex-start; }
    .guide-step-num { width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;flex-shrink:0; }
    .guide-step-content h4 { margin:0 0 6px;font-size:15px;font-weight:800;color:#fff; }
    .guide-step-content p { margin:0;font-size:13px;color:rgba(255,255,255,0.6);line-height:1.6; }
    .guide-mockup { background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px;margin-top:10px;font-size:11px; }
    .guide-section-title { font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin:28px 0 14px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08); }
    .guide-highlight { display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;margin-left:6px; }
    .guide-tip { background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:10px 14px;margin-top:10px;font-size:12px;color:rgba(255,255,255,0.7); }
  </style>

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0d1f3e,#1a2d5a);border-bottom:1px solid rgba(255,255,255,0.08);padding:16px 24px;position:sticky;top:0;z-index:10;">
    <div style="max-width:820px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="font-size:22px;">📘</div>
        <div>
          <div id="guide-title" style="font-size:16px;font-weight:900;color:#fff;">Smart Academy AI — User Guide</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);">Complete onboarding guide</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        
        <button onclick="document.getElementById('guide-overlay').style.display='none';document.body.style.overflow='';" style="padding:8px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:rgba(255,255,255,0.6);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">✕ Close</button>
      </div>
    </div>

    <!-- Language selector -->
    <div style="max-width:820px;margin:10px auto 0;display:flex;flex-wrap:wrap;gap:6px;">
      <button class="guide-lang-btn active" onclick="guideSwitchLang(\'en\',this)">EN</button>
      <button class="guide-lang-btn" onclick="guideSwitchLang(\'fr\',this)">FR</button>
      <button class="guide-lang-btn" onclick="guideSwitchLang(\'es\',this)">ES</button>
      <button class="guide-lang-btn" onclick="guideSwitchLang(\'pt\',this)">PT</button>
      <button class="guide-lang-btn" onclick="guideSwitchLang(\'ar\',this)">AR</button>
      <button class="guide-lang-btn" onclick="guideSwitchLang(\'hi\',this)">HI</button>
      <button class="guide-lang-btn" onclick="guideSwitchLang(\'zh\',this)">ZH</button>
      <button class="guide-lang-btn" onclick="guideSwitchLang(\'ru\',this)">RU</button>
      <button class="guide-lang-btn" onclick="guideSwitchLang(\'de\',this)">DE</button>
      <button class="guide-lang-btn" onclick="guideSwitchLang(\'sw\',this)">SW</button>
    </div>

    <!-- Guide type tabs -->
    <div style="max-width:820px;margin:10px auto 0;display:flex;gap:8px;">
      <button class="guide-tab active" id="guide-tab-learner" onclick="guideSwitchTab(\'learner\')">🎓 Learner / Student</button>
      
    </div>
  </div>

  <!-- Content -->
  <div style="max-width:820px;margin:0 auto;padding:24px 16px 60px;" id="guide-content">
    <!-- Rendered by JS -->
  </div>
</div>


<!-- ── GUIDE FLOATING BUTTON ── -->
<button id="guide-fab" onclick="openGuide('learner')"
  style="display:none;"
  title="User Guide">
  <span>?</span><span>Help</span>
</button>

<!-- LEGAL MODAL -->
<div id="legal-modal" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);overflow-y:auto;padding:20px 16px;">
  <div style="background:#fff;border-radius:16px;max-width:700px;margin:0 auto;padding:20px;position:relative;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <h2 style="font-size:18px;font-weight:800;color:#0f2044;margin:0;">Legal Policies</h2>
      <button onclick="document.getElementById('legal-modal').style.display='none'" style="background:#f1f5f9;border:none;border-radius:8px;padding:8px 14px;font-size:14px;font-weight:700;cursor:pointer;color:#334155;">✕ Close</button>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:16px;background:#e2e8f0;padding:4px;border-radius:10px;">
      <button onclick="showLegalTab('terms')" id="leg-tab-terms" style="flex:1;padding:9px;border-radius:8px;border:none;background:#0f2044;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">Terms</button>
      <button onclick="showLegalTab('refund')" id="leg-tab-refund" style="flex:1;padding:9px;border-radius:8px;border:none;background:transparent;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;">Refund</button>
      <button onclick="showLegalTab('privacy')" id="leg-tab-privacy" style="flex:1;padding:9px;border-radius:8px;border:none;background:transparent;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;">Privacy</button>
    </div>
    <div id="leg-terms" style="color:#334155;">
      <h3 style="font-size:15px;font-weight:800;color:#0f2044;">Terms &amp; Conditions</h3>
      <p style="font-size:12px;color:#64748b;">Effective: June 2026 · smartacademy-ai.com</p>
      <p style="font-size:13px;line-height:1.7;"><strong>1. Service:</strong> Smart Academy AI provides AI-powered quizzes, summaries and tutoring. Research/Professional mode provides document analysis only — no quizzes.</p>
      <p style="font-size:13px;line-height:1.7;"><strong>2. Access Codes:</strong> Valid for purchased period only. Individual codes = 1 device. Group codes = 250m radius. Sharing codes is prohibited.</p>
      <p style="font-size:13px;line-height:1.7;"><strong>3. Payment:</strong> Via bank transfer or mobile money (Airtel, M-Pesa, Orange). PayFast card payments: <span style="background:#d1fae5;color:#065f46;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;">✅ Operational</span></p>
      <p style="font-size:13px;line-height:1.7;"><strong>4. Usage:</strong> AI tools are for learning support only. Not for completing assignments. Sharing codes is prohibited.</p>
    </div>
    <div id="leg-refund" style="display:none;color:#334155;">
      <h3 style="font-size:15px;font-weight:800;color:#0f2044;">Refund Policy</h3>
      <p style="font-size:12px;color:#64748b;">Effective: June 2026 · smartacademy-ai.com</p>
      <p style="font-size:13px;line-height:1.7;"><strong>All sales are final once a code is activated.</strong></p>
      <p style="font-size:13px;line-height:1.7;"><strong>Eligible refunds:</strong> Code not delivered · Faulty code · Duplicate payment</p>
      <p style="font-size:13px;line-height:1.7;"><strong>Non-refundable:</strong> Activated codes · Change of mind · Expired codes</p>
      <div style="background:#eff6ff;border-radius:10px;padding:12px;margin-top:10px;">
        <p style="font-size:13px;font-weight:700;color:#1e40af;margin:0 0 6px;">Contact for refunds:</p>
        <p style="font-size:13px;color:#1e3a8a;margin:2px 0;">📧 info@smartacademy-ai.com</p>
        <p style="font-size:13px;color:#1e3a8a;margin:2px 0;">📧 kasongokimba@yahoo.com</p>
        <p style="font-size:13px;color:#1e3a8a;margin:2px 0;">💬 WhatsApp: +27 76 132 8664</p>
      </div>
    </div>
    <div id="leg-privacy" style="display:none;color:#334155;">
      <h3 style="font-size:15px;font-weight:800;color:#0f2044;">Privacy Policy</h3>
      <p style="font-size:12px;color:#64748b;">Effective: June 2026 · smartacademy-ai.com</p>
      <p style="font-size:13px;line-height:1.7;"><strong>Data collected:</strong> Name, grade level, uploaded documents (temporary), device ID, payment reference.</p>
      <p style="font-size:13px;line-height:1.7;"><strong>Usage:</strong> Generate quizzes/reports, verify codes, improve platform. Documents are NOT stored permanently.</p>
      <p style="font-size:13px;line-height:1.7;"><strong>Third parties:</strong> OpenAI, Anthropic (AI), Cloudflare (infrastructure). We do not sell your data.</p>
      <div style="background:#eff6ff;border-radius:10px;padding:12px;margin-top:10px;">
        <p style="font-size:13px;color:#1e3a8a;margin:0;">📧 info@smartacademy-ai.com</p>
        <p style="font-size:13px;color:#1e3a8a;margin:2px 0;">📧 kasongokimba@yahoo.com</p>
        <p style="font-size:13px;color:#1e3a8a;margin:2px 0;">💬 WhatsApp: +27 76 132 8664</p>
      </div>
    </div>
  </div>
</div>
<!-- ══ END GUIDED TOUR ══════════════════════════════════════════ -->
</body></html>`);
      iframe.contentDocument.close();
      await new Promise(r => setTimeout(r, 600));

      // Split content into page-sized chunks and capture
      const body = iframe.contentDocument.body;
      const totalHeight = body.scrollHeight;
      const pageHeight = 1020;
      const numPages = Math.ceil(totalHeight / pageHeight);

      const existingCount = S.images.length;
      const sessionRemaining = Math.max(0, 30 - existingCount);
      const capPages = Math.min(numPages, sessionRemaining);
      if(capPages < numPages){
        toast('⚠️ Only ' + capPages + ' of ' + numPages + ' page(s) added — 30 item combined session limit reached', 'err');
      }
      // Append to existing session content (photos/PDF/Excel already added)
      // instead of wiping it — respects the combined 30-item session cap.
      for(let pg = 0; pg < capPages; pg++){
        const canvas = document.createElement('canvas');
        canvas.width = 800; canvas.height = pageHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0,0,800,pageHeight);
        // Use html2canvas if available, else simple text rendering
        const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${pageHeight}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial;font-size:13px;padding:30px;overflow:hidden;height:${pageHeight}px;">
              ${html}
            </div>
          </foreignObject>
        </svg>`;
        const svgBlob = new Blob([svgData], {type:'image/svg+xml;charset=utf-8'});
        const url = URL.createObjectURL(svgBlob);
        await new Promise(resolve => {
          const img = new Image();
          img.onload = () => { ctx.drawImage(img, 0, -pg*pageHeight); URL.revokeObjectURL(url); resolve(); };
          img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
          img.src = url;
        });
        S.images.push({data: canvas.toDataURL('image/jpeg', 0.85), page: pg+1});
      }
      document.body.removeChild(iframe);

      status.textContent = `✅ Word document loaded — ${S.images.length} page(s) extracted`;
      status.style.color = '#10b981';
      renderThumbs();
      const counter = document.getElementById('upload-counter');
      if(counter){ counter.textContent = S.images.length + ' / 30 ' + (saT('pages_uploaded')||'pages uploaded'); counter.style.color='#10b981'; }
      toast(`✅ Word document processed — ${S.images.length} pages ready`,'ok');
    } catch(err){
      console.error('Word error:', err);
      toast('Failed to process Word document. Try converting to PDF first.','err');
      const status2 = document.getElementById('pdf-status');
      if(status2){ status2.textContent = '❌ Word processing failed — please convert to PDF'; status2.style.color='#ef4444'; }
    }
    return;
  }

  const status = document.getElementById('pdf-status');
  status.textContent = '⏳ Loading PDF — please wait...';
  status.style.color = '#1a56db';

  try{
    // Load PDF.js from CDN
    if(!window.pdfjsLib){
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    pdfDoc = await window.pdfjsLib.getDocument({data: arrayBuffer}).promise;
    var newPages = pdfDoc.numPages;
    pdfTotalPages += newPages; // accumulate across multiple PDFs

    // Show cumulative count
    var prevCount = pdfTotalPages - newPages;
    status.textContent = prevCount > 0
      ? `✅ PDF loaded — ${newPages} pages found (${pdfTotalPages} total)`
      : `✅ PDF loaded — ${pdfTotalPages} pages found`;
    status.style.color = '#10b981';
    // Show reset button when PDF is loaded
    var resetBtn = document.getElementById('btn-reset-uploads');
    if(resetBtn) resetBtn.style.display = 'block';

    // Preserve existing images — don't clear when adding more PDFs
    // Only clear pdfText, not images
    saPDFText = '';

    // Update page range max to total accumulated pages
    document.getElementById('pdf-from').max = pdfTotalPages;
    document.getElementById('pdf-to').max = pdfTotalPages;
    // Only reset from/to on first PDF load
    if(prevCount === 0){
      document.getElementById('pdf-from').value = 1;
      document.getElementById('pdf-to').value = Math.min(30, pdfTotalPages);
    } else {
      // Extend 'to' to cover new pages too
      document.getElementById('pdf-to').value = Math.min(pdfTotalPages, parseInt(document.getElementById('pdf-to').value) + newPages);
    }

    // Show range section
    document.getElementById('pdf-range-section').style.display = 'block';

    // Render preview thumbnails for first 20 pages
    await renderPDFThumbs(Math.min(20, pdfTotalPages));
    validatePageRange();

  } catch(err){
    status.textContent = '❌ Could not read PDF. Please try again.';
    status.style.color = '#ef4444';
    console.error(err);
  }
}

// ── RENDER PDF PAGE-SELECTION THUMBNAILS ────────────────────────────
async function renderPDFThumbs(count){
  const strip = document.getElementById('pdf-thumb-strip');
  strip.innerHTML = '<div style="font-size:12px;color:#64748b;padding:10px;">Loading previews...</div>';

  const thumbs = [];
  for(let i=1; i<=count; i++){
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({scale:0.3});
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({canvasContext:canvas.getContext('2d'), viewport}).promise;

    thumbs.push(`
      <div class="pdf-thumb" id="pthumb-${i}" onclick="toggleThumbSelect(${i})" ontouchend="event.preventDefault();toggleThumbSelect(${i});" style="touch-action:manipulation;cursor:pointer;">
        <img src="${canvas.toDataURL()}">
        <div class="pg-num">P${i}</div>
        <div class="pg-check">✓</div>
      </div>`);
  }

  strip.innerHTML = thumbs.join('');
  if(count < pdfTotalPages){
    strip.innerHTML += `<div style="flex-shrink:0;width:70px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#64748b;text-align:center;padding:8px;">+${pdfTotalPages-count} more pages</div>`;
  }
}

// ── TOGGLE PDF PAGE SELECTION (tap a thumbnail to include/exclude) ─
function toggleThumbSelect(pageNum){
  // Update from/to range based on thumb click
  const from = parseInt(document.getElementById('pdf-from').value);
  const to   = parseInt(document.getElementById('pdf-to').value);
  if(pageNum < from) document.getElementById('pdf-from').value = pageNum;
  if(pageNum > to)   document.getElementById('pdf-to').value = pageNum;
  validatePageRange();
}

// ── VALIDATE PDF PAGE RANGE INPUT ───────────────────────────────────
function validatePageRange(){
  let from = parseInt(document.getElementById('pdf-from').value) || 1;
  let to   = parseInt(document.getElementById('pdf-to').value) || 10;

  // Clamp values
  from = Math.max(1, Math.min(from, pdfTotalPages));
  to   = Math.max(from, Math.min(to, pdfTotalPages));

  document.getElementById('pdf-from').value = from;
  document.getElementById('pdf-to').value   = to;

  const count = to - from + 1;
  const info  = document.getElementById('pdf-range-info');

  // Highlight selected thumbs
  for(let i=1; i<=pdfTotalPages; i++){
    const t = document.getElementById(`pthumb-${i}`);
    if(t) t.classList.toggle('selected', i>=from && i<=to);
  }

  info.style.background = 'rgba(16,185,129,0.05)';
  info.style.borderColor = 'rgba(16,185,129,0.2)';
  info.style.color = '#10b981';
  info.textContent = `✅ ${count} page(s) selected (Pages ${from} to ${to})`;

  // Auto-confirm: extract pages automatically after short delay
  clearTimeout(window._autoExtractTimer);
  window._autoExtractTimer = setTimeout(function(){
    extractPDFPages();
  }, 800);
}

// ── EXTRACT SELECTED PDF PAGES (adaptive resolution by page count) ──
async function extractPDFPages(){
  const from  = parseInt(document.getElementById('pdf-from').value);
  let to      = parseInt(document.getElementById('pdf-to').value);
  let count = to - from + 1;

  if(count < 1){
    toast('Please select at least 1 page','err');
    return;
  }

  // Respect the combined 30-item session cap (shared across photos/PDF/Excel)
  const existingCount = S.images.length;
  const sessionRemaining = Math.max(1, 30 - existingCount);
  const effectiveMax = Math.min(30, sessionRemaining);
  if(count > effectiveMax){
    to = from + effectiveMax - 1;
    count = effectiveMax;
    const toEl = document.getElementById('pdf-to');
    if(toEl) toEl.value = to;
    if(existingCount > 0){
      alert('⚠️ Session limit is 30 items total (combined photos/PDF/Excel).\n\nYou already have ' + existingCount + ' item(s) in this session. Only pages ' + from + ' to ' + to + ' will be added.');
    } else {
      alert('⚠️ Learning mode is limited to 30 pages.\n\nYour PDF has ' + count + ' pages. Only pages ' + from + ' to ' + to + ' will be used.\n\nTip: Upload 3–5 focused pages for best results.');
    }
  }
  const info = document.getElementById('pdf-range-info');
  info.textContent = `⏳ Extracting pages ${from} to ${to}...`;
  info.style.color = '#1a56db';

  // Append to existing session content (photos/Excel already added) instead
  // of wiping it — respects the combined 30-item session cap.

  // Remove any previously-extracted PDF pages (re-extraction with a new
  // range) while preserving photos/Excel content already in the session.
  S.images = S.images.filter(function(img){ return img.pdfPage === undefined; });

  const pageCount = (to - from + 1);
  // Scale down resolution/quality when many pages are selected, to keep total payload reasonable
  // 1-3 pages: full quality for best OCR accuracy. 4+ pages: reduced to avoid oversized requests.
  const pdfScale   = pageCount <= 3 ? 2.0 : pageCount <= 6 ? 1.5 : 1.2;
  const pdfQuality = pageCount <= 3 ? 0.92 : pageCount <= 6 ? 0.85 : 0.78;

  for(let i=from; i<=to; i++){
    const page     = await pdfDoc.getPage(i);
    const viewport = page.getViewport({scale:pdfScale});
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    await page.render({canvasContext:canvas.getContext('2d'), viewport}).promise;
    const dataUrl  = canvas.toDataURL('image/jpeg', pdfQuality);
    S.images.push({
      name: `pdf-page-${i}.jpg`,
      data: dataUrl,
      b64:  dataUrl.split(',')[1],
      pdfPage: i  // actual PDF page number
    });
  }

  info.style.background = 'rgba(16,185,129,0.06)';
  info.style.borderColor = 'rgba(16,185,129,0.2)';
  info.style.color = '#10b981';
  info.textContent = `✅ ${count} ` + (saT('pages_extracted')||'pages extracted successfully! Ready to start your quiz.');

  // Update button to show confirmed state
  var btnLabel = document.getElementById('extract-btn-label');
  var btn = document.getElementById('btn-extract-pages');
  if(btnLabel) btnLabel.textContent = '✅ '+count+' page(s) confirmed — ready!';
  if(btn){ btn.style.background='linear-gradient(135deg,#10b981,#059669)'; }

  // Store the confirmed page count
  S.extractedPageCount = S.images.length;
  toast(`✅ ${count} pages ready from PDF`,'ok');
}

// ── HANDLE IMAGE FILES (drag-drop or file picker, PNG/JPG/HEIC etc) ──
function handleFiles(files){
  const MAX_IMAGES = 10;
  const MAX_SESSION_TOTAL = 30; // combined cap across photos + PDF pages + Excel files
  const remainingByType = MAX_IMAGES - S.images.length;
  const remainingBySession = MAX_SESSION_TOTAL - S.images.length;
  const remaining = Math.min(remainingByType, remainingBySession);

  if(remaining <= 0){
    var reason = remainingBySession <= 0 ? 'Maximum 30 items allowed per session (combined)' : 'Maximum 10 photos allowed per session';
    toast(reason,'err');
    return;
  }

  const toAdd = Array.from(files).slice(0, remaining);
  const skipped = Array.from(files).length - toAdd.length;

  if(skipped > 0){
    toast(`Only ${remaining} more page(s) allowed — ${skipped} file(s) skipped`,'err');
  }

  toAdd.forEach(f=>{
    // Accept PNG and JPG
    var fname = f.name.toLowerCase();
    var isImage = f.type.startsWith('image/') ||
                  fname.endsWith('.png') || fname.endsWith('.jpg') || fname.endsWith('.jpeg') ||
                  fname.endsWith('.webp') || fname.endsWith('.heic') || fname.endsWith('.heif') ||
                  fname.endsWith('.jfif') || fname.endsWith('.bmp');
    if(!isImage){
      toast('Only image files are accepted — '+f.name+' skipped','err');
      return;
    }
    // Warn on HEIC — GPT-4o may not read it well
    if(fname.endsWith('.heic') || fname.endsWith('.heif')){
      toast('⚠️ iPhone HEIC photo — convert to JPG for best results','inf');
    }
    // Check file size — warn if over 4MB
    if(f.size > 4 * 1024 * 1024){
      toast('⚠️ '+f.name+' is large — compress for best results','inf');
    }
    const r = new FileReader();
    r.onload = e=>{
      S.images.push({name:f.name, data:e.target.result, b64:e.target.result.split(',')[1]});
      renderThumbs();
      // Clear any cached questions from previous session
      localStorage.removeItem('saa_offline_session');
      // Update upload zone counter
      const counter = document.getElementById('upload-counter');
      if(counter){ 
        var parts = [];
        if(S.images.filter(function(i){ return i.type!=='excel'; }).length) parts.push(S.images.filter(function(i){ return i.type!=='excel'; }).length + ' image(s)');
        if(saPDFText) parts.push('Excel');
        var maxForDisplay2 = saPDFText ? 30 : 10;
        counter.textContent = parts.length ? '✅ ' + parts.join(' + ') + ' attached' : S.images.length + ' / ' + maxForDisplay2 + ' ' + (saT('pages_uploaded')||'pages uploaded');
        counter.style.color = S.images.length > 0 ? '#10b981' : '#1a56db';
      }
    };
    r.readAsDataURL(f);
  });
}

// ── CLEAR ALL UPLOADED PAGES ─────────────────────────────────────────
function clearAllUploads(){
  if(!confirm(saT('confirm_clear_all')||'Remove all uploaded pages?')) return;
  S.images = [];
  pdfDoc = null;
  pdfTotalPages = 0;
  // Hide PDF UI elements
  var pdfSection = document.getElementById('pdf-range-section');
  if(pdfSection) pdfSection.style.display = 'none';
  var pdfThumbsRow = document.getElementById('pdf-thumbs-row');
  if(pdfThumbsRow) pdfThumbsRow.innerHTML = '';
  var status = document.getElementById('pdf-status');
  if(status){ status.textContent = ''; }
  // Reset counter
  var counter = document.getElementById('upload-counter');
  if(counter){ counter.textContent = ''; counter.style.color = '#1a56db'; }
  // Hide reset button
  var resetBtn = document.getElementById('btn-reset-uploads');
  if(resetBtn) resetBtn.style.display = 'none';
  renderThumbs();
  toast(saT('all_cleared')||'All pages cleared','ok');
}

// ── RENDER UPLOADED-IMAGE THUMBNAILS ─────────────────────────────────
function renderThumbs(){
  const w = document.getElementById('upload-thumbs');
  // Show/hide clear bar and reset button
  var clearBar = document.getElementById('clear-all-bar');
  if(clearBar) clearBar.style.display = 'none'; // hidden — using reset button instead
  var resetBtn = document.getElementById('btn-reset-uploads');
  var hasPDF = typeof pdfDoc !== 'undefined' && pdfDoc !== null;
  if(resetBtn) resetBtn.style.display = (S.images.length > 0 || hasPDF) ? 'block' : 'none';

  w.innerHTML = S.images.map((img,i)=>`
    <div class="uthumb" style="cursor:${S.quizActive?'not-allowed':'default'}">
      <img src="${img.data}" alt="Page ${i+1}">
      <div class="uthumb-label">P${i+1}</div>
      ${S.quizActive
        ? '<div style=\"position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-size:20px;border-radius:8px;\">🔒</div>'
        : '<button class=\"urm\" onclick=\"event.stopPropagation();removeImg('+i+')\" title=\"Delete page ${i+1}\">✕</button>'}
    </div>`).join('');
  // Update counter
  const counter = document.getElementById('upload-counter');
  if(counter){
    var maxForDisplay = saPDFText ? 30 : 10;
    counter.textContent = S.images.length + ' / ' + maxForDisplay + ' ' + (saT('pages_uploaded')||'pages uploaded');
    counter.style.color = S.images.length >= maxForDisplay ? '#ef4444' : '#1a56db';
  }
}

// ── REMOVE A SINGLE UPLOADED IMAGE ───────────────────────────────────
function removeImg(i){
  S.images.splice(i,1);
  renderThumbs();
}

// ── DRAG-AND-DROP WIRING FOR THE UPLOAD ZONE ─────────────────────────
// NOTE: this runs immediately at script load time (not inside a
// function) — it must execute AFTER the #upload-zone element exists
// in the DOM, same as in the original index.html.
const uz = document.getElementById('upload-zone');
uz.addEventListener('dragover',e=>{e.preventDefault();uz.classList.add('drag');});
uz.addEventListener('dragleave',()=>uz.classList.remove('drag'));
uz.addEventListener('drop',e=>{e.preventDefault();uz.classList.remove('drag');handleFiles(e.dataTransfer.files);});
