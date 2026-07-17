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

## Como testar no computador
O service worker exige HTTP/HTTPS. Na pasta `caminho-diario`, execute:

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

## Publicação no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` publica esta pasta a cada envio para a branch `main`. No GitHub, selecione **Settings → Pages → Source: GitHub Actions**.

## Como usar no Xiaomi Pad
Hospede os arquivos em um serviço HTTPS (GitHub Pages, Netlify ou servidor próprio), abra o endereço no Chrome e selecione **Adicionar à tela inicial** ou **Instalar app**.

## Privacidade
Os dados ficam no armazenamento local do navegador. Use o botão **Exportar backup** periodicamente.
