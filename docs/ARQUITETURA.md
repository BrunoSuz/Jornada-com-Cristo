# Arquitetura

## Visão geral

Jornada com Cristo é uma PWA estática sem framework e sem etapa de build. O GitHub Pages publica diretamente `caminho-diario/`. HTML e CSS formam a interface; módulos ES nativos separam domínio, validação, armazenamento e sincronização.

## Módulos

- `app.js`: composição da interface, autenticação e orquestração dos casos de uso.
- `js/constants.js`: kinds, campos, limites, categorias e estado padrão.
- `js/validation.js`: normalização e validação por kind e de backups.
- `js/storage.js`: IndexedDB, migração legada, registros, outbox e metadados.
- `js/sync-engine.js`: funções puras de conflito, versão, Realtime e backoff.
- `js/utils.js`: datas locais/ISO, bytes, debounce e espera.
- `service-worker.js`: shell offline e ciclo controlado de atualização.
- `supabase-config.js`: somente Project URL e chave pública publishable/anon.

## Fluxo de dados

```text
Formulário → validação → IndexedDB → outbox → Supabase
                              ↑          ↓
                         interface ← merge/Realtime
```

O estado em memória acelera a renderização, mas IndexedDB é a fonte local durável. `localStorage` fica restrito ao backup legado preservado, dono da migração, data do último backup e armazenamento interno de sessão do SDK Supabase.

## Stores IndexedDB

- `records`: chave `scope:kind:id`, payload normalizado e revisão sincronizada.
- `outbox`: uma operação idempotente por `scope:kind:id`; novo upsert/delete substitui a operação anterior do mesmo registro.
- `meta`: marcadores de migração e proprietário dos dados anônimos.

`scope` é `guest` sem login ou o UUID obtido diretamente da sessão autenticada.

## Compatibilidade

- Não há caminhos absolutos de aplicação.
- O mesmo código funciona em `/Jornada-com-Cristo/` e em servidor local.
- O formato remoto e a chave primária composta foram preservados.
- Campos novos são opcionais e normalizadores aceitam payloads legados.
