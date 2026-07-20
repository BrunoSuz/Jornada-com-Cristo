import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDay, normalizePrayer, normalizeSettings, validateBackup } from '../caminho-diario/js/validation.js';
import { chooseNewest, nextRetryDelay, operationKey, shouldApplyRealtime } from '../caminho-diario/js/sync-engine.js';
import { isoWeekKey, localDateKey } from '../caminho-diario/js/utils.js';

test('normaliza e limita payload diário', () => {
  const day = normalizeDay('2026-07-20', { devotionalText: '  João 1  ', reviewStatus: 'invalido', doneBible: 1 });
  assert.equal(day.devotionalText, 'João 1');
  assert.equal(day.reviewStatus, '');
  assert.equal(day.doneBible, true);
});

test('normaliza oração legada sem perder status', () => {
  const prayer = normalizePrayer('abc', { name: 'Ana', reason: 'Saúde', done: true, category: 'Enfermos' });
  assert.equal(prayer.status, 'answered');
  assert.equal(prayer.done, true);
});

test('migra preferência booleana de tema', () => {
  assert.equal(normalizeSettings({ darkMode: true }).theme, 'dark');
  assert.equal(normalizeSettings({}).theme, 'system');
});

test('valida e remove orações duplicadas do backup', () => {
  const backup = validateBackup({ prayers: [{ id: '1', name: 'A' }, { id: '1', name: 'B' }] });
  assert.equal(backup.prayers.length, 1);
});

test('resolução de conflito escolhe versão mais recente', () => {
  const local = { updatedAt: '2026-07-20T10:00:00.000Z', value: 'local' };
  const remote = { updatedAt: '2026-07-20T11:00:00.000Z', value: 'remote' };
  assert.equal(chooseNewest(local, remote).value, 'remote');
  assert.equal(chooseNewest({ ...local, updatedAt: remote.updatedAt }, remote, true).value, 'local');
});

test('Realtime não sobrescreve operação local pendente', () => {
  const local = { updatedAt: '2026-07-20T11:00:00.000Z' };
  const remote = { updatedAt: '2026-07-20T12:00:00.000Z' };
  assert.equal(shouldApplyRealtime(local, remote, { type: 'upsert' }), false);
  assert.equal(shouldApplyRealtime(local, remote, null), true);
});

test('outbox é idempotente por escopo, tipo e id', () => {
  assert.equal(operationKey('user', 'day', '2026-07-20'), 'user:day:2026-07-20');
});

test('backoff cresce e possui teto', () => {
  assert.equal(nextRetryDelay(0), 500);
  assert.equal(nextRetryDelay(3), 4000);
  assert.equal(nextRetryDelay(20), 30000);
});

test('datas locais e semana ISO são estáveis', () => {
  const date = new Date(2026, 6, 20, 23, 30);
  assert.equal(localDateKey(date), '2026-07-20');
  assert.match(isoWeekKey(date), /^2026-W\d{2}$/);
});
