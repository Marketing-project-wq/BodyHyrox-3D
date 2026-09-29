-- 360 studio (applied to project cpvzwqptzcxnwzfzgrmt on 2026-09-29 as migration
-- "smb_media_360_studio"). Kept here for the record; additive only.
--
-- * smb_athlete_media_360: frame_meta (per-frame transform / feet / backup
--   chain), draft (admin working copy, never public), version, published_at
-- * smb_athlete_media_360_history: snapshot of every replaced published version
-- * storage bucket smb-athlete-360-private: draft uploads (service role only)
-- * smb_save_athlete_media_draft / smb_publish_athlete_media_360 RPCs
-- * smb_public_athlete also returns media_360.frame_meta + version

alter table public.smb_athlete_media_360
  add column if not exists frame_meta jsonb not null default '{}'::jsonb,
  add column if not exists draft jsonb,
  add column if not exists version int not null default 1,
  add column if not exists published_at timestamptz;

create table if not exists public.smb_athlete_media_360_history (
  id bigserial primary key,
  athlete_id uuid not null references public.smb_athletes(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  actor_id uuid,
  actor_name text,
  created_at timestamptz not null default now(),
  unique (athlete_id, version)
);
alter table public.smb_athlete_media_360_history enable row level security;
revoke all on public.smb_athlete_media_360_history from anon, authenticated;
revoke all on sequence public.smb_athlete_media_360_history_id_seq from anon, authenticated;
revoke all on public.smb_athlete_media_360 from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('smb-athlete-360-private', 'smb-athlete-360-private', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Function bodies: see `select pg_get_functiondef('public.smb_save_athlete_media_draft'::regproc)`,
-- `... 'public.smb_publish_athlete_media_360'::regproc` and `... 'public.smb_public_athlete'::regproc`.
-- Both new RPCs are SECURITY DEFINER with execute revoked from public, anon, authenticated.
