-- Run this script once in Supabase: SQL Editor > New query.
-- Each person can access only their own records through the policies below.

create table public.attendance_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  status text not null check (status in ('office', 'vacation')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, work_date)
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_percentage numeric(4, 3) not null default 0.400 check (target_percentage > 0 and target_percentage <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_attendance_entries_updated_at
  before update on public.attendance_entries
  for each row execute function public.set_updated_at();

create trigger set_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.attendance_entries enable row level security;
alter table public.user_settings enable row level security;

create policy "Users manage their own attendance entries"
  on public.attendance_entries for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own settings"
  on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
