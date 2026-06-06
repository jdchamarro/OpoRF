const APP_VERSION = '1.2.0-no-localstorage-big-bank';
const STORAGE_KEY = 'oporfaragon_state_v1';
const SESSION_KEY = 'oporfaragon_session_v1';
const USER_SALT = 'oporfaragon-user-v2';
const USER_HASH = 'cc44dde29c432db12f2786e8dd29b49ed6f2c55f022a23a845ae8521f30e08ac';
const PASSWORD_SALT = 'oporfaragon-password-v2';
const PASSWORD_HASH = '1e55622272af1c55522215bef02cf9455ae4a8ea03a1f4555b4bc1e2212e7c23';

const sampleQuestions = [
  {
    id: 'rf-ar-001', examId: 'radiofisica-hospitalaria', regionId: 'aragon',
    topic: 'Dosimetría', subtopic: 'TRS-398', source: 'TRS-398, capítulo 3', image: '',
    statement: 'En dosimetría de haces externos, ¿qué magnitud se calibra habitualmente en condiciones de referencia para fotones de alta energía?',
    options: ['Actividad', 'Dosis absorbida en agua', 'Kerma en aire exclusivamente', 'Dosis equivalente ambiental'],
    answer: 1,
    explanation: 'Los protocolos modernos como TRS-398 se basan en la determinación de dosis absorbida en agua en condiciones de referencia.'
  },
  {
    id: 'rf-ar-002', examId: 'radiofisica-hospitalaria', regionId: 'aragon',
    topic: 'Protección radiológica', subtopic: 'Magnitudes', source: 'ICRP / normativa básica', image: '',
    statement: '¿Qué unidad del SI se utiliza para la dosis equivalente y la dosis efectiva?',
    options: ['Gray', 'Becquerel', 'Sievert', 'Coulomb/kg'],
    answer: 2,
    explanation: 'El sievert se utiliza para magnitudes ponderadas como dosis equivalente y dosis efectiva.'
  }
];

const defaultState = {
  user: '',
  meta: { bankVersion: null },
  config: {
    examId: 'radiofisica-hospitalaria',
    regionId: 'aragon',
    simulationCount: 50,
    secondsPerQuestion: 60,
    wrongPenalty: 0.33
  },
  questions: sampleQuestions,
  attempts: []
};

let state = loadState();
let tab = 'train';
let trainViewMode = 'home';
let current = null;
let selected = null;
let answered = false;
let timerId = null;
let remaining = 0;
let simulation = null;
let activeMode = 'random';
let activeTopic = null;
let questionQueues = {};

syncBundledBank();

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw){
    const initial = structuredClone(defaultState);
    initial.questions = []; // no guardamos el banco grande en localStorage
    safeSaveState(initial);
    return initial;
  }
  try {
    const parsed = JSON.parse(raw);
    // Si una versión anterior guardó demasiadas preguntas, evitamos volver a cargar ese bloque gigante.
    const userQuestions = Array.isArray(parsed.questions)
      ? parsed.questions.filter(q => !String(q.id || '').startsWith('RFAR-') && !String(q.id || '').startsWith('rf-ar-'))
      : [];
    return {
      ...structuredClone(defaultState),
      ...parsed,
      meta: { ...defaultState.meta, ...(parsed.meta||{}) },
      config: { ...defaultState.config, ...(parsed.config||{}) },
      questions: userQuestions,
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : []
    };
  } catch {
    const initial = structuredClone(defaultState);
    initial.questions = [];
    return initial;
  }
}
function safeSaveState(obj=state){
  try {
    const copy = { ...obj, questions: (obj.questions || []).filter(q => !String(q.id || '').startsWith('RFAR-') && !String(q.id || '').startsWith('rf-ar-')) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
    return true;
  } catch(err) {
    console.warn('No se pudo guardar localStorage:', err);
    return false;
  }
}
function saveState(){ safeSaveState(state); }

function syncBundledBank(force=false){
  const bundled = Array.isArray(window.OPORF_QUESTIONS) ? window.OPORF_QUESTIONS : [];
  const bankVersion = window.OPORF_BANK_VERSION || 'bundled-bank';
  state.meta = { ...(state.meta||{}), bankVersion, bundledCount: bundled.length, lastBankSync: new Date().toISOString() };
  saveState();
}
function normalizeQuestion(q){
  return {
    id: q.id || uid(),
    examId: q.examId || 'radiofisica-hospitalaria',
    regionId: q.regionId || 'aragon',
    topic: q.topic || 'Sin tema',
    subtopic: q.subtopic || '',
    statement: q.statement || '',
    options: Array.isArray(q.options) ? q.options.slice(0,4) : [q.optionA,q.optionB,q.optionC,q.optionD].filter(Boolean),
    answer: Number(q.answer || 0),
    explanation: q.explanation || '',
    source: q.source || '',
    image: q.image || ''
  };
}

function isLogged(){ return sessionStorage.getItem(SESSION_KEY) === '1'; }
async function sha256(text){
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function uid(){ return 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,7); }
function shuffle(arr){
  const out = [...arr];
  for(let i=out.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
function app(){ return document.getElementById('app'); }

function render(){
  if(!isLogged()) return renderLogin();
  app().innerHTML = `
    <div class="topbar"><div class="wrap">
      <div><div class="brand">OpoRF Aragón</div><div class="muted small">Radiofísica Hospitalaria · Aragón · GitHub Pages</div></div>
      <button class="secondary" onclick="logout()">Salir</button>
    </div></div>
    <main class="wrap">
      <div class="tabs">
        ${tabButton('train','Entrenar')}${tabButton('simulation','Simulacro')}${tabButton('questions','Preguntas')}${tabButton('import','Importar')}${tabButton('stats','Ranking')}${tabButton('config','Configuración')}
      </div>
      <section id="content"></section>
    </main>`;
  renderTab();
}
function tabButton(id,label){return `<button class="${tab===id?'active':''}" onclick="switchTab('${id}')">${label}</button>`}
function switchTab(id){ clearInterval(timerId); timerId=null; tab=id; current=null; selected=null; answered=false; simulation=null; render(); }

function renderLogin(){
  app().innerHTML = `
  <section class="login">
    <div class="card">
      <h1>OpoRF Aragón</h1>
      <p class="muted">Preparación de oposición de Radiofísica Hospitalaria en Aragón.</p>
      <div class="notice small">Versión estática para GitHub Pages. Guarda los datos en este navegador/iPhone.</div>
      <form id="loginForm">
        <div class="field"><label>Usuario</label><input id="username" autocomplete="username" /></div>
        <div class="field"><label>Contraseña</label><input id="password" type="password" autocomplete="current-password" /></div>
        <button style="width:100%">Entrar</button>
      </form>
    </div>
  </section>`;
  document.getElementById('loginForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;
    const uh = await sha256(USER_SALT + u);
    const ph = await sha256(PASSWORD_SALT + p);
    if(uh === USER_HASH && ph === PASSWORD_HASH){ sessionStorage.setItem(SESSION_KEY,'1'); render(); }
    else alert('Usuario o contraseña incorrectos');
  });
}
function logout(){ clearInterval(timerId); sessionStorage.removeItem(SESSION_KEY); render(); }
function renderTab(){
  const c = document.getElementById('content');
  if(tab==='train') c.innerHTML = trainView();
  if(tab==='simulation') c.innerHTML = simulationView();
  if(tab==='questions') c.innerHTML = questionsView();
  if(tab==='import') c.innerHTML = importView();
  if(tab==='stats') c.innerHTML = statsView();
  if(tab==='config') c.innerHTML = configView();
  attachHandlers();
}
function attachHandlers(){
  if(tab==='config') document.getElementById('configForm')?.addEventListener('submit', saveConfig);
  if(tab==='questions') document.getElementById('questionForm')?.addEventListener('submit', saveQuestionForm);
  if(tab==='import') document.getElementById('importForm')?.addEventListener('submit', importCsv);
}
function availableQuestions(){
  const bundled = Array.isArray(window.OPORF_QUESTIONS) ? window.OPORF_QUESTIONS : [];
  const map = new Map();
  for(const q of bundled) { const nq = normalizeQuestion(q); map.set(nq.id, nq); }
  for(const q of (state.questions || [])) { const nq = normalizeQuestion(q); map.set(nq.id, nq); }
  return [...map.values()]
    .filter(q=>q.examId==='radiofisica-hospitalaria' && q.regionId==='aragon' && q.statement && q.options?.length >= 4);
}
function topics(){
  const counts = {};
  for(const q of availableQuestions()) counts[q.topic || 'Sin tema'] = (counts[q.topic || 'Sin tema'] || 0) + 1;
  return Object.entries(counts).sort((a,b)=>{
    const aid = topicNumber(a[0]), bid = topicNumber(b[0]);
    if(aid !== bid) return aid - bid;
    return a[0].localeCompare(b[0], 'es');
  });
}
function topicNumber(t){
  const m = String(t).match(/(?:Tema\s*)?(\d+)/i) || String(t).match(/MC(\d+)|ME(\d+)/i);
  if(!m) return 9999;
  return Number(m[1] || m[2]);
}
function recentIds(){ return new Set(state.attempts.slice(-30).map(a=>a.questionId)); }
function queueKey(mode, topic=''){ return `${mode}::${topic || ''}`; }
function getQuestionPool(mode='random', topic=null){
  let qs = availableQuestions();
  if(mode === 'topic' && topic) qs = qs.filter(q => (q.topic || 'Sin tema') === topic);
  if(mode === 'failed'){
    const failedIds = new Set(state.attempts.filter(a=>!a.correct).map(a=>a.questionId));
    const failed = qs.filter(q=>failedIds.has(q.id));
    qs = failed.length ? failed : qs;
  }
  return qs;
}
function drawQuestion(mode='random', topic=null){
  const pool = getQuestionPool(mode, topic);
  if(!pool.length) return null;
  const key = queueKey(mode, topic);
  let queue = questionQueues[key] || [];
  const poolIds = new Set(pool.map(q=>q.id));
  queue = queue.filter(id => poolIds.has(id));
  if(!queue.length){
    const rids = recentIds();
    const preferred = pool.filter(q => q.id !== current?.id && !rids.has(q.id));
    queue = shuffle(preferred.length ? preferred : pool).map(q=>q.id);
  }
  let id = queue.shift();
  if(id === current?.id && queue.length) { queue.push(id); id = queue.shift(); }
  questionQueues[key] = queue;
  return pool.find(q=>q.id===id) || shuffle(pool)[0];
}

function trainView(){
  if(current && !simulation) return questionView();
  if(trainViewMode === 'topics') return topicsView();
  return `<div class="grid two">
    <div class="card"><h2>Entrenar</h2><p class="muted">Elige cómo quieres practicar. Las preguntas se seleccionan de forma aleatoria y evita repetir las más recientes.</p>
      <div class="grid two">
        <button onclick="startTraining('random')">Aleatorias</button>
        <button class="secondary" onclick="trainViewMode='topics'; renderTab()">Por temas</button>
        <button class="secondary" onclick="startTraining('failed')">Falladas</button>
      </div>
    </div>
    ${summaryCard()}
  </div>`;
}
function topicsView(){
  const rows = topics();
  return `<div class="card">
    <div class="row" style="justify-content:space-between"><h2>Entrenar por temas</h2><button class="secondary" onclick="trainViewMode='home'; renderTab()">Volver</button></div>
    <p class="muted">Selecciona un tema. Dentro de cada tema las preguntas saldrán aleatorias, sin ir siempre en el mismo orden.</p>
    <div class="topic-list">
      ${rows.map(([topic,count],i)=>`<button class="topic-button" onclick="startTraining('topic', '${encodeURIComponent(topic)}')"><span><b>${i+1}. ${esc(topic)}</b><br><span class="muted small">${count} preguntas</span></span><span>Entrenar</span></button>`).join('')}
    </div>
  </div>`;
}
function startTraining(mode='random', encodedTopic=null){
  simulation = null;
  activeMode = mode;
  activeTopic = encodedTopic ? decodeURIComponent(encodedTopic) : null;
  current = drawQuestion(mode, activeTopic);
  if(!current){ alert('No hay preguntas disponibles para esta selección.'); return; }
  startTimer();
  selected = null; answered = false;
  renderTab();
}
function simulationView(){
  if(simulation && current) return questionView();
  if(simulation && !current) return simulationSummaryView();
  return `<div class="grid two">
    <div class="card"><h2>Simulacro</h2><p class="muted">Crea una tanda cerrada de preguntas aleatorias de todo el temario. El número de preguntas se cambia en Configuración.</p>
      <div class="grid three"><div class="stat"><span class="muted">Preguntas configuradas</span><br><b>${Number(state.config.simulationCount)||50}</b></div><div class="stat"><span class="muted">Tiempo/pregunta</span><br><b>${Number(state.config.secondsPerQuestion)||60}s</b></div><div class="stat"><span class="muted">Penalización</span><br><b>-${Number(state.config.wrongPenalty)||0}</b></div></div>
      <div class="row" style="margin-top:14px"><button onclick="startSimulation()">Empezar simulacro</button></div>
    </div>
    ${summaryCard()}
  </div>`;
}
function startSimulation(){
  const qs = availableQuestions();
  if(!qs.length){ alert('No hay preguntas.'); return; }
  const count = Math.min(Number(state.config.simulationCount)||50, qs.length);
  simulation = { list: shuffle(qs).slice(0,count), index:0, results:[], startedAt: new Date().toISOString() };
  activeMode = 'simulation'; activeTopic = null;
  current = simulation.list[0]; selected=null; answered=false;
  startTimer();
  renderTab();
}
function startTimer(){
  clearInterval(timerId);
  remaining = Number(state.config.secondsPerQuestion)||60;
  timerId = setInterval(()=>{
    remaining--;
    const el = document.getElementById('timer'); if(el) el.textContent = remaining + ' s';
    if(remaining <= 0) submitAnswer(true);
  },1000);
}
function questionView(){
  const contextLabel = simulation ? `Simulacro ${simulation.index+1}/${simulation.list.length}` : (activeMode === 'topic' ? 'Entrenar por tema' : activeMode === 'failed' ? 'Entrenar falladas' : 'Entrenar aleatorias');
  return `<div class="card">
    <div class="row" style="justify-content:space-between"><div><span class="pill">${esc(contextLabel)}</span> <span class="pill">${esc(current.topic||'Sin tema')}</span> ${current.subtopic?`<span class="pill">${esc(current.subtopic)}</span>`:''}</div><div class="timer" id="timer">${remaining} s</div></div>
    <h2 style="margin-top:12px">${esc(current.statement)}</h2>
    ${current.source?`<div class="source small"><b>Fuente:</b> ${esc(current.source)}</div>`:''}
    ${current.image?`<img class="question-img" src="${esc(current.image)}" alt="Imagen de la pregunta">`:''}
    <div>${current.options.map((op,i)=>`<button class="option ${optionClass(i)}" onclick="selectOption(${i})" ${answered?'disabled':''}><b>${'ABCD'[i]}.</b> ${esc(op)}</button>`).join('')}</div>
    ${answered?answerBox():`<button onclick="submitAnswer(false)" ${selected===null?'disabled':''}>Responder</button>`}
  </div>`;
}
function optionClass(i){ if(selected===i&&!answered)return 'selected'; if(!answered)return ''; if(i===Number(current.answer))return 'correct'; if(i===selected)return 'wrong'; return ''; }
function selectOption(i){ selected=i; renderTab(); }
function submitAnswer(timeout=false){
  if(answered) return; clearInterval(timerId); timerId=null; answered=true;
  const correct = !timeout && selected === Number(current.answer);
  const elapsed = (Number(state.config.secondsPerQuestion)||60) - Math.max(remaining,0);
  const score = correct ? 1 : -Math.abs(Number(state.config.wrongPenalty)||0);
  const attempt = { questionId: current.id, topic: current.topic||'Sin tema', correct, timeout, selected, answer: Number(current.answer), score, elapsed, mode: activeMode, at: new Date().toISOString() };
  state.attempts.push(attempt); saveState();
  if(simulation) simulation.results.push(attempt);
  renderTab();
}
function answerBox(){
  const last = state.attempts[state.attempts.length-1];
  const isLastSim = simulation && simulation.index >= simulation.list.length-1;
  const nextLabel = simulation ? (isLastSim ? 'Ver resumen' : 'Siguiente pregunta') : 'Siguiente pregunta';
  return `<div class="card" style="background:#f8fafc;margin-top:12px">
    <h3 class="${last.correct?'ok':'bad'}">${last.correct?'Correcto':'Incorrecto'}</h3>
    <p><b>Respuesta correcta:</b> ${'ABCD'[Number(current.answer)]}. ${esc(current.options[Number(current.answer)] || '')}</p>
    ${current.explanation?`<p>${esc(current.explanation)}</p>`:''}
    <div class="row">
      <button onclick="nextQuestion()">${nextLabel}</button>
      <button class="secondary" onclick="finishCurrentBlock()">Terminar</button>
    </div>
  </div>`;
}
function nextQuestion(){
  if(simulation){
    if(simulation.index >= simulation.list.length-1){ current=null; renderTab(); return; }
    simulation.index++;
    current = simulation.list[simulation.index]; selected=null; answered=false; startTimer(); renderTab(); return;
  }
  current = drawQuestion(activeMode, activeTopic); selected=null; answered=false; startTimer(); renderTab();
}
function finishCurrentBlock(){ clearInterval(timerId); timerId=null; current=null; simulation=null; selected=null; answered=false; renderTab(); }
function simulationSummaryView(){
  const r=simulation?.results||[]; const ok=r.filter(x=>x.correct).length; const score=r.reduce((s,x)=>s+x.score,0); const avg=r.length?Math.round(r.reduce((s,x)=>s+x.elapsed,0)/r.length):0;
  return `<div class="card"><h2>Resumen del simulacro</h2><div class="grid three"><div class="stat"><span class="muted">Preguntas</span><br><b>${r.length}</b></div><div class="stat"><span class="muted">Aciertos</span><br><b>${ok}/${r.length}</b></div><div class="stat"><span class="muted">Puntuación</span><br><b>${score.toFixed(2)}</b></div></div><p>Tiempo medio: <b>${avg} s</b></p><button onclick="simulation=null; current=null; renderTab()">Volver al simulacro</button></div>`;
}
function summaryCard(){
  const qs=availableQuestions(); const at=state.attempts; const ok=at.filter(a=>a.correct).length; const pct=at.length?Math.round(100*ok/at.length):0;
  return `<div class="card"><h2>Resumen</h2><div class="grid three"><div class="stat"><span class="muted">Preguntas</span><br><b>${qs.length}</b></div><div class="stat"><span class="muted">Temas</span><br><b>${topics().length}</b></div><div class="stat"><span class="muted">Acierto</span><br><b>${pct}%</b></div></div><p class="small muted">Banco cargado: ${esc(state.meta?.bankVersion || 'local')}</p></div>`;
}

function questionsView(){
  return `<div class="grid two"><div class="card"><h2>Crear / editar pregunta</h2><form id="questionForm"><input type="hidden" id="qid"><div class="grid two"><div class="field"><label>Tema</label><input id="qtopic" required></div><div class="field"><label>Subtema</label><input id="qsubtopic"></div></div><div class="field"><label>Fuente</label><input id="qsource" placeholder="TRS 398, página 3"></div><div class="field"><label>Pregunta</label><textarea id="qstatement" required></textarea></div><div class="grid two">${[0,1,2,3].map(i=>`<div class="field"><label>Opción ${'ABCD'[i]}</label><input id="qop${i}" required></div>`).join('')}</div><div class="field"><label>Respuesta correcta</label><select id="qanswer"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></div><div class="field"><label>Explicación</label><textarea id="qexplanation"></textarea></div><div class="field"><label>Imagen opcional: URL o Base64</label><input id="qimage" placeholder="https://... o data:image/png;base64,..."></div><div class="row"><button>Guardar</button><button type="button" class="secondary" onclick="clearQuestionForm()">Limpiar</button></div></form></div><div class="card"><h2>Banco de preguntas</h2><div class="small muted">${availableQuestions().length} preguntas</div><table class="table small"><thead><tr><th>Tema</th><th>Pregunta</th><th></th></tr></thead><tbody>${availableQuestions().slice(0,250).map(q=>`<tr><td>${esc(q.topic||'')}</td><td><b>${esc(q.statement).slice(0,90)}</b><br>${q.source?`<span class="muted">${esc(q.source)}</span>`:''}</td><td><button class="secondary" onclick="editQuestion('${q.id}')">Editar</button><button class="danger" onclick="deleteQuestion('${q.id}')">Borrar</button></td></tr>`).join('')}</tbody></table><p class="small muted">Se muestran las primeras 250 para que el móvil no se bloquee. El entrenamiento usa todo el banco.</p></div></div>`;
}
function saveQuestionForm(e){
  e.preventDefault();
  const id=document.getElementById('qid').value||uid();
  const q={id, examId:'radiofisica-hospitalaria', regionId:'aragon', topic:v('qtopic'), subtopic:v('qsubtopic'), source:v('qsource'), statement:v('qstatement'), options:[v('qop0'),v('qop1'),v('qop2'),v('qop3')], answer:Number(v('qanswer')), explanation:v('qexplanation'), image:v('qimage')};
  const idx=state.questions.findIndex(x=>x.id===id); if(idx>=0) state.questions[idx]=q; else state.questions.push(q); saveState(); clearQuestionForm(); questionQueues={}; renderTab();
}
function v(id){return document.getElementById(id).value.trim();}
function editQuestion(id){const q=availableQuestions().find(x=>x.id===id); if(!q)return; document.getElementById('qid').value=q.id; document.getElementById('qtopic').value=q.topic||''; document.getElementById('qsubtopic').value=q.subtopic||''; document.getElementById('qsource').value=q.source||''; document.getElementById('qstatement').value=q.statement||''; (q.options||[]).forEach((op,i)=>document.getElementById('qop'+i).value=op); document.getElementById('qanswer').value=q.answer||0; document.getElementById('qexplanation').value=q.explanation||''; document.getElementById('qimage').value=q.image||''; window.scrollTo({top:0,behavior:'smooth'});}
function clearQuestionForm(){document.getElementById('questionForm')?.reset(); document.getElementById('qid')&&(document.getElementById('qid').value='');}
function deleteQuestion(id){ if(String(id).startsWith('RFAR-')){ alert('Las preguntas del banco incluido no se borran desde el móvil. Puedes ocultarlas editando el archivo preguntas_oporf_aragon.js en GitHub.'); return; } if(confirm('¿Borrar pregunta?')){state.questions=state.questions.filter(q=>q.id!==id); saveState(); questionQueues={}; renderTab();}}
function importView(){return `<div class="card"><h2>Importar CSV</h2><p class="muted">Columnas admitidas: topic/tema, subtopic/subtema, statement/pregunta, optionA/A, optionB/B, optionC/C, optionD/D, answer/respuesta, explanation/explicacion, source/fuente, image/imagen.</p><form id="importForm"><div class="field"><label>Archivo CSV</label><input id="csvFile" type="file" accept=".csv,text/csv" required></div><button>Importar</button></form><pre class="small" style="white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:12px">Ejemplo:
tema,pregunta,A,B,C,D,respuesta,explicacion,fuente,imagen
Dosimetría,"¿Unidad de dosis absorbida?",Gy,Sv,Bq,C/kg,0,"El gray es J/kg","TRS 398, página 3",</pre></div>`}
function parseCsv(text){
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){const ch=text[i], next=text[i+1]; if(ch==='"'&&q&&next==='"'){cell+='"'; i++;} else if(ch==='"'){q=!q;} else if(ch===','&&!q){row.push(cell); cell='';} else if((ch==='\n'||ch==='\r')&&!q){ if(ch==='\r'&&next==='\n')i++; row.push(cell); if(row.some(x=>x.trim()))rows.push(row); row=[]; cell='';} else cell+=ch;}
  row.push(cell); if(row.some(x=>x.trim()))rows.push(row); return rows;
}
async function importCsv(e){
  e.preventDefault(); const file=document.getElementById('csvFile').files[0]; const text=await file.text(); const rows=parseCsv(text); if(rows.length<2){alert('CSV vacío'); return;}
  const headers=rows[0].map(h=>h.trim().toLowerCase()); const get=(obj,names)=>{for(const n of names){const i=headers.indexOf(n); if(i>=0)return obj[i]?.trim()||'';} return '';};
  let count=0;
  for(const r of rows.slice(1)){
    const q={id:get(r,['id'])||uid(), examId:'radiofisica-hospitalaria', regionId:'aragon', topic:get(r,['topic','tema']), subtopic:get(r,['subtopic','subtema']), statement:get(r,['statement','pregunta']), options:[get(r,['optiona','a']),get(r,['optionb','b']),get(r,['optionc','c']),get(r,['optiond','d'])], answer:Number(get(r,['answer','respuesta'])||0), explanation:get(r,['explanation','explicacion','explicación']), source:get(r,['source','fuente']), image:get(r,['image','imagen'])};
    if(q.statement && q.options.every(Boolean)){ const idx=state.questions.findIndex(x=>x.id===q.id); if(idx>=0) state.questions[idx]=q; else state.questions.push(q); count++; }
  }
  saveState(); questionQueues={}; alert(`Importadas ${count} preguntas`); tab='questions'; render();
}
function statsView(){
  const by={}; for(const a of state.attempts){by[a.topic]??={n:0,ok:0,score:0,time:0}; by[a.topic].n++; by[a.topic].ok+=a.correct?1:0; by[a.topic].score+=a.score; by[a.topic].time+=a.elapsed;}
  const rows=Object.entries(by).sort((a,b)=>b[1].score-a[1].score);
  return `<div class="card"><h2>Ranking por temas</h2><table class="table"><thead><tr><th>Tema</th><th>Intentos</th><th>Acierto</th><th>Puntuación</th><th>Tiempo medio</th></tr></thead><tbody>${rows.map(([t,s])=>`<tr><td>${esc(t)}</td><td>${s.n}</td><td>${Math.round(100*s.ok/s.n)}%</td><td>${s.score.toFixed(2)}</td><td>${Math.round(s.time/s.n)} s</td></tr>`).join('')||'<tr><td colspan="5">Sin intentos todavía.</td></tr>'}</tbody></table><div class="row" style="margin-top:12px"><button class="danger" onclick="if(confirm('¿Borrar historial?')){state.attempts=[];saveState();renderTab()}">Borrar historial</button></div></div>`
}
function configView(){return `<div class="card"><h2>Configuración</h2><form id="configForm"><div class="grid two"><div class="field"><label>Oposición</label><select disabled><option>Radiofísica Hospitalaria</option></select></div><div class="field"><label>Comunidad autónoma</label><select disabled><option>Aragón</option></select></div><div class="field"><label>Número de preguntas del simulacro</label><input id="simulationCount" type="number" min="1" value="${state.config.simulationCount}"></div><div class="field"><label>Segundos por pregunta</label><input id="secondsPerQuestion" type="number" min="5" value="${state.config.secondsPerQuestion}"></div><div class="field"><label>Penalización por fallo</label><input id="wrongPenalty" type="number" min="0" step="0.01" value="${state.config.wrongPenalty}"></div></div><button>Guardar configuración</button></form><div class="notice small">Esta versión no tiene backend. GitHub Pages no ejecuta Node.js: los datos se guardan en el navegador con localStorage.</div><div class="row"><button class="secondary" onclick="exportData()">Exportar copia JSON</button><button class="secondary" onclick="reloadBundledBank()">Recargar banco incluido</button><button class="danger" onclick="resetApp()">Reiniciar app</button></div></div>`}
function saveConfig(e){e.preventDefault(); state.config.simulationCount=Number(v('simulationCount'))||50; state.config.secondsPerQuestion=Number(v('secondsPerQuestion'))||60; state.config.wrongPenalty=Number(v('wrongPenalty'))||0; saveState(); alert('Configuración guardada');}
function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='oporfaragon-copia.json'; a.click(); URL.revokeObjectURL(a.href);}
function reloadBundledBank(){ syncBundledBank(true); questionQueues={}; alert(`Banco recargado. Preguntas disponibles: ${availableQuestions().length}`); renderTab(); }
function resetApp(){if(confirm('¿Reiniciar preguntas, configuración e historial?')){state=structuredClone(defaultState); syncBundledBank(true); questionQueues={}; saveState(); render();}}
function boot(){
  try { render(); }
  catch(err) {
    console.error(err);
    document.body.innerHTML = `<main class="wrap"><div class="card"><h1>Error al cargar la app</h1><p>Se ha producido un error al iniciar. Prueba primero a limpiar los datos locales antiguos.</p><pre class="small" style="white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:12px">${esc(err.message || String(err))}</pre><button onclick="localStorage.removeItem('${STORAGE_KEY}'); sessionStorage.removeItem('${SESSION_KEY}'); location.reload()">Limpiar datos y recargar</button></div></main>`;
  }
}
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{})); }
boot();
