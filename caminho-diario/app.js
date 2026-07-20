import { supabaseConfig } from './supabase-config.js';
import {
  APP_KEY, DAY_CHECK_FIELDS, DAY_TEXT_FIELDS, GUEST_SCOPE,
  RECORD_KINDS, WEEK_TEXT_FIELDS, createDefaultState
} from './js/constants.js';
import { chooseNewest, nextRetryDelay, operationKey, shouldApplyRealtime } from './js/sync-engine.js';
import {
  claimGuestData, clearScope, getPending, list, listSync, loadState,
  markAttempt, markDeleted, markSynced, mergeScope, migrateLegacyStorage,
  remove, replaceScope, set
} from './js/storage.js';
import {
  normalizeDay, normalizePrayer, normalizeRecord, normalizeSettings,
  normalizeWeek, validateBackup
} from './js/validation.js';
import { debounce, isoWeekKey, localDateKey, nowIso, sleep } from './js/utils.js';

const { createClient } = window.supabase || {};
const el = id => document.getElementById(id);
document.documentElement.dataset.appVersion = '6';
const todayKey = localDateKey;
const weekKey = isoWeekKey;

let activeScope = GUEST_SCOPE;
let state = createDefaultState();
let supabase = null;
let currentUser = null;
let cloudChannel = null;
let deferredPrompt = null;
let syncPromise = null;
let syncRequested = false;
let syncNeedsPull = false;
let toastTimer = null;
let undoTimer = null;
let reloadingForUpdate = false;
let editingDayKey = todayKey();

function showToast(text, { persistent = false } = {}) {
  clearTimeout(toastTimer);
  el('toast').textContent = text;
  el('toast').classList.add('show');
  if (!persistent) toastTimer = setTimeout(() => el('toast').classList.remove('show'), 2800);
}

function setSyncStatus(kind, text) {
  const status = el('syncStatus');
  status.className = `sync-status ${kind}`;
  status.textContent = text;
}

function handleSyncError(error) {
  console.error('Falha de sincronização:', error?.message || 'erro sem detalhes');
  setSyncStatus(navigator.onLine ? 'error' : 'offline', navigator.onLine ? 'Erro ao sincronizar · tente novamente' : 'Offline · alterações na fila');
}

function handleStorageError(error) {
  console.error('Falha no armazenamento local:', error?.message || 'erro sem detalhes');
  showToast('Não foi possível salvar neste aparelho. Exporte um backup e tente novamente.', { persistent: true });
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function currentDay() { return state.days[todayKey()] || {}; }
function editingDay() { return state.days[editingDayKey] || {}; }

function applyTheme() {
  const theme = state.settings.theme || 'system';
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemDark));
  document.documentElement.dataset.theme = theme;
}

function loadHeader() {
  const hour = new Date().getHours();
  const salutation = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  el('greeting').textContent = state.settings.name ? `${salutation}, ${state.settings.name}` : salutation;
  el('todayLabel').textContent = formatDate();
}

function loadDayForm() {
  const day = editingDay();
  DAY_TEXT_FIELDS.forEach(id => { el(id).value = day[id] || ''; });
  DAY_CHECK_FIELDS.forEach(id => { el(id).checked = Boolean(day[id]); });
  document.querySelectorAll('input[name="reviewStatus"]').forEach(input => { input.checked = day.reviewStatus === input.value; });
  el('dailyTitle').textContent = new Date(`${editingDayKey}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function loadSettings() {
  el('userName').value = state.settings.name || '';
  el('morningTime').value = state.settings.morningTime || '06:00';
  el('practiceTime').value = state.settings.practiceTime || '12:00';
  el('reviewTime').value = state.settings.reviewTime || '21:30';
  el('themeMode').value = state.settings.theme || 'system';
  applyTheme();
}

function refreshAll() {
  const editing = document.activeElement?.matches('input,textarea,select');
  loadHeader();
  if (!editing) { loadSettings(); loadDayForm(); renderWeekly(); }
  renderDashboard();
  renderPrayers();
  renderHistory();
}

function navigate(view, focusBlock = null) {
  document.querySelectorAll('.view').forEach(section => {
    const active = section.id === view;
    section.classList.toggle('active', active);
    section.setAttribute('aria-hidden', String(!active));
  });
  document.querySelectorAll('.nav-btn').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const target = focusBlock ? el(`${focusBlock}Block`) : document.querySelector(`#${view} h2`);
  if (target) { target.setAttribute('tabindex', '-1'); setTimeout(() => target.focus({ preventScroll: true }), 0); }
  if (view === 'history') renderHistory();
  if (view === 'prayers') renderPrayers();
  if (view === 'weekly') renderWeekly();
}

function renderDashboard() {
  const day = currentDay();
  const checks = ['doneDevotional', 'doneEbd', 'doneBible', 'donePractice', 'doneReview'];
  const count = checks.filter(key => day[key]).length;
  const percent = count * 20;
  el('progressCount').textContent = count;
  el('progressPercent').textContent = `${percent}%`;
  el('ringValue').style.strokeDashoffset = 314 - (314 * percent / 100);
  el('progressRing').setAttribute('aria-valuenow', String(percent));
  el('progressMessage').textContent = count === 5 ? 'Dia concluído. Revise com gratidão e siga em paz.' : count >= 3 ? 'Você avançou bem. Continue no seu ritmo.' : 'Comece com calma. Fidelidade vale mais que pressa.';
  const map = { devotional: 'doneDevotional', ebd: 'doneEbd', bible: 'doneBible', practice: 'donePractice', review: 'doneReview' };
  document.querySelectorAll('.task-card[data-task]').forEach(card => card.classList.toggle('done', Boolean(day[map[card.dataset.task]])));
  el('nextReading').textContent = day.nextBibleReading ? `Próxima leitura: ${day.nextBibleReading}` : 'Registre o próximo capítulo da sua leitura.';
  el('practicePreview').textContent = day.actionToday || 'Ainda não definida.';
  el('reviewPreview').textContent = day.reviewStatus ? `Resultado: ${day.reviewStatus}.` : 'Avalie o dia sem condenação e ajuste o amanhã.';
  const activePrayers = state.prayers.filter(prayer => prayer.status === 'active');
  el('prayerPreview').textContent = activePrayers.length ? `Ore hoje por ${activePrayers.slice(0, 3).map(prayer => prayer.name).join(', ')}${activePrayers.length > 3 ? ` e mais ${activePrayers.length - 3}` : ''}.` : 'Cadastre pessoas e motivos para não esquecer.';
  const next = Object.entries(map).find(([, key]) => !day[key])?.[0] || 'review';
  el('continueBtn').dataset.focus = next;
  el('continueBtn').textContent = count === 5 ? 'Rever o dia' : 'Continuar de onde parei';
}

async function saveDay({ silent = false } = {}) {
  const payload = { date: editingDayKey, updatedAt: nowIso() };
  DAY_TEXT_FIELDS.forEach(id => { payload[id] = el(id).value; });
  DAY_CHECK_FIELDS.forEach(id => { payload[id] = el(id).checked; });
  payload.reviewStatus = document.querySelector('input[name="reviewStatus"]:checked')?.value || '';
  try {
    state.days[editingDayKey] = await set(activeScope, RECORD_KINDS.DAY, editingDayKey, payload);
    renderDashboard();
    requestSync();
    el('draftStatus').textContent = `Rascunho salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    if (!silent) showToast(currentUser ? 'Registro salvo e colocado na sincronização.' : 'Registro salvo neste aparelho.');
  } catch (error) { handleStorageError(error); }
}

const autosaveDay = debounce(() => saveDay({ silent: true }), 900);

async function addPrayer() {
  const name = el('prayerName').value.trim();
  const reason = el('prayerReason').value.trim();
  if (!name || !reason) { showToast('Informe o nome e o motivo.'); return; }
  const duplicate = state.prayers.some(prayer => prayer.status === 'active' && prayer.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR') && prayer.reason.toLocaleLowerCase('pt-BR') === reason.toLocaleLowerCase('pt-BR'));
  if (duplicate) { showToast('Este pedido já está na lista.'); return; }
  try {
    const prayer = normalizePrayer(crypto.randomUUID(), { name, reason, category: el('prayerCategory').value, status: 'active', createdAt: nowIso(), updatedAt: nowIso() });
    await set(activeScope, RECORD_KINDS.PRAYER, prayer.id, prayer);
    state.prayers.unshift(prayer);
    el('prayerName').value = '';
    el('prayerReason').value = '';
    requestSync(); renderPrayers(); renderDashboard(); showToast('Pedido adicionado.');
  } catch (error) { handleStorageError(error); }
}

function prayerButton(text, className, action) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = className; button.textContent = text; button.addEventListener('click', action);
  return button;
}

async function updatePrayer(prayer, changes, message = '') {
  try {
    const updated = normalizePrayer(prayer.id, { ...prayer, ...changes, updatedAt: nowIso() });
    await set(activeScope, RECORD_KINDS.PRAYER, prayer.id, updated);
    Object.assign(prayer, updated); requestSync(); renderPrayers(); renderDashboard(); if (message) showToast(message);
  } catch (error) { handleStorageError(error); }
}

async function removePrayerWithUndo(prayer) {
  if (!confirm(`Excluir o pedido de ${prayer.name}? Você poderá desfazer por alguns segundos.`)) return;
  try {
    await markDeleted(activeScope, RECORD_KINDS.PRAYER, prayer.id);
    state.prayers = state.prayers.filter(item => item.id !== prayer.id);
    renderPrayers(); renderDashboard(); requestSync();
    clearTimeout(undoTimer); el('undoMessage').textContent = `Pedido de ${prayer.name} excluído.`; el('undoBar').classList.remove('hidden');
    el('undoDeleteBtn').onclick = async () => { clearTimeout(undoTimer); await set(activeScope, RECORD_KINDS.PRAYER, prayer.id, { ...prayer, updatedAt: nowIso() }); state.prayers.unshift({ ...prayer, updatedAt: nowIso() }); el('undoBar').classList.add('hidden'); requestSync(); renderPrayers(); renderDashboard(); showToast('Exclusão desfeita.'); };
    undoTimer = setTimeout(() => el('undoBar').classList.add('hidden'), 8000);
  } catch (error) { handleStorageError(error); }
}

function renderPrayers() {
  const box = el('prayerList'); box.replaceChildren();
  const query = el('prayerSearch').value.trim().toLocaleLowerCase('pt-BR');
  const filter = el('prayerFilter').value;
  const prayers = state.prayers.filter(prayer => (!query || `${prayer.name} ${prayer.reason}`.toLocaleLowerCase('pt-BR').includes(query)) && (filter === 'all' || prayer.status === filter));
  if (!prayers.length) { const empty = document.createElement('article'); empty.className = 'card'; const text = document.createElement('p'); text.className = 'muted'; text.textContent = query || filter !== 'all' ? 'Nenhum pedido corresponde aos filtros.' : 'Nenhum pedido cadastrado.'; empty.append(text); box.append(empty); return; }
  prayers.forEach(prayer => {
    const item = document.createElement('article'); item.className = 'prayer-item';
    const category = document.createElement('p'); category.className = 'eyebrow'; category.textContent = `${prayer.category} · ${prayer.status === 'active' ? 'ativo' : prayer.status === 'answered' ? 'respondido' : 'arquivado'}`;
    const title = document.createElement('h3'); title.textContent = prayer.name;
    const reason = document.createElement('p'); reason.textContent = prayer.reason;
    const last = document.createElement('p'); last.className = 'muted'; last.textContent = `Última oração: ${prayer.lastPrayed ? new Date(prayer.lastPrayed).toLocaleString('pt-BR') : 'ainda não registrada'}`;
    const answer = document.createElement('p'); answer.className = prayer.answer ? '' : 'hidden'; answer.textContent = prayer.answer ? `Resposta recebida: ${prayer.answer}` : '';
    const actions = document.createElement('div'); actions.className = 'item-actions';
    actions.append(
      prayerButton('Orei hoje', 'secondary', () => updatePrayer(prayer, { lastPrayed: nowIso() }, 'Oração registrada.')),
      prayerButton(prayer.status === 'active' ? 'Marcar respondido' : 'Reabrir', 'secondary', () => { const answering = prayer.status === 'active'; const response = answering ? prompt('Como esta oração foi respondida? (opcional)', prayer.answer || '') : ''; updatePrayer(prayer, { status: answering ? 'answered' : 'active', answeredAt: answering ? nowIso() : null, answer: response || '' }); }),
      prayerButton(prayer.status === 'archived' ? 'Desarquivar' : 'Arquivar', 'secondary', () => updatePrayer(prayer, { status: prayer.status === 'archived' ? 'active' : 'archived', archivedAt: prayer.status === 'archived' ? null : nowIso() })),
      prayerButton('Excluir', 'danger', () => removePrayerWithUndo(prayer))
    );
    item.append(category, title, reason, answer, last, actions); box.append(item);
  });
}

function renderHistory() {
  const box = el('historyList'); box.replaceChildren();
  const query = el('historySearch').value.trim().toLocaleLowerCase('pt-BR');
  const from = el('historyFrom').value; const to = el('historyTo').value; const type = el('historyType').value;
  const typeFields = { devotional: ['devotionalText', 'devotionalMessage'], ebd: ['ebdTitle', 'ebdLearning'], bible: ['bibleBook', 'bibleInsight'], practice: ['actionToday', 'truthToday'], review: ['reviewStatus', 'reviewWhat'] }[type];
  const entries = Object.values(state.days).sort((a, b) => b.date.localeCompare(a.date)).filter(day => (!from || day.date >= from) && (!to || day.date <= to) && (!typeFields || typeFields.some(field => day[field])) && (!query || JSON.stringify(day).toLocaleLowerCase('pt-BR').includes(query)));
  if (!entries.length) { const empty = document.createElement('article'); empty.className = 'card'; const text = document.createElement('p'); text.className = 'muted'; text.textContent = query || from || to ? 'Nenhum registro corresponde aos filtros.' : 'Nenhum registro salvo ainda.'; empty.append(text); box.append(empty); return; }
  entries.forEach(day => {
    const article = document.createElement('article'); article.className = 'history-item';
    const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const content = document.createElement('div'); content.className = 'history-content';
    const fields = [day.devotionalText && `Devocional: ${day.devotionalText}`, day.devotionalMessage && `Reflexão: ${day.devotionalMessage}`, day.ebdTitle && `EBD: ${day.ebdTitle}`, day.bibleBook && `Leitura: ${day.bibleBook} ${day.bibleChapter}`, day.bibleInsight && `Observação: ${day.bibleInsight}`, day.actionToday && `Prática: ${day.actionToday}`, day.reviewStatus && `Revisão: ${day.reviewStatus}`, day.reviewGratitude && `Gratidão: ${day.reviewGratitude}`].filter(Boolean);
    fields.forEach(value => { const paragraph = document.createElement('p'); paragraph.textContent = value; content.append(paragraph); });
    const actions = document.createElement('div'); actions.className = 'item-actions'; actions.append(prayerButton('Editar este dia', 'secondary', () => { editingDayKey = day.date; loadDayForm(); navigate('daily', 'devotional'); }), prayerButton('Excluir registro', 'danger', async () => { if (!confirm(`Excluir o registro de ${day.date}?`)) return; await markDeleted(activeScope, RECORD_KINDS.DAY, day.date); delete state.days[day.date]; if (editingDayKey === day.date) editingDayKey = todayKey(); requestSync(); renderHistory(); renderDashboard(); }));
    content.append(actions); details.append(summary, content); article.append(details); box.append(article);
  });
}

function renderWeekly() {
  const week = state.weeks[weekKey()] || {};
  WEEK_TEXT_FIELDS.forEach(id => { el(id).value = week[id] || ''; });
  const lastSeven = Object.values(state.days).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const totals = { dev: 0, ebd: 0, bible: 0, practice: 0, review: 0 };
  lastSeven.forEach(day => { totals.dev += Boolean(day.doneDevotional); totals.ebd += Boolean(day.doneEbd); totals.bible += Boolean(day.doneBible); totals.practice += Boolean(day.donePractice); totals.review += Boolean(day.doneReview); });
  const summary = el('weeklySummary'); summary.replaceChildren(); const heading = document.createElement('h3'); heading.textContent = `Resumo de ${lastSeven.length} registro(s)`; const text = document.createElement('p'); text.textContent = `Devocionais: ${totals.dev} · EBD: ${totals.ebd} · Leituras: ${totals.bible} · Aplicações: ${totals.practice} · Revisões: ${totals.review}`; summary.append(heading, text);
}

function applyRecordToState(kind, id, payload) {
  if (kind === RECORD_KINDS.DAY) state.days[id] = payload;
  if (kind === RECORD_KINDS.PRAYER) { state.prayers = state.prayers.filter(item => item.id !== id); state.prayers.push(payload); state.prayers.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  if (kind === RECORD_KINDS.WEEK) state.weeks[id] = payload;
  if (kind === RECORD_KINDS.SETTINGS && id === 'profile') state.settings = payload;
}

function removeRecordFromState(kind, id) {
  if (kind === RECORD_KINDS.DAY) delete state.days[id];
  if (kind === RECORD_KINDS.PRAYER) state.prayers = state.prayers.filter(item => item.id !== id);
  if (kind === RECORD_KINDS.WEEK) delete state.weeks[id];
}

async function sendOperation(operation) {
  let lastError;
  const firstAttempt = Math.min(operation.attempts || 0, 3);
  for (let attempt = firstAttempt; attempt < 4; attempt += 1) {
    if (!navigator.onLine) throw new Error('Conexão indisponível.');
    if (attempt > firstAttempt) await sleep(nextRetryDelay(attempt - 1));
    let error;
    if (operation.type === 'delete') ({ error } = await supabase.from('caminho_diario_records').delete().eq('user_id', currentUser.id).eq('kind', operation.kind).eq('record_id', operation.id));
    else ({ error } = await supabase.from('caminho_diario_records').upsert({ user_id: currentUser.id, kind: operation.kind, record_id: operation.id, payload: operation.payload, updated_at: operation.revision }, { onConflict: 'user_id,kind,record_id' }));
    if (!error) { await markSynced(operation.key, operation.revision); return; }
    lastError = error; await markAttempt(operation.key, attempt + 1, error.message);
  }
  throw lastError || new Error('Falha ao processar alteração pendente.');
}

async function flushOutbox() {
  for (const operation of await listSync(activeScope)) await sendOperation(operation);
}

async function pullAndMerge() {
  const { data: rows, error } = await supabase.from('caminho_diario_records').select('kind,record_id,payload,updated_at');
  if (error) throw error;
  const localRows = await list(activeScope);
  const localMap = new Map(localRows.map(row => [operationKey(activeScope, row.kind, row.id), row]));
  const remoteKeys = new Set();
  for (const row of rows || []) {
    const key = operationKey(activeScope, row.kind, row.record_id); remoteKeys.add(key);
    const localRow = localMap.get(key); const pending = await getPending(activeScope, row.kind, row.record_id);
    const remote = normalizeRecord(row.kind, row.record_id, { ...row.payload, updatedAt: row.updated_at });
    const chosen = chooseNewest(localRow?.payload, remote, Boolean(pending));
    if (chosen === remote) { await set(activeScope, row.kind, row.record_id, remote, { enqueue: false }); applyRecordToState(row.kind, row.record_id, remote); }
    else if (!pending && chosen) await set(activeScope, row.kind, row.record_id, chosen);
  }
  for (const row of localRows) {
    const key = operationKey(activeScope, row.kind, row.id); if (remoteKeys.has(key)) continue;
    const pending = await getPending(activeScope, row.kind, row.id); if (pending) continue;
    if (row.syncedRevision) { await remove(activeScope, row.kind, row.id, { enqueue: false }); removeRecordFromState(row.kind, row.id); }
    else await set(activeScope, row.kind, row.id, row.payload);
  }
  refreshAll();
}

function requestSync({ pull = false } = {}) {
  if (!currentUser || !supabase || !navigator.onLine) { if (currentUser) setSyncStatus('offline', 'Offline · alterações na fila'); return Promise.resolve(); }
  syncRequested = true; if (pull) syncNeedsPull = true; if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    try {
      setSyncStatus('saving', 'Sincronizando…');
      while (syncRequested) { syncRequested = false; const shouldPull = syncNeedsPull; syncNeedsPull = false; await flushOutbox(); if (shouldPull) await pullAndMerge(); }
      const pending = (await listSync(activeScope)).length; setSyncStatus(pending ? 'saving' : 'synced', pending ? `${pending} alteração(ões) pendente(s)` : 'Sincronizado');
    } catch (error) { handleSyncError(error); throw error; }
    finally { syncPromise = null; }
  })();
  return syncPromise;
}

function listenToCloud() {
  const userScope = currentUser.id;
  cloudChannel = supabase.channel(`records:${userScope}`).on('postgres_changes', { event: '*', schema: 'public', table: 'caminho_diario_records', filter: `user_id=eq.${userScope}` }, async payload => {
    if (activeScope !== userScope) return;
    const row = payload.new?.kind ? payload.new : payload.old; if (!row) return;
    try {
      const pending = await getPending(activeScope, row.kind, row.record_id);
      if (payload.eventType === 'DELETE') { if (!pending) { await remove(activeScope, row.kind, row.record_id, { enqueue: false }); removeRecordFromState(row.kind, row.record_id); refreshAll(); } return; }
      const remote = normalizeRecord(row.kind, row.record_id, { ...row.payload, updatedAt: row.updated_at });
      const localRow = (await list(activeScope, row.kind)).find(item => item.id === row.record_id);
      if (shouldApplyRealtime(localRow?.payload, remote, pending)) { await set(activeScope, row.kind, row.record_id, remote, { enqueue: false }); applyRecordToState(row.kind, row.record_id, remote); refreshAll(); setSyncStatus('synced', 'Sincronizado'); }
    } catch (error) { handleSyncError(error); }
  }).subscribe(status => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSyncStatus('error', 'Realtime indisponível · sincronização manual ativa'); });
}

function stopCloudListeners() { if (cloudChannel && supabase) supabase.removeChannel(cloudChannel); cloudChannel = null; }

async function switchStorage(scope) { activeScope = scope; state = await loadState(scope); refreshAll(); }

function showAccount(user) {
  el('signedOutAccount').classList.toggle('hidden', Boolean(user)); el('signedInAccount').classList.toggle('hidden', !user); el('accountEmail').textContent = user?.email || '';
}

function authMessage(error) {
  const message = (error?.message || '').toLowerCase();
  if (message.includes('invalid login')) return 'E-mail ou senha inválidos.';
  if (message.includes('already registered')) return 'Este e-mail já possui uma conta.';
  if (message.includes('password')) return 'Use uma senha mais forte, com pelo menos 6 caracteres.';
  return navigator.onLine ? 'Não foi possível concluir. Verifique os dados e tente novamente.' : 'Sem conexão. Tente novamente quando estiver online.';
}

async function submitAuth(create = false) {
  if (!supabase) { showToast('A sincronização Supabase ainda não foi configurada.'); return; }
  const email = el('authEmail').value.trim(); const password = el('authPassword').value;
  if (!email || password.length < 6) { showToast('Informe um e-mail e uma senha com pelo menos 6 caracteres.'); return; }
  try { const { data, error } = create ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } }) : await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; el('authPassword').value = ''; if (create && !data.session) showToast('Confira seu e-mail para confirmar a conta.'); }
  catch (error) { el('authPassword').value = ''; showToast(authMessage(error), { persistent: true }); }
}

async function deleteCloudData() {
  if (!currentUser || prompt('Para excluir definitivamente todos os dados da nuvem, digite EXCLUIR:') !== 'EXCLUIR') return;
  try { setSyncStatus('saving', 'Excluindo dados…'); const { error } = await supabase.from('caminho_diario_records').delete().eq('user_id', currentUser.id); if (error) throw error; await clearScope(activeScope); state = createDefaultState(); refreshAll(); setSyncStatus('synced', 'Sincronizado'); showToast('Dados da nuvem e deste perfil foram excluídos.'); }
  catch (error) { handleSyncError(error); showToast('Não foi possível excluir os dados.', { persistent: true }); }
}

async function handleSession(session) {
  const user = session?.user || null;
  if (currentUser?.id === user?.id) return;
  stopCloudListeners(); currentUser = user; showAccount(user);
  if (!user) { await switchStorage(GUEST_SCOPE); setSyncStatus(navigator.onLine ? 'local' : 'offline', navigator.onLine ? 'Somente neste aparelho' : 'Offline · somente neste aparelho'); return; }
  await migrateLegacyStorage(`${APP_KEY}:${user.id}`, user.id);
  await claimGuestData(user.id);
  await switchStorage(user.id);
  try { await requestSync({ pull: true }); listenToCloud(); showToast('Conta conectada e sincronização ativa.'); }
  catch { showToast('Conta conectada, mas ainda há alterações pendentes.', { persistent: true }); }
}

async function initializeSupabase() {
  const configured = Boolean(createClient && supabaseConfig.url && supabaseConfig.publishableKey);
  el('supabaseSetupNote').classList.toggle('hidden', configured); el('signInBtn').disabled = !configured; el('signUpBtn').disabled = !configured;
  if (!configured) { setSyncStatus('local', 'Somente neste aparelho'); return; }
  try { supabase = createClient(supabaseConfig.url, supabaseConfig.publishableKey); supabase.auth.onAuthStateChange((_event, session) => setTimeout(() => handleSession(session).catch(handleSyncError), 0)); }
  catch (error) { handleSyncError(error); el('supabaseSetupNote').classList.remove('hidden'); }
}

async function importBackup(file) {
  try {
    const parsed = JSON.parse(await file.text()); const normalized = validateBackup(parsed.data || parsed);
    const mode = el('importMode').value;
    if (!confirm(mode === 'replace' ? 'Substituir os dados locais atuais pelos dados deste backup?' : 'Mesclar este backup, preservando a versão mais recente de cada registro?')) return;
    state = mode === 'replace' ? await replaceScope(activeScope, normalized) : await mergeScope(activeScope, normalized);
    requestSync(); refreshAll(); showToast('Backup importado e validado.');
  } catch (error) { showToast(`Backup inválido: ${error.message}`, { persistent: true }); }
  finally { el('importFile').value = ''; }
}

function exportData() {
  const backup = { format: 'jornada-com-cristo-backup', version: 2, exportedAt: nowIso(), data: state };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `caminho-diario-backup-${todayKey()}.json`; link.click(); URL.revokeObjectURL(link.href);
  localStorage.setItem('caminhoDiarioLastBackupAt', backup.exportedAt); updateBackupLabel(); showToast('Backup exportado.');
}

function updateBackupLabel() { const value = localStorage.getItem('caminhoDiarioLastBackupAt'); el('lastBackup').textContent = value ? `Último backup: ${new Date(value).toLocaleString('pt-BR')}` : 'Nenhum backup exportado neste aparelho.'; }

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloadingForUpdate) { reloadingForUpdate = true; location.reload(); } });
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      const offerUpdate = worker => { el('updateBar').classList.remove('hidden'); el('updateAppBtn').onclick = () => worker.postMessage({ type: 'SKIP_WAITING' }); };
      if (registration.waiting) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker); }); });
    } catch (error) { console.error('Falha ao registrar o service worker:', error?.message || 'erro sem detalhes'); }
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach(button => button.addEventListener('click', () => { if (button.dataset.view === 'daily') { editingDayKey = todayKey(); loadDayForm(); } navigate(button.dataset.view); }));
  document.querySelectorAll('.open-section').forEach(button => button.addEventListener('click', () => { if (button.dataset.target === 'daily') { editingDayKey = todayKey(); loadDayForm(); } navigate(button.dataset.target, button.dataset.focus); }));
  el('continueBtn').addEventListener('click', () => { editingDayKey = todayKey(); loadDayForm(); navigate('daily', el('continueBtn').dataset.focus); });
  el('saveDailyTop').addEventListener('click', () => saveDay()); el('saveDailyBottom').addEventListener('click', () => saveDay());
  [...DAY_TEXT_FIELDS, ...DAY_CHECK_FIELDS].forEach(id => el(id).addEventListener(id.startsWith('done') ? 'change' : 'input', autosaveDay));
  document.querySelectorAll('input[name="reviewStatus"]').forEach(input => input.addEventListener('change', autosaveDay));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autosaveDay.flush(); });
  el('addPrayer').addEventListener('click', addPrayer); el('prayerSearch').addEventListener('input', renderPrayers); el('prayerFilter').addEventListener('change', renderPrayers);
  el('historySearch').addEventListener('input', renderHistory); el('historyFrom').addEventListener('change', renderHistory); el('historyTo').addEventListener('change', renderHistory); el('historyType').addEventListener('change', renderHistory);
  el('saveWeekly').addEventListener('click', async () => { const data = {}; WEEK_TEXT_FIELDS.forEach(id => { data[id] = el(id).value; }); const payload = normalizeWeek(weekKey(), { ...data, week: weekKey(), savedAt: state.weeks[weekKey()]?.savedAt || nowIso(), updatedAt: nowIso() }); state.weeks[weekKey()] = await set(activeScope, RECORD_KINDS.WEEK, weekKey(), payload); requestSync(); showToast('Revisão semanal salva.'); });
  el('saveSettings').addEventListener('click', async () => { const payload = normalizeSettings({ name: el('userName').value, morningTime: el('morningTime').value, practiceTime: el('practiceTime').value, reviewTime: el('reviewTime').value, theme: el('themeMode').value, updatedAt: nowIso() }); state.settings = await set(activeScope, RECORD_KINDS.SETTINGS, 'profile', payload); requestSync(); loadSettings(); loadHeader(); showToast('Configurações salvas.'); });
  el('themeMode').addEventListener('change', () => { state.settings.theme = el('themeMode').value; applyTheme(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (state.settings.theme === 'system') applyTheme(); });
  el('exportBtn').addEventListener('click', exportData); el('importFile').addEventListener('change', event => { if (event.target.files[0]) importBackup(event.target.files[0]); }); el('printBtn').addEventListener('click', () => window.print());
  el('signInBtn').addEventListener('click', () => submitAuth(false)); el('signUpBtn').addEventListener('click', () => submitAuth(true)); el('signOutBtn').addEventListener('click', () => supabase?.auth.signOut({ scope: 'local' })); el('deleteCloudBtn').addEventListener('click', deleteCloudData);
  el('syncNowBtn').addEventListener('click', () => { if (!navigator.onLine) showToast('Você está offline. As alterações permanecem na fila.'); else requestSync({ pull: true }).then(() => showToast('Sincronização concluída.')).catch(() => {}); });
  window.addEventListener('online', () => { if (currentUser) requestSync({ pull: true }).catch(() => {}); else setSyncStatus('local', 'Somente neste aparelho'); }); window.addEventListener('offline', () => setSyncStatus('offline', currentUser ? 'Offline · alterações na fila' : 'Offline · somente neste aparelho'));
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredPrompt = event; el('installBtn').classList.remove('hidden'); });
  el('installBtn').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; el('installBtn').classList.add('hidden'); });
}

async function initializeApp() {
  bindEvents();
  try { await migrateLegacyStorage(APP_KEY, GUEST_SCOPE); state = await loadState(GUEST_SCOPE); }
  catch (error) { handleStorageError(error); try { state = validateBackup(JSON.parse(localStorage.getItem(APP_KEY) || '{}')); } catch { state = createDefaultState(); } }
  loadHeader(); loadSettings(); loadDayForm(); renderDashboard(); renderPrayers(); renderHistory(); renderWeekly(); updateBackupLabel(); if (!navigator.onLine) setSyncStatus('offline', 'Offline · somente neste aparelho'); setupServiceWorker(); await initializeSupabase(); document.documentElement.dataset.appReady = 'true';
}

initializeApp().catch(error => { handleStorageError(error); setSyncStatus('error', 'Falha ao iniciar'); });
