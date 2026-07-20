# Sincronização offline-first

## Princípios

- IndexedDB recebe a alteração antes de qualquer chamada de rede.
- Cada alteração cria/substitui uma operação na outbox.
- A chave composta torna upserts e deletes idempotentes.
- A interface nunca depende da internet para salvar.
- O status “Sincronizado” só aparece quando a outbox foi processada sem erro.

## Operações

`upsert` contém kind, id, payload normalizado e revisão. `delete` funciona como tombstone local: o registro sai da store e a operação permanece até o servidor confirmar.

Novas mudanças do mesmo registro substituem a operação anterior. Desfazer uma exclusão cria um upsert mais recente, inclusive se o delete já chegou ao servidor.

## Retry e falhas parciais

Operações são enviadas em série. Cada uma possui até quatro tentativas com backoff exponencial de 500 ms até o teto de 30 s. Tentativas e mensagem resumida ficam na outbox; tokens e payloads não vão para logs.

Uma falha interrompe o lote e mantém a operação e as seguintes. O botão **Sincronizar agora** e o evento `online` retomam a fila.

## Merge e conflitos

A política é last-write-wins por `updatedAt/updated_at`. Em empate, uma alteração local pendente é preservada. Como o instante nasce no dispositivo para permitir edição offline, relógios muito incorretos ainda são um risco conhecido.

O pull inicial ocorre após login e em reconexão/manual. Registros remotos ausentes removem cópias locais previamente sincronizadas; registros locais nunca sincronizados são enfileirados.

## Realtime

O evento é normalizado e comparado com a versão local. Eventos são ignorados quando existe upsert/delete pendente. Eco do próprio envio é seguro e não cria nova operação. Falha do canal não impede sincronização manual/pull.

## Duas contas

Cada UUID possui scope IndexedDB separado. `user_id` remoto vem exclusivamente da sessão. Dados anônimos são reivindicados apenas uma vez pela primeira conta, reproduzindo a regra anterior sem apagar o backup legado.
