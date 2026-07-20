# Auditoria técnica — Jornada com Cristo

Data: 2026-07-20  
Branch: `improvement/auditoria-geral`  
Checkpoint anterior às alterações: `b72f600`

## Escopo e método

Foram inspecionados integralmente HTML, CSS, JavaScript, manifest, service worker, configuração pública do Supabase, SQL, workflow do GitHub Pages e documentação. Também foram executadas verificações de sintaxe JavaScript, validade do manifest, integridade do diff, presença dos assets e busca por credenciais privadas.

O modelo genérico `user_id + kind + record_id + payload` é suficiente para o porte atual e não justifica migração para várias tabelas. Ele deve ser mantido com validação por tipo, constantes centralizadas, fila local robusta e documentação dos payloads.

## Crítico

Nenhum segredo `service_role` ou chave privada foi encontrado. Nenhum defeito crítico comprovadamente destrutivo foi observado no estado auditado. Os itens de prioridade alta abaixo, entretanto, podem causar perda lógica ou reaparecimento de dados em concorrência e devem ser corrigidos antes de ampliar funcionalidades.

## Alto

### A1. Realtime sobrescreve alterações locais mais recentes

- **Problema:** eventos do Realtime substituem o estado local sem comparar `updated_at` com a versão local e sem considerar operações pendentes.
- **Impacto:** uma edição offline ou ainda não enviada pode ser perdida quando chega um evento atrasado de outra sessão.
- **Causa provável:** `listenToCloud()` aplica todo evento recebido diretamente ao estado.
- **Correção recomendada:** centralizar merge por versão, ignorar eco/evento obsoleto, preservar registro local pendente e serializar sincronizações.
- **Arquivos envolvidos:** `caminho-diario/app.js`.

### A2. Falhas parciais podem terminar com status “Sincronizado”

- **Problema:** `syncRecord()` captura o erro visualmente, mas não lança a falha; `mergeAndMigrate()` continua e pode finalizar como sucesso.
- **Impacto:** o usuário acredita que os dados chegaram à nuvem quando algumas gravações falharam.
- **Causa provável:** tratamento de erro distribuído e ausência de resultado estruturado da fila.
- **Correção recomendada:** fila durável, exceções propagadas, resultado por operação, retry com backoff e estado visual derivado de pendências reais.
- **Arquivos envolvidos:** `caminho-diario/app.js`.

### A3. Persistência principal em `localStorage`

- **Problema:** todo o conjunto de registros é serializado sincronamente em uma única chave.
- **Impacto:** risco de quota, travamento da interface, corrupção lógica de todo o estado e baixa escalabilidade do histórico.
- **Causa provável:** arquitetura inicial de MVP.
- **Correção recomendada:** camada IndexedDB com stores para registros, operações de sync e metadados; migração automática e não destrutiva do formato legado.
- **Arquivos envolvidos:** `caminho-diario/app.js`; novos módulos de armazenamento.

### A4. Fila cobre exclusões, mas não criação/edição explicitamente

- **Problema:** criações e edições offline dependem de uma varredura futura do estado, sem operação durável individual, tentativas ou diagnóstico.
- **Impacto:** falhas parciais não são rastreáveis; reconexões concorrentes podem duplicar trabalho ou mascarar pendências.
- **Causa provável:** sincronização baseada em merge integral.
- **Correção recomendada:** outbox idempotente para `upsert` e `delete`, chave por `kind + record_id`, retry exponencial e processamento serial.
- **Arquivos envolvidos:** `caminho-diario/app.js`; novos `storage.js` e `sync.js`.

### A5. Ausência de validação forte de payload no cliente

- **Problema:** normalizadores aceitam strings sem limites e datas sem validação; importações futuras poderiam persistir estruturas inválidas.
- **Impacto:** payload inconsistente, erros de UI, rejeição tardia pelo banco e consumo excessivo de armazenamento.
- **Causa provável:** validação limitada a campos obrigatórios da interface.
- **Correção recomendada:** schemas por `kind`, limites iguais ou mais restritos que o SQL, enumerações e sanitização estrutural.
- **Arquivos envolvidos:** `caminho-diario/app.js`, `supabase.sql`; novo `validation.js`.

### A6. Atualização do service worker não é segura nem visível

- **Problema:** `skipWaiting()` ativa imediatamente uma versão nova e não existe aviso ou botão de atualização.
- **Impacto:** páginas abertas podem misturar HTML/JS/cache de versões diferentes e o usuário não sabe que há atualização.
- **Causa provável:** estratégia simples de cache-first do MVP.
- **Correção recomendada:** worker em espera, mensagem `SKIP_WAITING`, detecção de `updatefound`, aviso persistente e reload controlado em `controllerchange`.
- **Arquivos envolvidos:** `caminho-diario/service-worker.js`, `caminho-diario/app.js`, `caminho-diario/index.html`.

## Médio

### M1. Dependência remota é ponto único da instalação offline

- **Problema:** o bundle Supabase hospedado no jsDelivr faz parte de `cache.addAll()`.
- **Impacto:** indisponibilidade do CDN durante a instalação impede instalar o service worker inteiro.
- **Causa provável:** ausência de build e de bundle local versionado.
- **Correção recomendada:** separar cache local obrigatório do recurso remoto opcional; documentar limitação ou versionar o bundle local em etapa futura.
- **Arquivos envolvidos:** `caminho-diario/service-worker.js`, `caminho-diario/index.html`.

### M2. Política LWW depende do relógio do dispositivo

- **Problema:** `updated_at` é enviado pelo cliente e pode estar adiantado ou atrasado.
- **Impacto:** um dispositivo com relógio incorreto pode vencer conflitos indefinidamente.
- **Causa provável:** necessidade de preservar edições offline sem campo separado para tempo lógico.
- **Correção recomendada:** documentar a política, validar datas razoáveis e futuramente considerar versão lógica/dispositivo; não substituir silenciosamente pelo relógio do servidor, pois isso quebraria ordenação offline.
- **Arquivos envolvidos:** `caminho-diario/app.js`, `supabase.sql`, documentação.

### M3. Sincronizações podem rodar simultaneamente

- **Problema:** login, evento `online`, botão manual e eventos Realtime podem iniciar merges concorrentes.
- **Impacto:** renders repetidos, status incorreto e condições de corrida.
- **Causa provável:** ausência de mutex/promessa compartilhada.
- **Correção recomendada:** serializar o pipeline e coalescer chamadas.
- **Arquivos envolvidos:** `caminho-diario/app.js`; novo `sync.js`.

### M4. Uso de `innerHTML` amplia a superfície de XSS

- **Problema:** conteúdo dinâmico de orações e histórico é interpolado em HTML.
- **Impacto:** o escape atual reduz o risco, mas qualquer novo campo esquecido reabre a vulnerabilidade.
- **Causa provável:** renderização compacta por template string.
- **Correção recomendada:** construir nós com `textContent` e helpers DOM; reservar `innerHTML` apenas para conteúdo estático controlado.
- **Arquivos envolvidos:** `caminho-diario/app.js`.

### M5. Não há proteção contra perda de texto nem autosave

- **Problema:** formulários só persistem ao pressionar salvar.
- **Impacto:** navegação, fechamento da PWA ou atualização pode perder uma reflexão longa.
- **Causa provável:** fluxo manual do MVP.
- **Correção recomendada:** autosave com debounce, indicação “rascunho salvo” e flush em `visibilitychange`.
- **Arquivos envolvidos:** `caminho-diario/app.js`, `caminho-diario/index.html`.

### M6. Exclusão de oração não confirma nem permite desfazer

- **Problema:** um toque remove imediatamente o pedido e agenda exclusão remota.
- **Impacto:** exclusão acidental em tablet.
- **Causa provável:** ação direta sem estado transitório.
- **Correção recomendada:** confirmação acessível e janela curta de desfazer antes de consolidar a operação.
- **Arquivos envolvidos:** `caminho-diario/app.js`, `caminho-diario/index.html`.

### M7. Histórico é somente leitura e sem ferramentas

- **Problema:** não há busca, filtros, visualização completa, edição, exclusão ou importação.
- **Impacto:** histórico perde utilidade à medida que cresce; backup não pode ser restaurado.
- **Causa provável:** escopo inicial reduzido.
- **Correção recomendada:** busca/filtros, abrir registro para edição, exclusão segura, importação validada com mesclar/substituir e data do último backup.
- **Arquivos envolvidos:** `caminho-diario/index.html`, `caminho-diario/app.js`; módulos de histórico/backup.

### M8. Modo de tema não contempla preferência do sistema

- **Problema:** há apenas checkbox claro/escuro.
- **Impacto:** experiência inconsistente com Android e mudança automática do sistema.
- **Causa provável:** configuração booleana legada.
- **Correção recomendada:** enum `system | light | dark`, com migração do booleano anterior.
- **Arquivos envolvidos:** `caminho-diario/index.html`, `caminho-diario/styles.css`, armazenamento/configuração.

### M9. Acessibilidade da navegação e feedback incompleta

- **Problema:** navegação não expõe `aria-current`/`aria-controls`, anel de progresso não anuncia valor, foco não é movido ao trocar de seção e mensagens temporárias podem desaparecer rápido.
- **Impacto:** leitores de tela e navegação por teclado têm contexto reduzido.
- **Causa provável:** semântica visual sem gerenciamento de foco.
- **Correção recomendada:** estados ARIA, headings focáveis, live regions adequadas, foco controlado e mensagens persistentes para erros.
- **Arquivos envolvidos:** `caminho-diario/index.html`, `caminho-diario/app.js`.

### M10. Movimento não respeita preferência do usuário

- **Problema:** scroll suave, animação de views e transições sempre ativos.
- **Impacto:** desconforto para pessoas sensíveis a movimento.
- **Causa provável:** ausência de media query.
- **Correção recomendada:** `prefers-reduced-motion: reduce` desativando animações e scroll suave.
- **Arquivos envolvidos:** `caminho-diario/styles.css`, `caminho-diario/app.js`.

### M11. Modelo de oração é limitado

- **Problema:** `done` mistura resposta e arquivamento; faltam texto da resposta, busca, filtros e prevenção de duplicidade.
- **Impacto:** baixa rastreabilidade da jornada de oração.
- **Causa provável:** modelo mínimo do MVP.
- **Correção recomendada:** campos opcionais compatíveis (`status`, `answeredAt`, `answer`, `archivedAt`), normalização legada e filtros.
- **Arquivos envolvidos:** validação, UI de oração e documentação de schemas.

### M12. EBD e leitura bíblica não cobrem o fluxo semanal/progresso solicitado

- **Problema:** campos atuais são básicos e ficam embutidos apenas no registro diário.
- **Impacto:** não há divisão por dias, dúvidas, revisão de sábado, resumo de domingo ou progresso bíblico consolidado.
- **Causa provável:** funcionalidades ainda em estágio MVP.
- **Correção recomendada:** evolução incremental do payload diário, sem texto bíblico no repositório, seguida de visualizações de histórico/progresso.
- **Arquivos envolvidos:** UI diária, schemas, histórico e documentação.

### M13. Exclusão total da nuvem não exige reautenticação

- **Problema:** confirmação nativa é a única barreira para ação irreversível.
- **Impacto:** sessão deixada aberta permite exclusão total por terceiro com acesso ao aparelho.
- **Causa provável:** simplicidade do MVP.
- **Correção recomendada:** confirmação digitada e orientação para backup; reautenticação pode ser adicionada quando houver fluxo próprio.
- **Arquivos envolvidos:** `caminho-diario/app.js`, UI de configurações.

### M14. SQL não documenta schemas de payload nem valida coerência temporal

- **Problema:** banco restringe tipo geral e tamanho, mas não exige campos mínimos por `kind` nem alinha `updated_at` ao payload.
- **Impacto:** clientes defeituosos podem gravar JSON incompatível.
- **Causa provável:** tabela genérica deliberadamente flexível.
- **Correção recomendada:** constraints idempotentes para shape mínimo, índice por usuário/data, comentários SQL e função/trigger de validação cuidadosamente compatível com dados existentes.
- **Arquivos envolvidos:** `supabase.sql`.

## Baixo

### B1. Nome do produto diverge entre repositório e interface

- **Problema:** repositório usa “Jornada com Cristo”; manifest/interface usam “Caminho Diário”.
- **Impacto:** identidade e instalação podem confundir o usuário.
- **Causa provável:** renomeação não consolidada.
- **Correção recomendada:** decidir o nome canônico antes de alterar manifest e dados instalados.
- **Arquivos envolvidos:** HTML, manifest, README, documentação e possivelmente ícones.

### B2. Renderizações integrais e listeners pouco granulares

- **Problema:** `refreshAll()` redesenha várias áreas a cada evento; handlers ficam concentrados num arquivo grande.
- **Impacto:** custo crescente e manutenção difícil, embora pequeno no volume atual.
- **Causa provável:** arquitetura monolítica.
- **Correção recomendada:** módulos por responsabilidade e renders direcionados, sem framework pesado.
- **Arquivos envolvidos:** `caminho-diario/app.js`.

### B3. Barra inferior pode ocupar muita altura em telas estreitas/paisagem

- **Problema:** seis destinos viram duas linhas abaixo de 780 px.
- **Impacto:** reduz área útil com teclado virtual ou orientação paisagem.
- **Causa provável:** navegação fixa em grade.
- **Correção recomendada:** safe areas, rolagem horizontal ou layout compacto por breakpoint/altura.
- **Arquivos envolvidos:** `caminho-diario/styles.css`.

### B4. Exportação PDF não existe

- **Problema:** apenas JSON está disponível.
- **Impacto:** ausência de formato legível para impressão/arquivo pessoal.
- **Causa provável:** evitar dependência pesada.
- **Correção recomendada:** folha de impressão e `window.print()` como PDF sem biblioteca adicional.
- **Arquivos envolvidos:** histórico, CSS de impressão e backup.

### B5. Workflow usa ações com aviso de runtime Node antigo

- **Problema:** a execução atual emite aviso de compatibilidade do runtime das actions.
- **Impacto:** não bloqueia o deploy hoje, mas pode exigir atualização futura.
- **Causa provável:** versões correntes das actions ainda referenciam runtime em descontinuação no runner.
- **Correção recomendada:** acompanhar releases oficiais e atualizar apenas quando versões estáveis compatíveis estiverem disponíveis.
- **Arquivos envolvidos:** `.github/workflows/deploy-pages.yml`.

## Segurança confirmada no estado inicial

- Não existe chave `service_role`, `sb_secret_*` ou chave privada no frontend.
- O frontend contém somente Project URL e chave pública publishable/anon.
- A senha permanece apenas no valor transitório do campo e é apagada após autenticação bem-sucedida; o código da aplicação não a grava em `localStorage`.
- A sessão é gerida pelo SDK Supabase; logout usa `scope: 'local'` e não executa exclusão de dados remotos.
- `user_id` usado em gravações e exclusões vem de `currentUser.id`, derivado da sessão, e não de campo editável.
- Consultas usam o cliente autenticado e a tabela possui políticas RLS separadas por operação.
- Conteúdo interpolado atualmente passa por `escapeHtml`, mas a recomendação é remover a interpolação dinâmica em `innerHTML` para reduzir risco futuro.

## GitHub Pages e PWA confirmados no estado inicial

- `start_url`, `scope`, assets, imports e registro do worker usam caminhos relativos, compatíveis com `/Jornada-com-Cristo/`.
- Manifest é JSON válido e os ícones referenciados existem.
- Navegação offline possui fallback relativo para `index.html`.
- Cache é versionado e caches antigos são removidos.
- Faltam atualização orientada ao usuário, fallback resiliente quando o CDN falha e validação automatizada de instalação em Chrome Android/Xiaomi Pad.

## Plano de correção incremental

1. Introduzir módulos puros de constantes, validação e merge, com testes Node sem dependências.
2. Criar camada IndexedDB e migração preservando as chaves legadas até confirmação.
3. Implementar outbox unificada, mutex, retry/backoff e merge/Reatime protegido por versão.
4. Melhorar ciclo de atualização do service worker e resiliência do cache.
5. Adicionar autosave, desfazer exclusão, importação validada, busca/filtros e feedback acessível.
6. Evoluir tema, responsividade e módulos funcionais sem quebrar payloads existentes.
7. Completar documentação, testes manuais e relatório final.

## Itens que exigem decisão do responsável

- **Nome canônico:** manter “Caminho Diário” na aplicação ou renomear tudo para “Jornada com Cristo”. Recomendação: preservar “Caminho Diário” nesta auditoria para não alterar identidade/instalação sem decisão explícita.
- **PDF:** usar impressão nativa, recomendada por não adicionar dependência, ou uma biblioteca de geração com maior custo de bundle.
- **Reautenticação destrutiva:** confirmação digitada pode ser implementada agora; exigir senha novamente demandaria fluxo específico e atenção a provedores futuros.
