# Caminho Diário — Jornada com Cristo

PWA cristã offline-first para organizar devocional, EBD, leitura bíblica, aplicação prática, oração e revisões pessoais. Foi desenhada para tablet Android, celular e desktop e é publicada no GitHub Pages.

Aplicação: <https://brunosuz.github.io/Jornada-com-Cristo/>

## Funcionalidades

- Painel com saudação, data, progresso, próxima etapa, prática e pessoas para oração.
- Registro diário com autosave de devocional, EBD, leitura, aplicação e revisão noturna.
- EBD com referência principal, tema semanal, tópicos, dúvidas, plano por dias e resumos.
- Leitura bíblica por referência e anotações do usuário, sem texto bíblico incorporado.
- Orações com categorias, busca, status, resposta, arquivamento e desfazer exclusão.
- Revisão semanal e resumo automático dos últimos registros.
- Histórico com busca, período, tipo, edição/exclusão, impressão/PDF.
- Backup JSON, importação validada por mesclagem ou substituição.
- Tema claro, escuro ou conforme o sistema.
- IndexedDB, fila offline, retry, tombstones, Realtime e Supabase Auth.
- Instalação PWA e atualização controlada pelo usuário.

## Arquitetura

A aplicação é HTML/CSS/JavaScript nativo, sem build ou framework. IndexedDB guarda registros/outbox; Supabase mantém a cópia remota isolada por RLS. Consulte:

- [`docs/ARQUITETURA.md`](../docs/ARQUITETURA.md)
- [`docs/SINCRONIZACAO.md`](../docs/SINCRONIZACAO.md)
- [`docs/PWA.md`](../docs/PWA.md)
- [`docs/SUPABASE.md`](../docs/SUPABASE.md)

## Executar localmente

Na pasta `caminho-diario`:

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`. Se a porta estiver ocupada, use outra, por exemplo `python3 -m http.server 8081`, e adicione essa URL às Redirect URLs do Supabase.

Na raiz do repositório:

```bash
npm test
npm run check
```

## Configurar Supabase

1. Crie ou selecione o projeto.
2. Execute `supabase.sql` no SQL Editor; a migration pode ser repetida.
3. Copie Project URL e chave pública publishable/anon para `supabase-config.js`.
4. Nunca use `service_role`, `sb_secret_*` ou senha de banco no navegador.
5. Configure Site URL e Redirect URLs conforme `docs/SUPABASE.md`.
6. Teste duas contas e duas sessões com `docs/TESTES-MANUAIS.md`.

A tabela permanece `public.caminho_diario_records`, com chave `(user_id, kind, record_id)`, JSONB validado, RLS, índice por usuário/data, replica identity full e publicação Realtime.

## Offline e backup

Após o primeiro carregamento online e a ativação do service worker, a interface inicia offline. Toda mudança vai primeiro para IndexedDB e depois para uma outbox idempotente. Ao reconectar, a fila usa retry com backoff e conflito last-write-wins.

Exporte backup JSON periodicamente. A importação valida e normaliza o arquivo antes de alterar dados. O backup legado em `localStorage` é preservado durante a migração para IndexedDB.

## Publicar no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` publica `caminho-diario/` quando mudanças chegam a `main`:

```bash
git push origin improvement/auditoria-geral
# após revisão/merge da branch:
git switch main
git merge --no-ff improvement/auditoria-geral
git push origin main
```

Todos os caminhos são relativos para funcionar em `/Jornada-com-Cristo/`.

## Instalar e atualizar no Android

Abra a URL HTTPS no Chrome e use **Instalar app** ou **Adicionar à tela inicial**. Quando uma nova versão estiver pronta, o app mostra **Atualizar aplicativo**; a ativação só ocorre após essa ação.

## Segurança e privacidade

- Senhas não são gravadas pela aplicação.
- A sessão é administrada pelo SDK Supabase.
- Logout encerra apenas a sessão local e não apaga dados remotos.
- O service worker nunca cacheia respostas Auth/REST/Realtime.
- `user_id` sempre vem da sessão autenticada.
- Conteúdo do usuário é renderizado por `textContent`, sem HTML dinâmico.

## Limitações conhecidas

- LWW depende do relógio dos dispositivos.
- Reautenticação por senha antes da exclusão total ainda não existe; é exigida confirmação digitada.
- Testes automatizados de IndexedDB/browser completo usam roteiro headless/manual; os testes Node cobrem funções puras.
- A entrega de e-mail padrão do Supabase tem limites; produção deve usar SMTP próprio.
