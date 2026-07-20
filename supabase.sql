-- Execute uma vez no SQL Editor do seu projeto Supabase.
create table if not exists public.caminho_diario_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('day', 'prayer', 'week', 'settings')),
  record_id text not null check (char_length(record_id) between 1 and 80),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, record_id)
);

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

grant select, insert, update, delete on public.caminho_diario_records to authenticated;
alter table public.caminho_diario_records replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.caminho_diario_records;
exception when duplicate_object then null;
end $$;
