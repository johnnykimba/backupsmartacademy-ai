// ════════════════════════════════════════════════════════════════
// core/session-state.js
// Shared session state used across Study/Quiz/Tutor features.
// Extracted from index.html (split, June 2026). Logic unchanged —
// this is the exact same object/variables, just relocated so every
// feature file can depend on a single shared source of truth.
//
// LOAD ORDER: this file must load BEFORE quiz.js and tutor.js,
// since both read/write S, selectedOpt, selectedConf, hintUsed.
// ════════════════════════════════════════════════════════════════

var S = {
  code:'', codeType:'', codeExpiry:null,
  name:'', level:'', subject:'', lang:'', qCount:5,
  diffMode:'doc',
  images:[], questions:[], answers:[],
  streak:0, maxStreak:0, hints:[],
  currentQ:0, retryMode:false,
  studyText:'', studyMode:'',
  date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})
};

// Quiz-specific selection state (which option is currently selected,
// confidence level chosen, whether a hint was used on this question)
let selectedOpt = null, selectedConf = null, hintUsed = false;

// Access-code-type selector state (used during code purchase/redemption flow)
let selectedCodeType = 'W';
