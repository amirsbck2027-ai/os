-- Aura OS cloud sync schema (Supabase). Run once in the SQL editor of your own project.
create table public.aura_files (
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null, kind text not null check (kind in ('f','d')),
  content text, deleted boolean not null default false,
  mtime bigint not null default 0, updated_at timestamptz not null default now(),
  primary key (user_id, path));
create table public.aura_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create index aura_files_user_updated_idx on public.aura_files (user_id, updated_at);
alter table public.aura_files enable row level security;
alter table public.aura_settings enable row level security;
create policy "aura_files owner all" on public.aura_files for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "aura_settings owner all" on public.aura_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create or replace function public.aura_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger aura_files_touch before update on public.aura_files for each row execute function public.aura_touch();
create trigger aura_settings_touch before update on public.aura_settings for each row execute function public.aura_touch();
