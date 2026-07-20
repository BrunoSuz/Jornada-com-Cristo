-- Jornada com Cristo — migration idempotente da tabela genérica de registros.
-- Pode ser executada novamente no SQL Editor sem apagar dados existentes.

create table if not exists public.caminho_diario_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  record_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, record_id)
);

-- Constraints nomeadas são adicionadas também quando a tabela já existia.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'caminho_diario_kind_check' and conrelid = 'public.caminho_diario_records'::regclass) then
    alter table public.caminho_diario_records add constraint caminho_diario_kind_check
      check (kind in ('day', 'prayer', 'week', 'settings')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caminho_diario_record_id_check' and conrelid = 'public.caminho_diario_records'::regclass) then
    alter table public.caminho_diario_records add constraint caminho_diario_record_id_check
      check (char_length(record_id) between 1 and 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caminho_diario_payload_check' and conrelid = 'public.caminho_diario_records'::regclass) then
    alter table public.caminho_diario_records add constraint caminho_diario_payload_check
      check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caminho_diario_payload_shape_check' and conrelid = 'public.caminho_diario_records'::regclass) then
    alter table public.caminho_diario_records add constraint caminho_diario_payload_shape_check
      check (
        payload ? 'updatedAt'
        and jsonb_typeof(payload -> 'updatedAt') = 'string'
        and case kind
          when 'day' then payload ? 'date' and jsonb_typeof(payload -> 'date') = 'string'
          when 'prayer' then payload ?& array['id', 'name', 'reason'] and jsonb_typeof(payload -> 'id') = 'string'
            and jsonb_typeof(payload -> 'name') = 'string'
            and jsonb_typeof(payload -> 'reason') = 'string'
          when 'week' then payload ? 'week' and jsonb_typeof(payload -> 'week') = 'string'
          when 'settings' then record_id = 'profile'
          else false
        end
      ) not valid;
  end if;
end $$;

alter table public.caminho_diario_records validate constraint caminho_diario_kind_check;
alter table public.caminho_diario_records validate constraint caminho_diario_record_id_check;
alter table public.caminho_diario_records validate constraint caminho_diario_payload_check;
alter table public.caminho_diario_records validate constraint caminho_diario_payload_shape_check;

create index if not exists caminho_diario_records_user_updated_idx
  on public.caminho_diario_records (user_id, updated_at desc);

alter table public.caminho_diario_records enable row level security;

drop policy if exists "Ler os próprios registros" on public.caminho_diario_records;
create policy "Ler os próprios registros" on public.caminho_diario_records
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Criar os próprios registros" on public.caminho_diario_records;
create policy "Criar os próprios registros" on public.caminho_diario_records
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Atualizar os próprios registros" on public.caminho_diario_records;
create policy "Atualizar os próprios registros" on public.caminho_diario_records
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Excluir os próprios registros" on public.caminho_diario_records;
create policy "Excluir os próprios registros" on public.caminho_diario_records
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.caminho_diario_records from anon;
grant select, insert, update, delete on public.caminho_diario_records to authenticated;

-- Necessário para que eventos DELETE do Realtime tragam a chave da linha antiga.
alter table public.caminho_diario_records replica identity full;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'caminho_diario_records'
  ) then
    alter publication supabase_realtime add table public.caminho_diario_records;
  end if;
end $$;

comment on table public.caminho_diario_records is 'Registros offline-first da Jornada com Cristo, isolados por usuário via RLS.';
comment on column public.caminho_diario_records.kind is 'Tipo lógico: day, prayer, week ou settings.';
comment on column public.caminho_diario_records.record_id is 'Identificador estável e idempotente dentro do tipo e usuário.';
comment on column public.caminho_diario_records.payload is 'JSON validado no cliente conforme o tipo; limite de 100 KB.';
comment on column public.caminho_diario_records.updated_at is 'Versão usada na política LWW; originada no instante da edição, inclusive offline.';
