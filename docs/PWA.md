# PWA e GitHub Pages

## Base path

Manifest, worker, imports e assets usam caminhos relativos. Não adicionar URLs como `/app.js`, pois apontariam para a raiz de `brunosuz.github.io` e quebrariam o subdiretório `/Jornada-com-Cristo/`.

## Cache

O cache `caminho-diario-v6` contém o shell local e tenta guardar o bundle público e versionado do SDK. Falha do CDN não impede instalar o shell. Chamadas Supabase Auth/REST/Realtime nunca são interceptadas nem cacheadas.

Navegações usam network-first com fallback para `index.html`. Assets locais e o SDK público usam cache-first. Na ativação, somente caches com prefixo do aplicativo são limpos.

## Atualização

1. Um novo service worker instala sem assumir a página imediatamente.
2. A interface mostra “Uma nova versão está pronta”.
3. O usuário toca em **Atualizar aplicativo**.
4. A página envia `SKIP_WAITING` ao worker.
5. Após `controllerchange`, ocorre um único reload controlado.

## Instalação Android/Xiaomi Pad

1. Abra a URL HTTPS no Chrome.
2. Aguarde o primeiro carregamento e a sincronização.
3. Use **Instalar app** ou menu → **Adicionar à tela inicial**.
4. Abra a instalação uma vez online para confirmar o cache.

## Validação offline

Após o worker aparecer como `activated` em DevTools → Application, recarregue uma vez online. Em seguida, use Network → Offline e recarregue normalmente. Não use “Empty cache and hard reload”, que deliberadamente ignora caches.
