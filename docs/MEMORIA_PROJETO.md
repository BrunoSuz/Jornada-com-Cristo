# Memória do projeto — Caminho Diário

Última atualização: 2026-07-20

## Ponto de retomada

O projeto é uma PWA estática, em HTML/CSS/JavaScript puro, voltada a uma rotina espiritual pessoal. A versão atual está no meio de uma migração não commitada de Firebase para Supabase. As lacunas locais de exclusão offline e carregamento offline do SDK foram corrigidas em 2026-07-20; não tratar a migração como concluída até validar o backend real em duas sessões/dispositivos.

Branch atual: `main`.

Últimos commits:

- `23010d1` — migração da sincronização para Supabase, correções offline e agente de memória (preparado para publicação em 2026-07-20).
- `956a343` — sincronização offline com Firebase.
- `82a11ff` — preparação da PWA para GitHub Pages.

## Estado funcional conhecido

- Dashboard diário com cinco etapas.
- Devocional, EBD, leitura bíblica, aplicação prática e revisão noturna.
- Lista de oração, histórico e revisão semanal.
- Configurações, modo escuro e exportação de backup JSON.
- Persistência local por `localStorage`.
- Autenticação por e-mail/senha e sincronização Supabase implementadas no código.
- Migração dos registros locais ao primeiro login e resolução de conflitos pelo registro mais recente.
- Deploy do GitHub Pages publica diretamente `caminho-diario/`.

## Migração consolidada em 2026-07-20

- Migração registrada no commit `23010d1`.
- Modificados: `caminho-diario/README.md`, `app.js`, `index.html` e `service-worker.js`.
- Removidos: `caminho-diario/firebase-config.js`, `firebase.json` e `firestore.rules`.
- Adicionados: `caminho-diario/supabase-config.js`, `supabase.sql`, `AGENTS.md`, agente customizado e esta memória.
- O `package-lock.json` órfão foi removido; o projeto continua intencionalmente sem etapa de build.

## Implementado em 2026-07-20

- Estado local agora contém uma fila persistente `deletions`, separada por armazenamento de usuário.
- Exclusões de orações feitas offline são processadas antes de baixar e mesclar registros remotos, impedindo a ressurreição do item.
- O SDK Supabase foi fixado na versão `2.110.7` e trocado para o bundle UMD único.
- O bundle UMD entrou no pré-cache `caminho-diario-v5`, evitando dependências ESM secundárias fora do cache.
- README atualizado para documentar a fila de exclusões e o comportamento offline.

## Validações já executadas

Em 2026-07-20:

- `node --check caminho-diario/app.js` — passou.
- `node --check caminho-diario/service-worker.js` — passou.
- `node --check caminho-diario/supabase-config.js` — passou.
- `git diff --check` — passou.
- Assets declarados no manifest/cache foram encontrados.
- Servidor HTTP local na porta `8765` entregou `index.html`, `app.js` e `service-worker.js` corretamente.
- O bundle UMD fixado respondeu com HTTP 200, CORS liberado e cache imutável no CDN.
- Consulta real anônima ao Supabase, repetida após atualizar a chave pública, retornou HTTP 200 e zero registros visíveis; endpoint, tabela e bloqueio de leitura anônima por RLS estão operacionais.
- Login pelo aplicativo servido localmente em `http://localhost:8081` foi confirmado pelo usuário em 2026-07-20.
- Teste offline manual aprovado pelo usuário em 2026-07-20: aplicação abriu sem rede, alterações permaneceram localmente, exclusão offline não reapareceu e a sincronização concluiu após reconectar.
- Não há suíte automatizada, lint ou build configurados.

## Riscos e pendências prioritárias

1. Falta concluir o isolamento RLS entre dois usuários, realtime em duas sessões e conflito de edição. Login, uso offline, persistência da fila, exclusão offline e reconexão já passaram.
2. O backup só exporta; ainda não existe restauração/importação.
3. A chave configurada no navegador é pública (`anon`/`publishable`) por design. A proteção depende das políticas RLS; nunca usar `service_role` no cliente.

## Próximo passo recomendado

Testar duas contas/sessões para isolamento RLS e realtime. Se passar, consolidar a migração em um commit e publicar; depois priorizar importação/restauração de backup e testes automatizados.

## Protocolo de atualização

Ao terminar uma tarefa material, atualizar este arquivo com:

- data e resumo do que mudou;
- arquivos principais afetados;
- comandos/testes executados e resultados;
- decisões tomadas;
- riscos ou pendências restantes;
- próximo passo recomendado.

Não armazenar segredos neste documento.
