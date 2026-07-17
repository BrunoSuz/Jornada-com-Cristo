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
- Sincronização entre computador e tablet com Cloud Firestore
- Migração automática dos registros locais ao entrar pela primeira vez
- Indicador de estado: sincronizado, salvando ou offline
- Isolamento dos registros por conta com regras do Firestore

## Como testar no computador
O service worker exige HTTP/HTTPS. Na pasta `caminho-diario`, execute:

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

## Configurar a sincronização Firebase

1. Crie ou selecione um projeto Firebase e registre um aplicativo Web.
2. Ative **Authentication → Sign-in method → E-mail/senha**.
3. Crie um banco **Cloud Firestore**. A implementação usa operações Core e funciona com persistência offline nas edições Standard e Enterprise.
4. Copie a configuração pública do aplicativo Web para `caminho-diario/firebase-config.js`. Nunca coloque uma conta de serviço, chave privada ou token administrativo nesse arquivo.
5. Revise e publique as regras versionadas neste repositório:

```bash
npx -y firebase-tools@latest deploy --only firestore:rules --project SEU_PROJECT_ID
```

6. Publique novamente a aplicação. No GitHub Pages, um push para `main` inicia o workflow automaticamente.

Ao entrar pela primeira vez, os registros já existentes no navegador são associados à primeira conta usada e enviados ao Firestore. Depois disso, use a mesma conta nos demais dispositivos. Alterações offline ficam na fila; quando dois dispositivos modificam o mesmo documento, prevalece a última gravação confirmada pelo Firestore.

As regras usam o UID autenticado no caminho `users/{uid}` e recusam acesso entre contas. Elas também validam campos, tipos e limites de tamanho. Trate-as como um protótipo de segurança e revise-as antes de compartilhar o aplicativo amplamente.

## Publicação no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` publica esta pasta a cada envio para a branch `main`. No GitHub, selecione **Settings → Pages → Source: GitHub Actions**.

## Como usar no Xiaomi Pad
Hospede os arquivos em um serviço HTTPS (GitHub Pages, Netlify ou servidor próprio), abra o endereço no Chrome e selecione **Adicionar à tela inicial** ou **Instalar app**.

## Privacidade
Sem login, os dados ficam somente no armazenamento local do navegador. Com login, uma cópia persistente também permanece no aparelho para funcionamento offline e os registros são sincronizados com a conta Firebase. Use o botão **Exportar backup** periodicamente.
