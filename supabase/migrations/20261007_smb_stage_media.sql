-- =============================================================================
-- M0: "Media frame panggung" (stage frame media per athlete)
-- NOT APPLIED. The owner reviews and runs this in the Supabase SQL editor.
-- Adds new smb_* objects only; existing tables, functions, RLS and buckets are
-- untouched. Pictures (YouTube thumbnails, image copies, video posters) go to
-- the existing public bucket smb-athlete-360 under <athlete>/stage-media/.
-- Everything is service_role only (the app's server); anon/authenticated get
-- nothing.
-- =============================================================================

create table if not exists public.smb_athlete_stage_media (
  athlete_id uuid primary key references public.smb_athletes(id) on delete cascade,
  draft      jsonb,
  published  jsonb not null default '{"v":1,"slots":[]}'::jsonb,
  version    int  not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text
);
alter table public.smb_athlete_stage_media enable row level security;  -- no policies: service_role only
revoke all on public.smb_athlete_stage_media from anon, authenticated;

create table if not exists public.smb_athlete_stage_media_history (
  id bigserial primary key,
  athlete_id uuid not null references public.smb_athletes(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  actor_id uuid,
  actor_name text,
  created_at timestamptz not null default now()
);
alter table public.smb_athlete_stage_media_history enable row level security;
revoke all on public.smb_athlete_stage_media_history from anon, authenticated;

-- Shape check (draft and publish). Messages are mapped to error codes in lib/action-error.ts.
create or replace function public.smb_check_stage_media(p jsonb) returns void
language plpgsql immutable as $$
declare s jsonb; seen int[] := '{}'; n int;
begin
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p->'slots') <> 'array' then
    raise exception 'Format media frame tidak valid';
  end if;
  if jsonb_array_length(p->'slots') > 6 then raise exception 'Maksimal 6 slot'; end if;
  for s in select * from jsonb_array_elements(p->'slots') loop
    if jsonb_typeof(s) <> 'object' then raise exception 'Format media frame tidak valid'; end if;
    n := (s->>'slot')::int;
    if n is null or n < 0 or n > 5 or n = any(seen) then raise exception 'Slot media tidak valid'; end if;
    seen := seen || n;
    if coalesce(s->>'kind','') not in ('youtube','video','image') then raise exception 'Jenis media tidak valid'; end if;
    if coalesce(s->>'url','') !~ '^https://' or length(s->>'url') > 500 then raise exception 'Link harus https'; end if;
    if (s->>'kind') = 'youtube' and coalesce(s->>'ytId','') !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'ID YouTube tidak valid'; end if;
    if length(coalesce(s->>'title','')) > 80 then raise exception 'Judul terlalu panjang'; end if;
  end loop;
end $$;

create or replace function public.smb_save_athlete_stage_media_draft(p_athlete_id uuid, p_draft jsonb, p_actor_id uuid, p_actor_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from smb_athletes where id = p_athlete_id) then raise exception 'Atlet tidak ditemukan'; end if;
  perform smb_check_stage_media(p_draft);
  insert into smb_athlete_stage_media (athlete_id, draft, updated_by, updated_by_name)
  values (p_athlete_id, p_draft, p_actor_id, p_actor_name)
  on conflict (athlete_id) do update
    set draft = excluded.draft, updated_at = now(),
        updated_by = excluded.updated_by, updated_by_name = excluded.updated_by_name;
  return (select to_jsonb(m) from smb_athlete_stage_media m where athlete_id = p_athlete_id);
end $$;

create or replace function public.smb_publish_athlete_stage_media(p_athlete_id uuid, p_actor_id uuid, p_actor_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r smb_athlete_stage_media;
begin
  select * into r from smb_athlete_stage_media where athlete_id = p_athlete_id for update;
  if r.athlete_id is null or r.draft is null then raise exception 'Tidak ada draft media frame'; end if;
  perform smb_check_stage_media(r.draft);
  insert into smb_athlete_stage_media_history (athlete_id, version, snapshot, actor_id, actor_name)
  values (p_athlete_id, r.version, r.published, p_actor_id, p_actor_name);
  update smb_athlete_stage_media
     set published = r.draft, draft = null, version = r.version + 1,
         updated_at = now(), updated_by = p_actor_id, updated_by_name = p_actor_name
   where athlete_id = p_athlete_id;
  return (select to_jsonb(m) from smb_athlete_stage_media m where athlete_id = p_athlete_id);
end $$;

-- Published value for the public athlete page (read by the app's server).
create or replace function public.smb_public_athlete_stage_media(p_athlete_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select published from smb_athlete_stage_media where athlete_id = p_athlete_id),
                  '{"v":1,"slots":[]}'::jsonb);
$$;

revoke all on function public.smb_check_stage_media(jsonb) from public, anon, authenticated;
revoke all on function public.smb_save_athlete_stage_media_draft(uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.smb_publish_athlete_stage_media(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.smb_public_athlete_stage_media(uuid) from public, anon, authenticated;
grant execute on function public.smb_check_stage_media(jsonb) to service_role;
grant execute on function public.smb_save_athlete_stage_media_draft(uuid, jsonb, uuid, text) to service_role;
grant execute on function public.smb_publish_athlete_stage_media(uuid, uuid, text) to service_role;
grant execute on function public.smb_public_athlete_stage_media(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Rollback (removes only what this file adds):
-- drop function if exists public.smb_public_athlete_stage_media(uuid);
-- drop function if exists public.smb_publish_athlete_stage_media(uuid, uuid, text);
-- drop function if exists public.smb_save_athlete_stage_media_draft(uuid, jsonb, uuid, text);
-- drop function if exists public.smb_check_stage_media(jsonb);
-- drop table if exists public.smb_athlete_stage_media_history;
-- drop table if exists public.smb_athlete_stage_media;
-- Pictures in smb-athlete-360/<athlete>/stage-media/ can then be deleted from Storage.
-- -----------------------------------------------------------------------------
