// ════════════════════════════════════════════════════════════
// PROFESSIONAL / RESEARCHER MODE — UPLOAD LOGIC
// Adapted faithfully from GeoMind's upload system (greenrock-ai),
// fully namespaced with prof- prefixes throughout so nothing here
// can collide with the existing student-facing upload system
// (handleFiles, handlePDF, S.images, etc.) used by Ask the Tutor
// and the Quiz feature.
// ════════════════════════════════════════════════════════════

var PROF_MAX_PDF_PAGES = 60; // hard cap — GeoMind itself has no cap; this is a new, deliberate limit for this feature
var profAttachedFiles = [];
var profPdfDoc = null;
var profCurrentPdfFile = null;
var profPdfConfirmed = false;
var profSelectedPages = {from: 1, to: 1};

// ── ATTACH FILES ───────────────────────────────────────────
// Wrapped in DOMContentLoaded: this script may load before the
// Professional page's HTML (inserted near the end of the body)
// exists in the DOM yet. Attaching listeners immediately at
// script-load time would crash with "Cannot read properties of
// null" since the buttons wouldn't exist at that point.
document.addEventListener('DOMContentLoaded', function(){
  var attachBtn = document.getElementById('prof-attach-btn');
  var attachInput = document.getElementById('prof-attach-input');
  if(attachBtn && attachInput){
    attachBtn.addEventListener('click', function(){
      attachInput.click();
    });
    attachInput.addEventListener('change', function(e){
      var rawFiles = Array.from(e.target.files);
      var hasPdf = rawFiles.some(function(f){ return f.name.toLowerCase().endsWith('.pdf'); });
      rawFiles.forEach(function(f){ profAttachedFiles.push(f); });
      profRenderFilesPreview();
      e.target.value = '';
      if(hasPdf){
        var pdfFile = rawFiles.find(function(f){ return f.name.toLowerCase().endsWith('.pdf'); });
        if(pdfFile) profShowPdfSelector(pdfFile);
      }
    });
  }
});

function profRenderFilesPreview(){
  var preview = document.getElementById('prof-files-preview');
  preview.innerHTML = profAttachedFiles.map(function(f, i){
    return '<div class="prof-input-file-chip">' + f.name.substring(0, 24) +
      '<button onclick="profRemoveAttached(' + i + ')">&#215;</button></div>';
  }).join('');
}

function profRemoveAttached(i){
  profAttachedFiles.splice(i, 1);
  profRenderFilesPreview();
  var hasPdf = profAttachedFiles.some(function(f){ return f.name.toLowerCase().endsWith('.pdf'); });
  if(!hasPdf) profHidePdfSelector();
}

function profClearAllAttached(){
  profAttachedFiles = [];
  profPdfDoc = null;
  profCurrentPdfFile = null;
  profPdfConfirmed = false;
  profRenderFilesPreview();
  profHidePdfSelector();
}

// ── PDF PAGE SELECTOR ──────────────────────────────────────
async function profShowPdfSelector(file){
  profCurrentPdfFile = file;
  profPdfConfirmed = false;
  var panel = document.getElementById('prof-pdf-selector-panel');
  var thumbs = document.getElementById('prof-pdf-thumbs');
  var status = document.getElementById('prof-pdf-status');
  panel.style.display = 'block';
  thumbs.innerHTML = '<span style="font-size:11px;color:var(--muted);padding:10px;">Loading pages...</span>';
  status.style.display = 'none';

  try{
    if(typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded');
    var arrayBuf = await file.arrayBuffer();
    profPdfDoc = await pdfjsLib.getDocument({data: arrayBuf}).promise;
    var numPages = profPdfDoc.numPages;

    document.getElementById('prof-pdf-from').value = 1;
    document.getElementById('prof-pdf-from').max = numPages;
    document.getElementById('prof-pdf-to').max = Math.min(numPages, PROF_MAX_PDF_PAGES);
    document.getElementById('prof-pdf-to').value = Math.min(numPages, PROF_MAX_PDF_PAGES);
    document.getElementById('prof-pdf-page-count').textContent = numPages + ' pages total'
      + (numPages > PROF_MAX_PDF_PAGES ? ' (max ' + PROF_MAX_PDF_PAGES + ' selectable)' : '');

    // Render thumbnails — cap visual thumbnails at 40 for performance,
    // matching GeoMind's own approach (which capped at 20); the actual
    // page-selection limit (60) is enforced separately below, not by
    // how many thumbnails are rendered.
    thumbs.innerHTML = '';
    var maxThumbs = Math.min(numPages, 40);
    for(var p = 1; p <= maxThumbs; p++){
      var thumbDiv = document.createElement('div');
      thumbDiv.className = 'prof-pdf-thumb';
      thumbDiv.dataset.page = p;
      var canvas = document.createElement('canvas');
      var label = document.createElement('div');
      label.className = 'prof-pdf-thumb-label';
      label.textContent = 'P' + p;
      var check = document.createElement('div');
      check.className = 'prof-pdf-thumb-check';
      check.innerHTML = '&#10003;';
      thumbDiv.appendChild(canvas);
      thumbDiv.appendChild(label);
      thumbDiv.appendChild(check);
      thumbs.appendChild(thumbDiv);

      (function(pg, cv, td){
        profPdfDoc.getPage(pg).then(function(page){
          var vp = page.getViewport({scale: 0.3});
          cv.width = vp.width;
          cv.height = vp.height;
          cv.style.width = '72px';
          cv.style.height = '96px';
          page.render({canvasContext: cv.getContext('2d'), viewport: vp});
        });
        td.addEventListener('click', function(){
          td.classList.toggle('prof-selected');
          profUpdatePageRange();
        });
      })(p, canvas, thumbDiv);
    }
    if(numPages > maxThumbs){
      var more = document.createElement('span');
      more.style.cssText = 'font-size:10px;color:var(--muted);padding:10px;align-self:center;';
      more.textContent = '+ ' + (numPages - maxThumbs) + ' more pages (use From/To fields to select beyond thumbnails)';
      thumbs.appendChild(more);
    }

    profUpdateThumbSelectionFromInputs();
    profValidateAndConfirmPages(false);

  }catch(e){
    thumbs.innerHTML = '<span style="font-size:11px;color:var(--muted);padding:10px;">Preview unavailable — pages will still be sent by range.</span>';
    document.getElementById('prof-pdf-page-count').textContent = '';
  }
}

function profHidePdfSelector(){
  var panel = document.getElementById('prof-pdf-selector-panel');
  if(panel) panel.style.display = 'none';
}

function profUpdatePageRange(){
  var selected = document.querySelectorAll('.prof-pdf-thumb.prof-selected');
  if(!selected.length) return;
  var pages = Array.from(selected).map(function(t){ return parseInt(t.dataset.page); });
  var from = Math.min.apply(null, pages);
  var to = Math.max.apply(null, pages);
  document.getElementById('prof-pdf-from').value = from;
  document.getElementById('prof-pdf-to').value = to;
  profValidateAndConfirmPages(false);
}

function profUpdateThumbSelectionFromInputs(){
  var from = parseInt(document.getElementById('prof-pdf-from').value) || 1;
  var to = parseInt(document.getElementById('prof-pdf-to').value) || 1;
  document.querySelectorAll('.prof-pdf-thumb').forEach(function(t){
    var pg = parseInt(t.dataset.page);
    if(pg >= from && pg <= to) t.classList.add('prof-selected');
    else t.classList.remove('prof-selected');
  });
}

function profValidateAndConfirmPages(showToastMsg){
  var fromEl = document.getElementById('prof-pdf-from');
  var toEl = document.getElementById('prof-pdf-to');
  var status = document.getElementById('prof-pdf-status');
  var confirmBtn = document.getElementById('prof-pdf-confirm-btn');
  if(!fromEl || !toEl) return;

  var totalPages = profPdfDoc ? profPdfDoc.numPages : 999;
  var from = Math.max(1, parseInt(fromEl.value) || 1);
  var to = Math.max(1, parseInt(toEl.value) || 1);

  // Clamp: from >= 1, to <= totalPages, from <= to
  from = Math.max(1, Math.min(from, totalPages));
  to = Math.max(from, Math.min(to, totalPages));

  // Enforce the 60-page combined-selection cap
  var count = to - from + 1;
  var capped = false;
  if(count > PROF_MAX_PDF_PAGES){
    to = from + PROF_MAX_PDF_PAGES - 1;
    count = PROF_MAX_PDF_PAGES;
    capped = true;
  }

  fromEl.value = from;
  toEl.value = to;
  profPdfConfirmed = true;
  profSelectedPages = {from: from, to: to};
  profUpdateThumbSelectionFromInputs();

  if(status){
    status.textContent = '✓ ' + count + ' page(s) confirmed — ready!' + (capped ? ' (capped at ' + PROF_MAX_PDF_PAGES + ' max)' : '');
    status.style.display = 'block';
  }
  if(confirmBtn){
    confirmBtn.textContent = '✓ ' + count + ' page(s) confirmed — ready!';
  }
  if(showToastMsg && typeof toast === 'function'){
    toast(count + ' page(s) ready from PDF' + (capped ? ' — capped at ' + PROF_MAX_PDF_PAGES : ''), capped ? 'err' : 'ok');
  }
}

// ════════════════════════════════════════════════════════════
// PROFESSIONAL / RESEARCHER MODE — ANALYSIS REQUEST + RESULTS
// Connects the upload zone above to the dedicated worker. This
// worker call is COMPLETELY SEPARATE from the main Smart Academy
// worker — no access codes, no payments, no student data involved.
// ════════════════════════════════════════════════════════════

var PROF_WORKER_URL = 'https://prof-research.kasongokimba.workers.dev'; // dedicated, separate worker
var PROF_APP_SECRET = 'Prof2026Secret'; // matches PROF_APP_SECRET set in the dedicated worker's environment variables

async function profRunAnalysis(){
  var input = document.getElementById('prof-question-input');
  var question = input ? input.value.trim() : '';
  if(!question){
    if(typeof toast === 'function') toast('Please enter a question about your document','err');
    return;
  }
  if(!profAttachedFiles.length){
    if(typeof toast === 'function') toast('Please upload a document first','err');
    return;
  }

  var resultsEl = document.getElementById('prof-results');
  var runBtn = document.getElementById('prof-run-btn');
  if(runBtn){ runBtn.disabled = true; runBtn.textContent = '⏳ Analyzing with two AI models...'; }
  if(resultsEl){
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">⏳ Running GPT-4o and Claude in parallel, then verifying results — this may take 20-40 seconds for larger documents...</div>';
  }

  try{
    var images = [];
    var docText = '';

    for(var i = 0; i < profAttachedFiles.length; i++){
      var f = profAttachedFiles[i];
      var ext = f.name.split('.').pop().toLowerCase();

      if(['png','jpg','jpeg'].includes(ext)){
        var b64 = await profReadFileBase64(f);
        images.push(b64);
      } else if(ext === 'pdf' && profPdfDoc && profPdfConfirmed){
        for(var p = profSelectedPages.from; p <= profSelectedPages.to; p++){
          var page = await profPdfDoc.getPage(p);
          var viewport = page.getViewport({scale: 1.5});
          var canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({canvasContext: canvas.getContext('2d'), viewport: viewport}).promise;
          images.push(canvas.toDataURL('image/jpeg', 0.85));
        }
      } else if(['xlsx','xls','csv'].includes(ext) && typeof XLSX !== 'undefined'){
        var buf = await f.arrayBuffer();
        var wb = XLSX.read(buf, {type: 'array'});
        wb.SheetNames.forEach(function(sn){
          docText += '=== ' + f.name + ' | ' + sn + ' ===\n' + XLSX.utils.sheet_to_csv(wb.Sheets[sn]) + '\n\n';
        });
      }
    }

    var res = await fetch(PROF_WORKER_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        _appSecret: PROF_APP_SECRET,
        action: 'analyze-document',
        question: question,
        images: images,
        docText: docText
      })
    });
    var data = await res.json();

    if(!data.ok){
      if(resultsEl) resultsEl.innerHTML = '<div style="padding:16px;color:#ef4444;font-size:13px;">Error: ' + (data.error || 'Unknown error') + '</div>';
      if(typeof toast === 'function') toast('Analysis failed: ' + (data.error || 'unknown error'),'err');
      return;
    }

    profRenderResults(data);

  } catch(e){
    if(resultsEl) resultsEl.innerHTML = '<div style="padding:16px;color:#ef4444;font-size:13px;">Error: ' + e.message + '</div>';
    if(typeof toast === 'function') toast('Analysis failed: ' + e.message,'err');
  } finally {
    if(runBtn){ runBtn.disabled = false; runBtn.textContent = '🔬 Analyze Document'; }
  }
}

function profReadFileBase64(file){
  return new Promise(function(resolve, reject){
    var r = new FileReader();
    r.onload = function(){ resolve(r.result); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Renders the three-panel result (GPT-4o / Claude / Verified Merged),
// styled after GeoMind's DualMind panel layout.
function profRenderResults(data){
  var resultsEl = document.getElementById('prof-results');
  if(!resultsEl) return;

  function simpleMarkdown(text){
    return (text || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>').replace(/$/, '</p>');
  }

  resultsEl.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;">' +
      '<div style="background:rgba(26,86,219,0.08);border:1px solid rgba(26,86,219,0.25);border-radius:10px;padding:14px;">' +
        '<div style="font-size:11px;font-weight:700;color:#1a56db;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">🤖 GPT-4o Analysis</div>' +
        '<div style="font-size:13px;color:#cbd5e1;line-height:1.6;">' + simpleMarkdown(data.gptAnswer) + '</div>' +
      '</div>' +
      '<div style="background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.25);border-radius:10px;padding:14px;">' +
        '<div style="font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">🧠 Claude Analysis</div>' +
        '<div style="font-size:13px;color:#cbd5e1;line-height:1.6;">' + simpleMarkdown(data.claudeAnswer) + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="background:rgba(6,182,212,0.1);border:2px solid rgba(6,182,212,0.4);border-radius:12px;padding:16px;margin-top:12px;">' +
      '<div style="font-size:12px;font-weight:800;color:#06b6d4;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">📋 DualMind — Verified Final Result</div>' +
      '<div style="font-size:14px;color:#fff;line-height:1.7;">' + simpleMarkdown(data.mergedAnswer) + '</div>' +
    '</div>';

  if(window.MathJax && MathJax.typesetPromise){
    MathJax.typesetPromise([resultsEl]).catch(function(){});
  }
}
