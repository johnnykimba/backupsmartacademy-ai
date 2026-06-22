// ════════════════════════════════════════════════════════════════
// core/math-utils.js
// All math-notation conversion/repair functions used across the app.
// Extracted from index.html (split, June 2026).
//
// NOTE on fixMath: this function was previously DEFINED LOCALLY inside
// initQuiz() in the original index.html, but called from several other
// places using a `typeof fixMath === 'function'` guard (a defensive
// workaround for a scope bug). It has been promoted to a true global
// function here. Behavior/logic is 100% unchanged — only its scope.
// The old guard calls still work fine against this global version.
// ════════════════════════════════════════════════════════════════

// ── FIX MATH WORD FORMS → SYMBOLS (used for QUIZ text) ──────────
// Guard: if text already contains clean Unicode math symbols
// (∫ √ ² ³ etc.) it came from the strict no-LaTeX quiz prompt — skip
// LaTeX injection and text-to-symbol replacements entirely to avoid
// double-conversion (e.g. ∫∫). Only run light whitespace cleanup.
function fixMath(s){
  if(!s || typeof s !== 'string') return s;
  var alreadyCleanMath = /[∫√∞≠≤≥≈±×÷∂∇ΣΠ]|[²³⁴⁵⁶⁷⁸⁹⁰¹]/.test(s);
  if(alreadyCleanMath){
    return s.replace(/\*dx\b/gi,' dx').replace(/\*dy\b/gi,' dy').replace(/\*du\b/gi,' du');
  }
  return s
    // ── AUTO-CONVERT PLAIN FRACTIONS TO LATEX ────────────────
    // (2/4)x → \(\frac{2}{4}\)x
    .replace(/\((\d+)\/(\d+)\)/g, function(m,n,d){ return '\\(\\frac{'+n+'}{'+d+'}\\)'; })
    // 2/4 standalone (not inside already converted) → \(\frac{2}{4}\)
    .replace(/(?<!\\frac\{[^}]*\}\{[^}]*)(?<![0-9])(\d+)\/(\d+)(?![0-9}])/g, function(m,n,d){
      return '\\(\\frac{'+n+'}{'+d+'}\\)';
    })
    // ── INTEGRAL NOTATION ────────────────────────────────────
    .replace(/\*dx\b/gi,' dx')
    .replace(/\*dy\b/gi,' dy')
    .replace(/\*du\b/gi,' du')
    .replace(/(?:indefinite\s+)?integral\s+of\s+∫/gi,'∫')
    .replace(/\bDetermine the (?:indefinite\s+)?integral\b/gi,'∫')
    .replace(/\bFind the (?:indefinite\s+)?integral\b/gi,'∫')
    .replace(/\bEvaluate the (?:indefinite\s+)?integral\b/gi,'∫')
    .replace(/\bCalculate the (?:indefinite\s+)?integral\b/gi,'∫')
    .replace(/\bthe (?:indefinite\s+)?integral of\b/gi,'∫')
    .replace(/\b(?:indefinite\s+)?integral of\b/gi,'∫')
    .replace(/\bIntegrate\b/g,'∫').replace(/\bintegrate\b/g,'∫')
    // ── DERIVATIVE / DIFFERENTIAL ────────────────────────────
    .replace(/\bDifferentiate\b/g,'d/dx').replace(/\bdifferentiate\b/g,'d/dx')
    .replace(/\bFind the derivative of\b/gi,'d/dx')
    .replace(/\bFind the first derivative\b/gi,'d/dx')
    .replace(/\bthe derivative of\b/gi,'d/dx')
    // ── LIMIT ────────────────────────────────────────────────
    .replace(/\bthe limit of\b/gi,'lim').replace(/\bFind the limit\b/gi,'lim')
    .replace(/\bLimit of\b/gi,'lim').replace(/\blimit as\b/gi,'lim as')
    // ── TRIG ─────────────────────────────────────────────────
    .replace(/\bcosine\b/gi,'cos').replace(/\bsine\b/gi,'sin')
    .replace(/\btangent\b/gi,'tan').replace(/\bcotangent\b/gi,'cot')
    .replace(/\bcosecant\b/gi,'csc').replace(/\bsecant\b/gi,'sec')
    .replace(/\barc\s*cosine\b/gi,'arccos').replace(/\barc\s*sine\b/gi,'arcsin')
    .replace(/\barc\s*tangent\b/gi,'arctan')
    // ── LOGS / ROOTS ─────────────────────────────────────────
    .replace(/\bnatural log(?:arithm)?\b/gi,'ln')
    .replace(/\blog base (\w+)\b/gi,'log₍$1₎')
    .replace(/\bsquare root\b/gi,'√').replace(/\bcube root\b/gi,'∛')
    .replace(/\bsquare root of\b/gi,'√').replace(/\bcube root of\b/gi,'∛')
    // ── GREEK LETTERS ────────────────────────────────────────
    .replace(/\binfinity\b/gi,'∞')
    .replace(/\btheta\b/gi,'θ').replace(/\bphi\b/gi,'φ')
    .replace(/\balpha\b/gi,'α').replace(/\bbeta\b/gi,'β')
    .replace(/\bdelta\b/gi,'δ').replace(/\bDelta\b/g,'Δ')
    .replace(/\bsigma\b/gi,'σ').replace(/\bSigma\b/g,'Σ')
    .replace(/\blambda\b/gi,'λ').replace(/\bepsilon\b/gi,'ε')
    .replace(/\bmu\b/gi,'μ').replace(/\bnu\b/gi,'ν')
    .replace(/\bpi\b(?!\w)/gi,'π').replace(/\bomega\b/gi,'ω')
    .replace(/\bgamma\b/gi,'γ').replace(/\brho\b/gi,'ρ')
    // ── ANGLE ────────────────────────────────────────────────
    .replace(/\bangle\b/gi,'∠').replace(/\bAngle\b/g,'∠')
    .replace(/\bdegrees\b/gi,'°').replace(/\bradians\b/gi,'rad')
    // ── OPERATORS / SYMBOLS ──────────────────────────────────
    .replace(/\btimes\b/gi,'×').replace(/\bdivided by\b/gi,'÷')
    .replace(/\bgreater than or equal to\b/gi,'≥')
    .replace(/\bless than or equal to\b/gi,'≤')
    .replace(/\bnot equal to\b/gi,'≠')
    .replace(/\bapproximately equal to\b/gi,'≈')
    .replace(/\bplus or minus\b/gi,'±')
    .replace(/\bsummation\b/gi,'Σ').replace(/\bproduct\b(?= of|\s+from)/gi,'Π')
    // ── EXPONENTS TEXT ───────────────────────────────────────
    .replace(/\bsquared\b/gi,'²').replace(/\bcubed\b/gi,'³')
    .replace(/\bto the power of (\d+)\b/gi,(m,n)=>{
      const sup='⁰¹²³⁴⁵⁶⁷⁸⁹';
      return n.split('').map(d=>sup[d]||d).join('');
    })
    // ── e^x ──────────────────────────────────────────────────
    .replace(/e\^x\b/g,'eˣ')
    // ── CONTRACTIONS ─────────────────────────────────────────
    .replace(/\bdon't\b/gi,'do not').replace(/\bcan't\b/gi,'cannot')
    .replace(/\bisn't\b/gi,'is not').replace(/\bwon't\b/gi,'will not')
    .replace(/\bdidn't\b/gi,'did not').replace(/\bdoesn't\b/gi,'does not');
}

// ── DEFENSIVE FIXER FOR FREE-TEXT AI RESPONSES ───────────────────
// (hints, "challenge this question", detailed step-by-step solutions)
// where the AI sometimes forgets backslashes (frac{1}{3} instead of
// \frac{1}{3}) or uses bare parentheses as an informal math-zone
// marker instead of \( \). Handles both cases, line-by-line, with a
// guard against double-wrapping already-correct LaTeX.
function fixFreeTextMath(s){
  if(!s || typeof s !== 'string') return s;
  var supMap3 = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
  var lines = s.split('\n');
  var fixedLines = lines.map(function(line){
    var out = line;

    // If the line already has a proper \( \) or \[ \] pair, trust it as-is —
    // just fix any bare superscripts inside, and skip everything else to avoid
    // double-wrapping already-correct LaTeX.
    var hasProperDelimiter = /\\\([\s\S]*?\\\)/.test(out) || /\\\[[\s\S]*?\\\]/.test(out);
    if(hasProperDelimiter){
      out = out.replace(/\^(\d)(?!\d)/g, function(m, d){ return supMap3[d]||m; });
      return out;
    }

    // Special case: "(int <stuff, possibly with its own nested parens>)" — find the
    // real matching outer paren manually (regex alone gets confused by nested parens).
    var intIdx = out.search(/\(int\b/);
    if(intIdx !== -1){
      var depth = 0, j = intIdx;
      for(; j < out.length; j++){
        if(out[j] === '(') depth++;
        else if(out[j] === ')'){ depth--; if(depth === 0) break; }
      }
      if(depth === 0 && j < out.length){
        var inner = out.slice(intIdx+1, j).replace(/^int\b/, '\\int');
        out = out.slice(0, intIdx) + '\\(' + inner + '\\)' + out.slice(j+1);
      }
    }

    // Ensure frac/cdot have their backslash (AI sometimes omits it)
    out = out.replace(/(?<!\\)frac\{/g, '\\frac{');
    out = out.replace(/(?<!\\)cdot\b/g, '\\cdot');

    var wrappedWholeParen = /\\\(/.test(out); // already wrapped by the int-handling above?
    if(!wrappedWholeParen){
      out = out.replace(/\(((?:[^()]|\([^()]*\))*\\(?:frac|cdot|sqrt|sin|cos|tan|lim|sum|pi|theta|alpha|beta|delta)\b[\s\S]*?)\)/, function(m, inner){
        wrappedWholeParen = true;
        return '\\(' + inner + '\\)';
      });
    }

    // Wrap any remaining bare \frac{a}{b} not part of an already-wrapped zone
    if(!wrappedWholeParen){
      out = out.replace(/\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, function(m, n, d){
        return '\\(\\frac{'+n+'}{'+d+'}\\)';
      });
    }

    // x^4 → x⁴ (simple single-digit exponents only)
    out = out.replace(/\^(\d)(?!\d)/g, function(m, d){ return supMap3[d]||m; });
    return out;
  });

  return fixedLines.join('\n');
}

// ── GLOBAL quizFracDisplay (was already global; defined here for QUIZ
// fraction display — converts plain-Unicode quiz fractions like (2/4)
// or (2x-6)⁵/5 into LaTeX \(\frac{...}{...}\) for MathJax rendering ──
function quizFracDisplay(s){
  var supMap = {'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'};
  var supToCaret = function(text){
    // Convert unicode superscript digits right after ) into ^{n} for LaTeX (e.g. (2x-6)⁵ → (2x-6)^{5})
    return text.replace(/\)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, function(m, digits){
      var out=''; for(var i=0;i<digits.length;i++) out += supMap[digits[i]]||digits[i];
      return ')^{'+out+'}';
    });
  };
  var s2 = String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    // (expression)^superscript/denominator → \(\frac{(expression)^{n}}{denominator}\)
    // handles "(2x-6)⁵/5", "(x²-4)³/3" etc — a parenthesized expr (with optional superscript) over a number
    .replace(/(\([^()]+\)[⁰¹²³⁴⁵⁶⁷⁸⁹]*)\/(\d+)/g, function(m, numerator, denom){
      return '\\(\\frac{'+supToCaret(numerator)+'}{'+denom+'}\\)';
    })
    // (n/d) → \(\frac{n}{d}\)  — handles "(2/4)x⁴", "(1/6)x⁶" etc.
    .replace(/\((-?\d+)\/(\d+)\)/g, function(m,n,d){ return '\\(\\frac{'+n+'}{'+d+'}\\)'; })
    // variable with unicode superscript exponent, then slash, then a number
    // (e.g. "x⁶/6", "x⁵/20") → \(\frac{x^{6}}{6}\) — these previously stayed
    // as plain slash-text and rendered slanted instead of as a stacked fraction
    .replace(/([a-zA-Z])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)\/(\d+)(?![0-9}])/g, function(m, base, sup, denom){
      var out=''; for(var i=0;i<sup.length;i++) out += supMap[sup[i]]||sup[i];
      return '\\(\\frac{'+base+'^{'+out+'}}{'+denom+'}\\)';
    })
    // standalone n/d not already inside parentheses-converted form (e.g. "1/3", "x = 2/4")
    .replace(/(?<!\{)(?<![0-9])(-?\d+)\/(\d+)(?![0-9}])/g, function(m,n,d){ return '\\(\\frac{'+n+'}{'+d+'}\\)'; });
  return s2;
}

// ── cleanLatex: thorough LaTeX→Unicode converter ─────────────────
// Used for: tutor chat bubbles on-screen, Word/PDF downloads
// (downloadTutorAnswer, downloadTutorAnswerPDF, downloadStudyNotes).
// Two-pass fraction handler for nested cases.
function cleanLatex(text){
  if(!text) return text;
  var t = text;

  // ── STEP 1: Strip math environment wrappers ───────────────────────────
  // \[ ... \] display math
  t = t.replace(/\\\[[\s\S]*?\\\]/g, function(m){ return m.slice(2, m.length-2).trim(); });
  // \( ... \) inline math
  t = t.replace(/\\\([\s\S]*?\\\)/g, function(m){ return m.slice(2, m.length-2).trim(); });
  // $$ ... $$
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  // $ ... $
  t = t.replace(/\$([^\$\n]+?)\$/g, '$1');
  // \begin{...} ... \end{...}
  t = t.replace(/\\begin\{[^}]*\}([\s\S]*?)\\end\{[^}]*\}/g, '$1');

  // ── STEP 2: Fractions ─────────────────────────────────────────────────
  // \frac{a}{b} → (a)/(b)  — run 3 passes for nested fracs
  for(var p=0;p<3;p++){
    t = t.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  }
  // \dfrac \tfrac \cfrac
  for(var p=0;p<3;p++){
    t = t.replace(/\\[dct]frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  }

  // ── STEP 3: Roots ─────────────────────────────────────────────────────
  t = t.replace(/\\sqrt\[4\]\{([^}]*)\}/g, '∜($1)');
  t = t.replace(/\\sqrt\[3\]\{([^}]*)\}/g, '∛($1)');
  t = t.replace(/\\sqrt\[2\]\{([^}]*)\}/g, '√($1)');
  t = t.replace(/\\sqrt\{([^}]*)\}/g,      '√($1)');
  t = t.replace(/\\sqrt\s+([a-zA-Z0-9])/g, '√$1');

  // ── STEP 4: Limits ────────────────────────────────────────────────────
  // \lim_{x \to a} → lim(x→a)
  t = t.replace(/\\lim_\{([^}]*)\}/g, function(m, inner){
    return 'lim(' + inner.replace(/\\to/g,'→').replace(/\s+/g,' ').trim() + ')';
  });
  t = t.replace(/\\lim_([a-zA-Z0-9])/g, 'lim($1)');
  t = t.replace(/\\lim\b/g, 'lim');

  // ── STEP 5: Integrals ─────────────────────────────────────────────────
  // \int_{a}^{b} → ∫[a to b]
  t = t.replace(/\\int_\{([^}]*)\}\^?\{?([^}]*)\}?/g, function(m,lo,hi){
    if(hi) return '∫['+lo.trim()+' to '+hi.trim()+']';
    return '∫['+lo.trim()+']';
  });
  t = t.replace(/\\int\b/g, '∫');
  // \iint \iiint \oint
  t = t.replace(/\\iint\b/g,  '∬');
  t = t.replace(/\\iiint\b/g, '∭');
  t = t.replace(/\\oint\b/g,  '∮');

  // ── STEP 6: Trig functions ────────────────────────────────────────────
  // \sin \cos \tan \cot \sec \csc  → plain text (they look fine without backslash)
  t = t.replace(/\\sin\b/g,    'sin');
  t = t.replace(/\\cos\b/g,    'cos');
  t = t.replace(/\\tan\b/g,    'tan');
  t = t.replace(/\\cot\b/g,    'cot');
  t = t.replace(/\\sec\b/g,    'sec');
  t = t.replace(/\\csc\b/g,    'csc');
  // Inverse trig
  t = t.replace(/\\arcsin\b/g, 'arcsin');
  t = t.replace(/\\arccos\b/g, 'arccos');
  t = t.replace(/\\arctan\b/g, 'arctan');
  // Hyperbolic trig
  t = t.replace(/\\sinh\b/g,   'sinh');
  t = t.replace(/\\cosh\b/g,   'cosh');
  t = t.replace(/\\tanh\b/g,   'tanh');
  t = t.replace(/\\coth\b/g,   'coth');

  // ── STEP 7: Logarithms ────────────────────────────────────────────────
  t = t.replace(/\\log_\{([^}]*)\}/g, 'log₍$1₎');
  t = t.replace(/\\log\b/g,  'log');
  t = t.replace(/\\ln\b/g,   'ln');
  t = t.replace(/\\lg\b/g,   'log');
  t = t.replace(/\\exp\b/g,  'exp');

  // ── STEP 8: Sums, Products, Series ───────────────────────────────────
  // \sum_{i=0}^{n} → Σ[i=0 to n]
  t = t.replace(/\\sum_\{([^}]*)\}\^?\{?([^}]*)\}?/g, function(m,lo,hi){
    if(hi) return 'Σ['+lo.trim()+' to '+hi.trim()+']';
    return 'Σ['+lo.trim()+']';
  });
  t = t.replace(/\\sum\b/g, 'Σ');
  // \prod → Π
  t = t.replace(/\\prod_\{([^}]*)\}\^?\{?([^}]*)\}?/g, function(m,lo,hi){
    if(hi) return 'Π['+lo.trim()+' to '+hi.trim()+']';
    return 'Π['+lo.trim()+']';
  });
  t = t.replace(/\\prod\b/g, 'Π');

  // ── STEP 9: Greek letters (lowercase) ────────────────────────────────
  t = t.replace(/\\alpha\b/g,   'α');
  t = t.replace(/\\beta\b/g,    'β');
  t = t.replace(/\\gamma\b/g,   'γ');
  t = t.replace(/\\delta\b/g,   'δ');
  t = t.replace(/\\epsilon\b/g, 'ε');
  t = t.replace(/\\varepsilon\b/g,'ε');
  t = t.replace(/\\zeta\b/g,    'ζ');
  t = t.replace(/\\eta\b/g,     'η');
  t = t.replace(/\\theta\b/g,   'θ');
  t = t.replace(/\\vartheta\b/g,'θ');
  t = t.replace(/\\iota\b/g,    'ι');
  t = t.replace(/\\kappa\b/g,   'κ');
  t = t.replace(/\\lambda\b/g,  'λ');
  t = t.replace(/\\mu\b/g,      'μ');
  t = t.replace(/\\nu\b/g,      'ν');
  t = t.replace(/\\xi\b/g,      'ξ');
  t = t.replace(/\\pi\b/g,      'π');
  t = t.replace(/\\varpi\b/g,   'π');
  t = t.replace(/\\rho\b/g,     'ρ');
  t = t.replace(/\\sigma\b/g,   'σ');
  t = t.replace(/\\varsigma\b/g,'ς');
  t = t.replace(/\\tau\b/g,     'τ');
  t = t.replace(/\\upsilon\b/g, 'υ');
  t = t.replace(/\\phi\b/g,     'φ');
  t = t.replace(/\\varphi\b/g,  'φ');
  t = t.replace(/\\chi\b/g,     'χ');
  t = t.replace(/\\psi\b/g,     'ψ');
  t = t.replace(/\\omega\b/g,   'ω');

  // ── STEP 10: Greek letters (uppercase) ───────────────────────────────
  t = t.replace(/\\Gamma\b/g,   'Γ');
  t = t.replace(/\\Delta\b/g,   'Δ');
  t = t.replace(/\\Theta\b/g,   'Θ');
  t = t.replace(/\\Lambda\b/g,  'Λ');
  t = t.replace(/\\Xi\b/g,      'Ξ');
  t = t.replace(/\\Pi\b/g,      'Π');
  t = t.replace(/\\Sigma\b/g,   'Σ');
  t = t.replace(/\\Upsilon\b/g, 'Υ');
  t = t.replace(/\\Phi\b/g,     'Φ');
  t = t.replace(/\\Psi\b/g,     'Ψ');
  t = t.replace(/\\Omega\b/g,   'Ω');

  // ── STEP 11: Arrows & relations ───────────────────────────────────────
  t = t.replace(/\\rightarrow\b/g,     '→');
  t = t.replace(/\\leftarrow\b/g,      '←');
  t = t.replace(/\\leftrightarrow\b/g, '↔');
  t = t.replace(/\\Rightarrow\b/g,     '⇒');
  t = t.replace(/\\Leftarrow\b/g,      '⇐');
  t = t.replace(/\\Leftrightarrow\b/g, '⇔');
  t = t.replace(/\\to\b/g,             '→');
  t = t.replace(/\\mapsto\b/g,         '↦');
  t = t.replace(/\\uparrow\b/g,        '↑');
  t = t.replace(/\\downarrow\b/g,      '↓');

  // ── STEP 12: Comparison & logic operators ────────────────────────────
  t = t.replace(/\\neq\b/g,    '≠');
  t = t.replace(/\\ne\b/g,     '≠');
  t = t.replace(/\\leq\b/g,    '≤');
  t = t.replace(/\\le\b/g,     '≤');
  t = t.replace(/\\geq\b/g,    '≥');
  t = t.replace(/\\ge\b/g,     '≥');
  t = t.replace(/\\ll\b/g,     '≪');
  t = t.replace(/\\gg\b/g,     '≫');
  t = t.replace(/\\approx\b/g, '≈');
  t = t.replace(/\\equiv\b/g,  '≡');
  t = t.replace(/\\sim\b/g,    '~');
  t = t.replace(/\\simeq\b/g,  '≃');
  t = t.replace(/\\propto\b/g, '∝');
  t = t.replace(/\\subset\b/g, '⊂');
  t = t.replace(/\\supset\b/g, '⊃');
  t = t.replace(/\\subseteq\b/g,'⊆');
  t = t.replace(/\\supseteq\b/g,'⊇');
  t = t.replace(/\\in\b/g,     '∈');
  t = t.replace(/\\notin\b/g,  '∉');
  t = t.replace(/\\cup\b/g,    '∪');
  t = t.replace(/\\cap\b/g,    '∩');
  t = t.replace(/\\emptyset\b/g,'∅');
  t = t.replace(/\\forall\b/g, '∀');
  t = t.replace(/\\exists\b/g, '∃');
  t = t.replace(/\\neg\b/g,    '¬');
  t = t.replace(/\\land\b/g,   '∧');
  t = t.replace(/\\lor\b/g,    '∨');

  // ── STEP 13: Arithmetic & misc symbols ───────────────────────────────
  t = t.replace(/\\times\b/g,  '×');
  t = t.replace(/\\cdot\b/g,   '·');
  t = t.replace(/\\div\b/g,    '÷');
  t = t.replace(/\\pm\b/g,     '±');
  t = t.replace(/\\mp\b/g,     '∓');
  t = t.replace(/\\infty\b/g,  '∞');
  t = t.replace(/\\partial\b/g,'∂');
  t = t.replace(/\\nabla\b/g,  '∇');
  t = t.replace(/\\degree\b/g, '°');
  t = t.replace(/\\circ\b/g,   '°');
  t = t.replace(/\\perp\b/g,   '⊥');
  t = t.replace(/\\parallel\b/g,'∥');
  t = t.replace(/\\angle\b/g,  '∠');
  t = t.replace(/\\triangle\b/g,'△');
  t = t.replace(/\\square\b/g, '□');
  t = t.replace(/\\therefore\b/g,'∴');
  t = t.replace(/\\because\b/g,'∵');
  t = t.replace(/\\ldots\b/g,  '...');
  t = t.replace(/\\cdots\b/g,  '···');
  t = t.replace(/\\vdots\b/g,  '⋮');
  t = t.replace(/\\ddots\b/g,  '⋱');

  // ── STEP 14: Derivatives ─────────────────────────────────────────────
  // \frac{d}{dx} already handled by frac — but catch \frac{dy}{dx} pattern
  // \prime → ′  (for f'(x) notation)
  t = t.replace(/\\prime\b/g, '′');

  // ── STEP 15: Text/formatting commands ────────────────────────────────
  t = t.replace(/\\text\{([^}]*)\}/g,   '$1');
  t = t.replace(/\\mathrm\{([^}]*)\}/g, '$1');
  t = t.replace(/\\mathbf\{([^}]*)\}/g, '$1');
  t = t.replace(/\\mathit\{([^}]*)\}/g, '$1');
  t = t.replace(/\\mathbb\{([^}]*)\}/g, '$1');
  t = t.replace(/\\boldsymbol\{([^}]*)\}/g, '$1');
  t = t.replace(/\\overline\{([^}]*)\}/g,   '$1̄');
  t = t.replace(/\\underline\{([^}]*)\}/g,  '$1');
  t = t.replace(/\\hat\{([^}]*)\}/g,        '$1̂');
  t = t.replace(/\\vec\{([^}]*)\}/g,        '$1⃗');
  t = t.replace(/\\bar\{([^}]*)\}/g,        '$1̄');
  t = t.replace(/\\tilde\{([^}]*)\}/g,      '$1̃');
  t = t.replace(/\\dot\{([^}]*)\}/g,        '$1̇');
  t = t.replace(/\\ddot\{([^}]*)\}/g,       '$1̈');

  // ── STEP 16: Spacing commands → single space ─────────────────────────
  t = t.replace(/\\[,;!]\s*/g, ' ');
  t = t.replace(/\\quad\b/g,  ' ');
  t = t.replace(/\\qquad\b/g, '  ');
  t = t.replace(/\\hspace\{[^}]*\}/g, ' ');
  t = t.replace(/\\vspace\{[^}]*\}/g, '');

  // ── STEP 17: Superscripts & subscripts ───────────────────────────────
  var supMap = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵',
                '6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻',
                'n':'ⁿ','i':'ⁱ','a':'ᵃ','b':'ᵇ','x':'ˣ'};
  var subMap = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅',
                '6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋',
                'n':'ₙ','i':'ᵢ','a':'ₐ','x':'ₓ'};
  // ^{abc} → superscript chars
  t = t.replace(/\^\{([^}]*)\}/g, function(m, inner){
    var r=''; for(var i=0;i<inner.length;i++) r += supMap[inner[i]]||inner[i]; return r;
  });
  // ^x (single char, no braces)
  t = t.replace(/\^([0-9a-zA-Z])/g, function(m,c){ return supMap[c]||m; });
  // _{abc} → subscript chars
  t = t.replace(/_\{([^}]*)\}/g, function(m, inner){
    var r=''; for(var i=0;i<inner.length;i++) r += subMap[inner[i]]||inner[i]; return r;
  });
  // _x (single char, no braces) — only digits and common letters
  t = t.replace(/_([0-9])/g, function(m,c){ return subMap[c]||m; });

  // ── STEP 17b: Second fraction pass ────────────────────────────────────
  // Catches \frac{x^{n+1}}{n+1}-style cases that Step 2 missed because the
  // numerator/denominator originally contained nested braces (e.g. from a
  // superscript like x^{n+1}). By this point those braces are already gone
  // (converted to xⁿ⁺¹ above), so the simple \frac{a}{b} pattern now matches.
  for(var p2=0;p2<3;p2++){
    t = t.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  }

  // ── STEP 18: Remove any remaining backslash commands ─────────────────
  t = t.replace(/\\[a-zA-Z]+\*?\b/g, '');

  // ── STEP 19: Clean up stray braces and spaces ────────────────────────
  t = t.replace(/\{([^{}]*)\}/g, '$1'); // {x} → x
  t = t.replace(/\{([^{}]*)\}/g, '$1'); // double pass for nested
  t = t.replace(/  +/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');

  return t;
}
