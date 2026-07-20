# Continuidade do projeto

- Antes de iniciar qualquer tarefa, leia `docs/MEMORIA_PROJETO.md` para retomar o contexto atual.
- Confira `git status --short` antes de editar; preserve alterações existentes do usuário.
- Ao concluir trabalho material, atualize `docs/MEMORIA_PROJETO.md` com a data, o que mudou, validações executadas, pendências e o próximo passo recomendado.
- Não registre senhas, tokens privados, chaves `service_role` nem outros segredos na memória.
- Quando a tarefa envolver apenas consulta, não altere a memória salvo se descobrir informação durável que corrija o estado registrado.
- Use o agente `memoria-projeto` para auditorias de retomada, consolidação de contexto ou atualização do checkpoint.

# Projeto

- Aplicação PWA estática em `caminho-diario/`, sem etapa de build.
- Sirva localmente com `cd caminho-diario && python3 -m http.server 8080`.
- Validação mínima para mudanças JavaScript: `node --check caminho-diario/app.js` e `node --check caminho-diario/service-worker.js`.
- Rode também `git diff --check` antes da entrega.
- O deploy do GitHub Pages publica diretamente a pasta `caminho-diario/` ao enviar mudanças para `main`.

