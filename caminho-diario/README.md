# Caminho Diário

MVP de PWA para rotina espiritual pessoal, pensado para tablet Android.

## Recursos
- Painel diário com cinco etapas
- Devocional
- Estudo da EBD
- Leitura bíblica e próxima leitura
- Aplicação prática diária
- Lista de oração
- Revisão noturna
- Revisão semanal
- Histórico
- Backup JSON
- Modo escuro
- Funcionamento offline após o primeiro carregamento
- Login com e-mail e senha
- Sincronização entre computador e tablet com Supabase
- Migração automática dos registros locais ao entrar pela primeira vez
- Indicador de estado: sincronizado, salvando ou offline
- Fila persistente para concluir exclusões feitas offline após a reconexão
- Isolamento dos registros por conta com Row Level Security (RLS)

## Como testar no computador
O service worker exige HTTP/HTTPS. Na pasta `caminho-diario`, execute:

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

## Configurar a sincronização Supabase

1. Crie um projeto em `supabase.com`.
2. Abra **SQL Editor**, cole o conteúdo de `../supabase.sql` e execute.
3. Em **Project Settings → API**, copie a URL e a chave pública `publishable` (ou `anon`).
4. Preencha esses dois valores em `caminho-diario/supabase-config.js`. Nunca use a chave `service_role` no navegador.
5. Em **Authentication → URL Configuration**, informe a URL publicada do aplicativo.
6. Publique novamente a aplicação. No GitHub Pages, um push para `main` inicia o workflow automaticamente.

Ao entrar pela primeira vez, os registros já existentes no navegador são associados à primeira conta usada e enviados ao Supabase. Depois disso, use a mesma conta nos demais dispositivos. Os registros continuam locais sem conexão e são reconciliados quando o aplicativo voltar a ficar online; em conflitos, prevalece a alteração mais recente. Exclusões realizadas offline entram em uma fila local e são enviadas antes da próxima reconciliação.

O módulo do Supabase usa uma versão fixa e entra no pré-cache do service worker. Por isso, após o primeiro carregamento online bem-sucedido, a interface também pode iniciar sem conexão.

As políticas RLS usam o usuário autenticado e recusam acesso entre contas. A tabela também limita tipos de registro, tamanho dos identificadores e tamanho do conteúdo JSON.

## Publicação no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` publica esta pasta a cada envio para a branch `main`. No GitHub, selecione **Settings → Pages → Source: GitHub Actions**.

## Como usar no Xiaomi Pad
Hospede os arquivos em um serviço HTTPS (GitHub Pages, Netlify ou servidor próprio), abra o endereço no Chrome e selecione **Adicionar à tela inicial** ou **Instalar app**.

## Privacidade
Sem login, os dados ficam somente no armazenamento local do navegador. Com login, uma cópia persistente também permanece no aparelho para funcionamento offline e os registros são sincronizados com a conta Supabase. Use o botão **Exportar backup** periodicamente.
