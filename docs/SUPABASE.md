# Supabase

## Configuração pública e privada

Pode ficar no frontend:

- Project URL (`https://<project-ref>.supabase.co`);
- chave `publishable` ou chave legada `anon`.

Nunca pode ficar no frontend, repositório, backup ou logs:

- `service_role`;
- `sb_secret_*`;
- senha do banco;
- access/refresh tokens;
- credenciais SMTP.

O arquivo público é `caminho-diario/supabase-config.js`. A proteção dos dados depende do RLS, não do sigilo da chave publishable.

## Aplicar a migration

1. Abra **SQL Editor** no projeto Supabase.
2. Execute `supabase.sql`.
3. A migration é idempotente: mantém a tabela/dados, recria políticas, adiciona constraints nomeadas, índice e publicação Realtime quando necessário.
4. Se a validação de uma constraint falhar, não remova dados. Inspecione as linhas apontadas, faça backup e normalize-as antes de repetir.

## Modelo

Chave primária: `(user_id, kind, record_id)`.

Kinds:

- `day`: registro diário; `record_id` no formato `AAAA-MM-DD`.
- `prayer`: pedido de oração; `record_id` UUID gerado no cliente.
- `week`: revisão semanal; `record_id` no formato `AAAA-WNN`.
- `settings`: preferências; `record_id = profile`.

Todo payload contém `updatedAt` ISO. `updated_at` remoto replica a revisão da edição para preservar a ordem de alterações feitas offline.

## Segurança e RLS

Há políticas separadas de SELECT, INSERT, UPDATE e DELETE para `authenticated`, sempre comparando `auth.uid()` com `user_id`. O papel `anon` não recebe privilégios. O cliente sempre constrói `user_id` com `currentUser.id` da sessão; não existe campo editável para ele.

## Realtime

- A tabela deve estar em `supabase_realtime`.
- `replica identity full` permite identificar DELETE.
- O cliente filtra o canal pelo usuário.
- Eventos não substituem uma operação local pendente.

## Auth URLs

Configure em Authentication → URL Configuration:

- Site URL: `https://brunosuz.github.io/Jornada-com-Cristo/`
- Redirect URL publicada: `https://brunosuz.github.io/Jornada-com-Cristo/**`
- Desenvolvimento: `http://localhost:8080/**` e a porta local usada no teste.
