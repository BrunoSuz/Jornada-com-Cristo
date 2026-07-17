import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { collection, deleteDoc, doc, enableNetwork, getDoc, getDocs, getFirestore, initializeFirestore, onSnapshot, persistentLocalCache, persistentMultipleTabManager, serverTimestamp, setDoc, Timestamp, waitForPendingWrites, writeBatch } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const APP_KEY = 'caminhoDiarioDataV1';
const MIGRATION_OWNER_KEY = 'caminhoDiarioMigrationOwnerV1';
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
let activeStorageKey = APP_KEY;
let state = loadState();
let deferredPrompt = null;
let auth = null;
let db = null;
let currentUser = null;
let unsubscribeCloud = [];
let syncConfigured = false;

function loadState(key=activeStorageKey){
  try {
    const saved=JSON.parse(localStorage.getItem(key) || '{}');
    return {...structuredClone(defaultState),...saved,settings:{...defaultState.settings,...(saved.settings||{})},days:saved.days||{},prayers:saved.prayers||[],weeks:saved.weeks||{}};
  }
  catch { return structuredClone(defaultState); }
}
function saveState(){ localStorage.setItem(activeStorageKey, JSON.stringify(state)); }
function el(id){ return document.getElementById(id); }
function showToast(text){ const t=el('toast'); t.textContent=text; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function formatDate(date=new Date()){ return date.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}); }
function currentDay(){ return state.days[todayKey()] || {}; }
function refreshAll(){
  const editing=document.activeElement?.matches('input,textarea,select');
  loadHeader();
  if(!editing){loadSettings();loadDayForm();renderWeekly();}
  renderDashboard();renderPrayers();renderHistory();
}

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
  state.days[todayKey()]=d; saveState(); syncDay(todayKey(),d); renderDashboard(); showToast('Registro do dia salvo.');
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
  const prayer={id:crypto.randomUUID(),name,reason,category:el('prayerCategory').value,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),lastPrayed:null,done:false};
  state.prayers.unshift(prayer);
  syncPrayer(prayer);
  saveState(); el('prayerName').value=''; el('prayerReason').value=''; renderPrayers(); renderDashboard(); showToast('Pedido adicionado.');
}
el('addPrayer').addEventListener('click',addPrayer);
function renderPrayers(){
  const box=el('prayerList'); box.innerHTML='';
  if(!state.prayers.length){ box.innerHTML='<article class="card"><p class="muted">Nenhum pedido cadastrado.</p></article>'; return; }
  state.prayers.forEach(p=>{
    const item=document.createElement('article'); item.className='prayer-item';
    item.innerHTML=`<p class="eyebrow">${escapeHtml(p.category)}</p><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.reason)}</p><p class="muted">Última oração: ${p.lastPrayed?new Date(p.lastPrayed).toLocaleString('pt-BR'):'ainda não registrada'}</p><div class="item-actions"><button class="secondary pray">Orei hoje</button><button class="secondary toggle">${p.done?'Reabrir':'Marcar respondido'}</button><button class="danger remove">Excluir</button></div>`;
    item.querySelector('.pray').onclick=()=>{p.lastPrayed=new Date().toISOString();p.updatedAt=new Date().toISOString();saveState();syncPrayer(p);renderPrayers();showToast('Oração registrada.');};
    item.querySelector('.toggle').onclick=()=>{p.done=!p.done;p.updatedAt=new Date().toISOString();saveState();syncPrayer(p);renderPrayers();renderDashboard();};
    item.querySelector('.remove').onclick=()=>{state.prayers=state.prayers.filter(x=>x.id!==p.id);saveState();removeCloudDoc('prayers',p.id);renderPrayers();renderDashboard();};
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
  state.weeks[weekKey()]={...data,week:weekKey(),savedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; saveState(); syncWeek(weekKey(),state.weeks[weekKey()]); showToast('Revisão semanal salva.');
});

function loadSettings(){
  el('userName').value=state.settings.name||''; el('morningTime').value=state.settings.morningTime||'06:00'; el('practiceTime').value=state.settings.practiceTime||'12:00'; el('reviewTime').value=state.settings.reviewTime||'21:30'; el('darkMode').checked=!!state.settings.darkMode; document.body.classList.toggle('dark',!!state.settings.darkMode);
}
el('saveSettings').addEventListener('click',()=>{
  state.settings={name:el('userName').value.trim(),morningTime:el('morningTime').value,practiceTime:el('practiceTime').value,reviewTime:el('reviewTime').value,darkMode:el('darkMode').checked,updatedAt:new Date().toISOString()}; saveState(); syncSettings(); loadHeader(); loadSettings(); showToast('Configurações salvas.');
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

function setSyncStatus(kind,text){
  const status=el('syncStatus');status.className=`sync-status ${kind}`;status.textContent=text;
}
function firebaseReady(){ return ['apiKey','authDomain','projectId','appId'].every(key=>firebaseConfig[key]); }
function timestampMillis(value){
  if(value?.toMillis)return value.toMillis();
  const parsed=Date.parse(value||0);return Number.isNaN(parsed)?0:parsed;
}
function timestampIso(value){ return value?.toDate?value.toDate().toISOString():(value||null); }
function normalizeDay(id,data={}){
  const normalized={date:data.date||id,updatedAt:timestampIso(data.updatedAt)||new Date().toISOString(),reviewStatus:data.reviewStatus||''};
  fieldIds.forEach(key=>normalized[key]=typeof data[key]==='string'?data[key]:'');
  checkIds.forEach(key=>normalized[key]=Boolean(data[key]));
  return normalized;
}
function normalizePrayer(id,data={}){
  return {id,name:data.name||'',reason:data.reason||'',category:data.category||'Outro',createdAt:timestampIso(data.createdAt)||new Date().toISOString(),updatedAt:timestampIso(data.updatedAt)||timestampIso(data.createdAt)||new Date().toISOString(),lastPrayed:timestampIso(data.lastPrayed),done:Boolean(data.done)};
}
function normalizeWeek(id,data={}){
  const normalized={week:data.week||id,savedAt:timestampIso(data.savedAt)||new Date().toISOString(),updatedAt:timestampIso(data.updatedAt)||timestampIso(data.savedAt)||new Date().toISOString()};
  ['weeklyLearning','weeklyPractice','weeklyDifficulty','weeklyPerson','weeklyFocus'].forEach(key=>normalized[key]=typeof data[key]==='string'?data[key]:'');
  return normalized;
}
function normalizeSettings(data={}){
  return {...defaultState.settings,name:data.name||'',morningTime:data.morningTime||'06:00',practiceTime:data.practiceTime||'12:00',reviewTime:data.reviewTime||'21:30',darkMode:Boolean(data.darkMode),updatedAt:timestampIso(data.updatedAt)||new Date().toISOString()};
}
function userCollection(name){ return collection(db,'users',currentUser.uid,name); }
function userDoc(name,id){ return doc(db,'users',currentUser.uid,name,id); }
function markSaving(){ if(currentUser)setSyncStatus(navigator.onLine?'saving':'offline',navigator.onLine?'Salvando…':'Offline · alterações na fila'); }
function handleSyncError(error){
  console.error('Falha de sincronização:',error);
  setSyncStatus(navigator.onLine?'error':'offline',navigator.onLine?'Erro ao sincronizar':'Offline · alterações na fila');
}
async function syncDay(id,data){
  if(!currentUser)return;markSaving();
  const clean=normalizeDay(id,data);await setDoc(userDoc('days',id),{...clean,updatedAt:serverTimestamp()}).catch(handleSyncError);
}
async function syncPrayer(data){
  if(!currentUser)return;markSaving();
  const clean=normalizePrayer(data.id,data);
  await setDoc(userDoc('prayers',data.id),{...clean,createdAt:Timestamp.fromDate(new Date(clean.createdAt)),updatedAt:serverTimestamp(),lastPrayed:clean.lastPrayed?Timestamp.fromDate(new Date(clean.lastPrayed)):null}).catch(handleSyncError);
}
async function syncWeek(id,data){
  if(!currentUser)return;markSaving();
  const clean=normalizeWeek(id,data);await setDoc(userDoc('weeks',id),{...clean,savedAt:Timestamp.fromDate(new Date(clean.savedAt)),updatedAt:serverTimestamp()}).catch(handleSyncError);
}
async function syncSettings(){
  if(!currentUser)return;markSaving();
  const clean=normalizeSettings(state.settings);await setDoc(userDoc('settings','profile'),{...clean,updatedAt:serverTimestamp()}).catch(handleSyncError);
}
async function removeCloudDoc(group,id){
  if(!currentUser)return;markSaving();await deleteDoc(userDoc(group,id)).catch(handleSyncError);
}

async function mergeAndMigrate(){
  setSyncStatus('saving','Preparando sincronização…');
  const [daysSnap,prayersSnap,weeksSnap,settingsSnap]=await Promise.all([
    getDocs(userCollection('days')),getDocs(userCollection('prayers')),getDocs(userCollection('weeks')),getDoc(userDoc('settings','profile'))
  ]);
  const cloudDays=new Map(daysSnap.docs.map(item=>[item.id,item.data()]));
  const cloudPrayers=new Map(prayersSnap.docs.map(item=>[item.id,item.data()]));
  const cloudWeeks=new Map(weeksSnap.docs.map(item=>[item.id,item.data()]));
  for(const [id,local] of Object.entries(state.days)){
    const remote=cloudDays.get(id);
    if(!remote||timestampMillis(local.updatedAt)>timestampMillis(remote.updatedAt))await syncDay(id,local);
    else state.days[id]=normalizeDay(id,remote);
  }
  cloudDays.forEach((data,id)=>{if(!state.days[id])state.days[id]=normalizeDay(id,data);});
  for(const local of state.prayers){
    const remote=cloudPrayers.get(local.id);
    if(!remote||timestampMillis(local.updatedAt||local.createdAt)>timestampMillis(remote.updatedAt))await syncPrayer(local);
  }
  const prayerMap=new Map(state.prayers.map(item=>[item.id,item]));
  cloudPrayers.forEach((data,id)=>{const local=prayerMap.get(id);if(!local||timestampMillis(data.updatedAt)>=timestampMillis(local.updatedAt||local.createdAt))prayerMap.set(id,normalizePrayer(id,data));});
  state.prayers=[...prayerMap.values()];
  for(const [id,local] of Object.entries(state.weeks)){
    const remote=cloudWeeks.get(id);
    if(!remote||timestampMillis(local.updatedAt||local.savedAt)>timestampMillis(remote.updatedAt))await syncWeek(id,local);
    else state.weeks[id]=normalizeWeek(id,remote);
  }
  cloudWeeks.forEach((data,id)=>{if(!state.weeks[id])state.weeks[id]=normalizeWeek(id,data);});
  if(settingsSnap.exists()){
    const remote=settingsSnap.data();
    if(timestampMillis(state.settings.updatedAt)>timestampMillis(remote.updatedAt))await syncSettings();
    else state.settings=normalizeSettings(remote);
  }else if(state.settings.name||state.settings.updatedAt){ await syncSettings(); }
  saveState();refreshAll();
}

function listenToCloud(){
  const listen=(group,apply)=>onSnapshot(userCollection(group),{includeMetadataChanges:true},snapshot=>{
    snapshot.docChanges().forEach(change=>apply(change.type,change.doc.id,change.doc.data()));
    saveState();refreshAll();
    const pending=snapshot.metadata.hasPendingWrites;
    setSyncStatus(pending?'saving':snapshot.metadata.fromCache?'offline':'synced',pending?'Salvando…':snapshot.metadata.fromCache?'Offline · dados locais':'Sincronizado');
  },handleSyncError);
  unsubscribeCloud.push(listen('days',(type,id,data)=>{if(type==='removed')delete state.days[id];else state.days[id]=normalizeDay(id,data);}));
  unsubscribeCloud.push(listen('prayers',(type,id,data)=>{state.prayers=state.prayers.filter(item=>item.id!==id);if(type!=='removed')state.prayers.push(normalizePrayer(id,data));}));
  unsubscribeCloud.push(listen('weeks',(type,id,data)=>{if(type==='removed')delete state.weeks[id];else state.weeks[id]=normalizeWeek(id,data);}));
  unsubscribeCloud.push(onSnapshot(userDoc('settings','profile'),{includeMetadataChanges:true},snapshot=>{if(snapshot.exists()){state.settings=normalizeSettings(snapshot.data());saveState();loadSettings();loadHeader();}},handleSyncError));
}
function stopCloudListeners(){ unsubscribeCloud.forEach(stop=>stop());unsubscribeCloud=[]; }
function switchToUserStorage(user){
  const userKey=`${APP_KEY}:${user.uid}`;
  if(!localStorage.getItem(userKey)&&localStorage.getItem(APP_KEY)&&!localStorage.getItem(MIGRATION_OWNER_KEY)){
    localStorage.setItem(userKey,localStorage.getItem(APP_KEY));localStorage.setItem(MIGRATION_OWNER_KEY,user.uid);localStorage.removeItem(APP_KEY);
  }
  activeStorageKey=userKey;state=loadState();refreshAll();
}
function showAccount(user){
  el('signedOutAccount').classList.toggle('hidden',Boolean(user));el('signedInAccount').classList.toggle('hidden',!user);
  el('accountEmail').textContent=user?.email||'';
}
function authMessage(error){
  const known={'auth/invalid-credential':'E-mail ou senha inválidos.','auth/email-already-in-use':'Este e-mail já possui uma conta.','auth/weak-password':'Use uma senha mais forte, com pelo menos 6 caracteres.','auth/invalid-email':'Informe um e-mail válido.','auth/network-request-failed':'Sem conexão. Tente novamente quando estiver online.'};
  return known[error.code]||'Não foi possível concluir. Verifique os dados e tente novamente.';
}
async function submitAuth(create=false){
  if(!syncConfigured||!auth){showToast('A sincronização Firebase ainda não foi configurada.');return;}
  const email=el('authEmail').value.trim(),password=el('authPassword').value;
  if(!email||password.length<6){showToast('Informe um e-mail e uma senha com pelo menos 6 caracteres.');return;}
  try{if(create)await createUserWithEmailAndPassword(auth,email,password);else await signInWithEmailAndPassword(auth,email,password);el('authPassword').value='';}
  catch(error){showToast(authMessage(error));}
}
async function deleteCloudData(){
  if(!currentUser||!confirm('Excluir definitivamente todos os seus registros da nuvem? Esta ação não pode ser desfeita.'))return;
  try{
    setSyncStatus('saving','Excluindo dados…');
    const refs=[];
    for(const group of ['days','prayers','weeks']){const snapshot=await getDocs(userCollection(group));snapshot.forEach(item=>refs.push(item.ref));}
    refs.push(userDoc('settings','profile'));
    for(let start=0;start<refs.length;start+=450){const batch=writeBatch(db);refs.slice(start,start+450).forEach(ref=>batch.delete(ref));await batch.commit();}
    state=structuredClone(defaultState);saveState();refreshAll();showToast('Dados da nuvem excluídos.');
  }catch(error){handleSyncError(error);showToast('Não foi possível excluir os dados.');}
}
async function initializeFirebase(){
  syncConfigured=firebaseReady();el('firebaseSetupNote').classList.toggle('hidden',syncConfigured);
  el('signInBtn').disabled=!syncConfigured;el('signUpBtn').disabled=!syncConfigured;
  if(!syncConfigured){setSyncStatus('local','Somente neste aparelho');return;}
  try{
    const app=initializeApp(firebaseConfig);auth=getAuth(app);
    try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});}
    catch(error){console.warn('Cache persistente indisponível; usando cache da sessão.',error);db=getFirestore(app);}
    onAuthStateChanged(auth,async user=>{
      stopCloudListeners();currentUser=user;showAccount(user);
      if(!user){activeStorageKey=APP_KEY;state=loadState();refreshAll();setSyncStatus('local','Somente neste aparelho');return;}
      switchToUserStorage(user);
      try{await mergeAndMigrate();listenToCloud();showToast('Conta conectada e sincronização ativa.');}
      catch(error){handleSyncError(error);showToast('Conta conectada, mas a sincronização falhou.');}
    });
  }catch(error){handleSyncError(error);el('firebaseSetupNote').classList.remove('hidden');}
}

el('signInBtn').addEventListener('click',()=>submitAuth(false));
el('signUpBtn').addEventListener('click',()=>submitAuth(true));
el('signOutBtn').addEventListener('click',()=>signOut(auth));
el('syncNowBtn').addEventListener('click',async()=>{
  if(!navigator.onLine){showToast('Você está offline. As alterações permanecem na fila.');return;}
  try{setSyncStatus('saving','Sincronizando…');await enableNetwork(db);await waitForPendingWrites(db);setSyncStatus('synced','Sincronizado');showToast('Sincronização concluída.');}catch(error){handleSyncError(error);}
});
el('deleteCloudBtn').addEventListener('click',deleteCloudData);
window.addEventListener('online',()=>{if(currentUser){setSyncStatus('saving','Reconectando…');enableNetwork(db).catch(handleSyncError);}});
window.addEventListener('offline',()=>{if(currentUser)setSyncStatus('offline','Offline · alterações na fila');});

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

loadHeader(); loadSettings(); loadDayForm(); renderDashboard(); renderPrayers(); initializeFirebase();
