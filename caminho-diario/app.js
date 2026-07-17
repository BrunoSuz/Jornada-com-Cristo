const APP_KEY = 'caminhoDiarioDataV1';
const todayKey = () => new Date().toISOString().slice(0,10);
const weekKey = () => {
  const d = new Date();
  const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(),0,1));
  const week = Math.ceil((((copy-yearStart)/86400000)+1)/7);
  return `${copy.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
};
const defaultState = { settings:{name:'',morningTime:'06:00',practiceTime:'12:00',reviewTime:'21:30',darkMode:false}, days:{}, prayers:[], weeks:{} };
let state = loadState();
let deferredPrompt = null;

function loadState(){
  try { return {...defaultState, ...JSON.parse(localStorage.getItem(APP_KEY) || '{}')}; }
  catch { return structuredClone(defaultState); }
}
function saveState(){ localStorage.setItem(APP_KEY, JSON.stringify(state)); }
function el(id){ return document.getElementById(id); }
function showToast(text){ const t=el('toast'); t.textContent=text; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function formatDate(date=new Date()){ return date.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}); }
function currentDay(){ return state.days[todayKey()] || {}; }

function navigate(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===view));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  window.scrollTo({top:0,behavior:'smooth'});
  if(view==='history') renderHistory();
  if(view==='prayers') renderPrayers();
  if(view==='weekly') renderWeekly();
}

document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.view)));
document.querySelectorAll('.open-section').forEach(btn=>btn.addEventListener('click',()=>{
  navigate(btn.dataset.target);
  const focus=btn.dataset.focus;
  if(focus){ setTimeout(()=>el(`${focus}Block`)?.scrollIntoView({behavior:'smooth',block:'start'}),100); }
}));

const fieldIds = ['devotionalText','devotionalMessage','devotionalSurrender','devotionalPrayer','ebdTitle','ebdTopic','ebdLearning','ebdApplication','bibleBook','bibleChapter','bibleVerses','bibleGod','bibleInsight','bibleDirection','nextBibleReading','truthToday','actionToday','personToday','reviewWhat','reviewChrist','reviewGrowth','reviewTomorrow','reviewGratitude'];
const checkIds = ['doneDevotional','doneEbd','doneBible','donePractice','doneReview'];
function loadDayForm(){
  const d=currentDay();
  fieldIds.forEach(id=>el(id).value=d[id]||'');
  checkIds.forEach(id=>el(id).checked=Boolean(d[id]));
  document.querySelectorAll('input[name="reviewStatus"]').forEach(r=>r.checked=d.reviewStatus===r.value);
  el('dailyTitle').textContent=formatDate();
}
function saveDay(){
  const d={date:todayKey(),updatedAt:new Date().toISOString()};
  fieldIds.forEach(id=>d[id]=el(id).value.trim());
  checkIds.forEach(id=>d[id]=el(id).checked);
  d.reviewStatus=document.querySelector('input[name="reviewStatus"]:checked')?.value||'';
  state.days[todayKey()]=d; saveState(); renderDashboard(); showToast('Registro do dia salvo.');
}
el('saveDailyTop').addEventListener('click',saveDay); el('saveDailyBottom').addEventListener('click',saveDay);

function renderDashboard(){
  const d=currentDay();
  const checks=['doneDevotional','doneEbd','doneBible','donePractice','doneReview'];
  const count=checks.filter(k=>d[k]).length; const percent=count*20;
  el('progressCount').textContent=count; el('progressPercent').textContent=`${percent}%`;
  el('ringValue').style.strokeDashoffset=314-(314*percent/100);
  el('progressMessage').textContent=count===5?'Dia concluído. Revise com gratidão e siga em paz.':count>=3?'Você avançou bem. Falta transformar o aprendizado em fechamento.':'Comece com calma. Fidelidade vale mais que pressa.';
  const map={devotional:'doneDevotional',ebd:'doneEbd',bible:'doneBible',practice:'donePractice',review:'doneReview'};
  document.querySelectorAll('.task-card[data-task]').forEach(card=>card.classList.toggle('done',Boolean(d[map[card.dataset.task]])));
  el('nextReading').textContent=d.nextBibleReading?`Próxima leitura: ${d.nextBibleReading}`:'Registre o próximo capítulo da sua leitura.';
  el('practicePreview').textContent=d.actionToday||'Ainda não definida.';
  el('reviewPreview').textContent=d.reviewStatus?`Resultado: ${d.reviewStatus}.`:'Avalie o dia sem condenação e ajuste o amanhã.';
  const active=state.prayers.filter(p=>!p.done); el('prayerPreview').textContent=active.length?`${active.length} pedido(s) ativo(s) na sua lista.`:'Cadastre pessoas e motivos para não esquecer.';
}

function addPrayer(){
  const name=el('prayerName').value.trim(), reason=el('prayerReason').value.trim();
  if(!name||!reason){ showToast('Informe o nome e o motivo.'); return; }
  state.prayers.unshift({id:crypto.randomUUID(),name,reason,category:el('prayerCategory').value,createdAt:new Date().toISOString(),lastPrayed:null,done:false});
  saveState(); el('prayerName').value=''; el('prayerReason').value=''; renderPrayers(); renderDashboard(); showToast('Pedido adicionado.');
}
el('addPrayer').addEventListener('click',addPrayer);
function renderPrayers(){
  const box=el('prayerList'); box.innerHTML='';
  if(!state.prayers.length){ box.innerHTML='<article class="card"><p class="muted">Nenhum pedido cadastrado.</p></article>'; return; }
  state.prayers.forEach(p=>{
    const item=document.createElement('article'); item.className='prayer-item';
    item.innerHTML=`<p class="eyebrow">${escapeHtml(p.category)}</p><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.reason)}</p><p class="muted">Última oração: ${p.lastPrayed?new Date(p.lastPrayed).toLocaleString('pt-BR'):'ainda não registrada'}</p><div class="item-actions"><button class="secondary pray">Orei hoje</button><button class="secondary toggle">${p.done?'Reabrir':'Marcar respondido'}</button><button class="danger remove">Excluir</button></div>`;
    item.querySelector('.pray').onclick=()=>{p.lastPrayed=new Date().toISOString();saveState();renderPrayers();showToast('Oração registrada.');};
    item.querySelector('.toggle').onclick=()=>{p.done=!p.done;saveState();renderPrayers();renderDashboard();};
    item.querySelector('.remove').onclick=()=>{state.prayers=state.prayers.filter(x=>x.id!==p.id);saveState();renderPrayers();renderDashboard();};
    box.appendChild(item);
  });
}

function renderHistory(){
  const box=el('historyList'); box.innerHTML=''; const entries=Object.values(state.days).sort((a,b)=>b.date.localeCompare(a.date));
  if(!entries.length){ box.innerHTML='<article class="card"><p class="muted">Nenhum registro salvo ainda.</p></article>'; return; }
  entries.forEach(d=>{
    const article=document.createElement('article'); article.className='history-item';
    const summary=[d.devotionalText&&`Devocional: ${d.devotionalText}`,d.ebdTitle&&`EBD: ${d.ebdTitle}`,d.bibleBook&&`Leitura: ${d.bibleBook} ${d.bibleChapter}`,d.actionToday&&`Prática: ${d.actionToday}`,d.reviewStatus&&`Revisão: ${d.reviewStatus}`].filter(Boolean).join('\n');
    article.innerHTML=`<details><summary>${new Date(d.date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</summary><div class="history-content">${escapeHtml(summary)||'Registro sem resumo.'}</div></details>`;
    box.appendChild(article);
  });
}

function renderWeekly(){
  const w=state.weeks[weekKey()]||{};
  ['weeklyLearning','weeklyPractice','weeklyDifficulty','weeklyPerson','weeklyFocus'].forEach(id=>el(id).value=w[id]||'');
  const last7=Object.values(state.days).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);
  const totals={dev:0,ebd:0,bible:0,practice:0,review:0};
  last7.forEach(d=>{totals.dev+=!!d.doneDevotional;totals.ebd+=!!d.doneEbd;totals.bible+=!!d.doneBible;totals.practice+=!!d.donePractice;totals.review+=!!d.doneReview;});
  el('weeklySummary').innerHTML=`<h3>Resumo dos últimos 7 registros</h3><p>Devocionais: <strong>${totals.dev}</strong> · EBD: <strong>${totals.ebd}</strong> · Leituras: <strong>${totals.bible}</strong> · Aplicações: <strong>${totals.practice}</strong> · Revisões: <strong>${totals.review}</strong></p>`;
}
el('saveWeekly').addEventListener('click',()=>{
  const data={}; ['weeklyLearning','weeklyPractice','weeklyDifficulty','weeklyPerson','weeklyFocus'].forEach(id=>data[id]=el(id).value.trim());
  state.weeks[weekKey()]={...data,savedAt:new Date().toISOString()}; saveState(); showToast('Revisão semanal salva.');
});

function loadSettings(){
  el('userName').value=state.settings.name||''; el('morningTime').value=state.settings.morningTime||'06:00'; el('practiceTime').value=state.settings.practiceTime||'12:00'; el('reviewTime').value=state.settings.reviewTime||'21:30'; el('darkMode').checked=!!state.settings.darkMode; document.body.classList.toggle('dark',!!state.settings.darkMode);
}
el('saveSettings').addEventListener('click',()=>{
  state.settings={name:el('userName').value.trim(),morningTime:el('morningTime').value,practiceTime:el('practiceTime').value,reviewTime:el('reviewTime').value,darkMode:el('darkMode').checked}; saveState(); loadHeader(); loadSettings(); showToast('Configurações salvas.');
});
el('darkMode').addEventListener('change',()=>document.body.classList.toggle('dark',el('darkMode').checked));

function loadHeader(){
  const hour=new Date().getHours(); const salutation=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
  el('greeting').textContent=state.settings.name?`${salutation}, ${state.settings.name}`:salutation; el('todayLabel').textContent=formatDate();
}
function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`caminho-diario-backup-${todayKey()}.json`; a.click(); URL.revokeObjectURL(a.href); showToast('Backup exportado.');
}
el('exportBtn').addEventListener('click',exportData);
function escapeHtml(s=''){ return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;el('installBtn').classList.remove('hidden');});
el('installBtn').addEventListener('click',async()=>{ if(!deferredPrompt)return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; el('installBtn').classList.add('hidden'); });
if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try {
      await navigator.serviceWorker.register('./service-worker.js', {scope:'./'});
    } catch (error) {
      console.error('Falha ao registrar o service worker:', error);
    }
  });
}

loadHeader(); loadSettings(); loadDayForm(); renderDashboard(); renderPrayers();
