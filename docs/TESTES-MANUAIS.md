# Testes manuais

Registre data, navegador, dispositivo e resultado de cada cenário. Use dados fictícios.

## Cadastro e confirmação

- [ ] Abrir Ajustes e criar conta com e-mail válido.
- [ ] Confirmar mensagem acolhedora e senha apagada do campo.
- [ ] Com confirmação habilitada, abrir o e-mail e retornar para uma Redirect URL permitida.
- [ ] Entrar e confirmar “Sincronizado”.

## Login e logout

- [ ] Entrar, salvar um registro e recarregar.
- [ ] Sair; confirmar que dados da nuvem não foram apagados.
- [ ] Entrar novamente e confirmar recuperação do perfil.
- [ ] Verificar que senha não aparece em Local Storage/IndexedDB.

## Duas contas e RLS

- [ ] Conta A cria diário e oração.
- [ ] Conta B, em perfil separado, não visualiza dados de A.
- [ ] B cria dados próprios; A não os visualiza.
- [ ] Table Editor administrativo mostra ambos com UUIDs diferentes.

## Duas sessões e Realtime

- [ ] Abrir a mesma conta em dois perfis.
- [ ] Alterar uma oração em A; confirmar atualização em B.
- [ ] Editar em B; confirmar retorno para A sem loop ou duplicação.

## Offline e fila

- [ ] Com worker ativo, desligar rede e recarregar normalmente.
- [ ] Criar e editar diário; confirmar “Offline” e autosave após reload.
- [ ] Criar oração offline.
- [ ] Excluir oração sincronizada offline; confirmar que não reaparece.
- [ ] Reconectar após alguns minutos e clicar Sincronizar agora.
- [ ] Confirmar outbox vazia e dados no Supabase.

## Conflito

- [ ] Mesma conta em A/B, ambos offline.
- [ ] Editar o mesmo dia em A.
- [ ] Alguns segundos depois, editar em B.
- [ ] Reconectar A e depois B.
- [ ] Confirmar que a revisão de B vence e estabiliza nas duas sessões.

## Duplicação e falha parcial

- [ ] Salvar repetidamente o mesmo dia offline; deve existir uma operação lógica.
- [ ] Criar pedido idêntico; interface deve impedir duplicação ativa.
- [ ] Interromper a rede durante sync; status deve mostrar erro/pendência, nunca sucesso falso.
- [ ] Reconectar e confirmar retry idempotente.

## PWA

- [ ] Instalar no Chrome Android.
- [ ] Abrir em standalone e confirmar ícone/cores.
- [ ] Publicar nova versão; confirmar aviso e botão Atualizar aplicativo.
- [ ] Atualizar e confirmar dados IndexedDB preservados.

## Backup e restauração

- [ ] Exportar JSON e conferir data do último backup.
- [ ] Importar em modo mesclar; versão mais recente deve vencer.
- [ ] Importar em modo substituir após confirmação.
- [ ] Tentar arquivo inválido; nenhum dado atual pode ser apagado.
- [ ] Usar Imprimir/PDF e conferir histórico legível.

## Xiaomi Pad

- [ ] Retrato e paisagem.
- [ ] Teclado virtual não cobre o campo ativo.
- [ ] Todos os botões têm área confortável de toque.
- [ ] Barra inferior e safe area permanecem acessíveis.
- [ ] Tema sistema/claro/escuro.
- [ ] Modo avião, fechamento e reabertura.
