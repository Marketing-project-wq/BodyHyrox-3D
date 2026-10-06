-- S0: materials (photos + videos) and turn sets for EVERY athlete.
-- NOT APPLIED. The owner runs this in the Supabase SQL editor after approval
-- (project cpvzwqptzcxnwzfzgrmt). Additive: nothing existing is removed, the
-- live 360 sets and the site keep working before and after it runs.
--
-- * storage bucket smb-athlete-360-sources: original photos + videos the admin
--   uploads ("Bahan 360"), kept after a turn set is made (service role only)
-- * smb_athlete_media_sources: the list of those files per athlete
-- * smb_athlete_media_360.turn: a turn set's per-picture angles + crossfade
--   share (null = not a turn set; the stage then keeps the 4-side mode)
-- * smb_save_athlete_media_draft: creates the athlete's 360 row when missing
--   (today only athletes with a row can save a draft), and checks draft.turn
-- * smb_publish_athlete_media_360: takes p_turn (default null), keeps it in
--   the history snapshot
-- * smb_public_athlete: returns media_360.turn
--
-- Rollback: see the end of this file.

-- 1. Bucket for the original materials (private; 200 MB per file).
--    The project-wide upload limit (Storage settings) must be at least as large
--    for big videos to go through.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'smb-athlete-360-sources', 'smb-athlete-360-sources', false, 209715200,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do nothing;

-- 2. The list of materials per athlete.
create table if not exists public.smb_athlete_media_sources (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.smb_athletes(id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  file text not null,                 -- path inside smb-athlete-360-sources
  thumb text,                         -- small preview image (same bucket), or null
  original_name text,
  mime text,
  size_bytes bigint,
  width int,
  height int,
  duration_sec numeric,               -- videos only
  angle_hint numeric check (angle_hint is null or (angle_hint >= 0 and angle_hint < 360)),
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz not null default now(),
  unique (file)
);
create index if not exists smb_athlete_media_sources_athlete_idx
  on public.smb_athlete_media_sources (athlete_id, created_at);
alter table public.smb_athlete_media_sources enable row level security;
revoke all on public.smb_athlete_media_sources from anon, authenticated;

-- 3. Turn set on the published 360 row.
--    Shape: {"v": 1, "angles": [0, 15.2, ...], "blendShare": 0.15}
--    angles[i] = the turn angle of frames[i] (degrees, 0 = Front, 90 = Right).
alter table public.smb_athlete_media_360 add column if not exists turn jsonb;

-- Validates a turn object for n frames; raises on anything malformed.
create or replace function public.smb_check_media_turn(p_turn jsonb, p_n int)
returns void
language plpgsql
immutable
set search_path to 'public'
as $function$
declare a numeric; prev numeric := -1; k int := 0;
begin
  if p_turn is null then return; end if;
  if jsonb_typeof(p_turn) <> 'object' then raise exception 'Format set putaran tidak valid'; end if;
  if jsonb_typeof(p_turn->'angles') <> 'array' then raise exception 'Set putaran tanpa sudut'; end if;
  if jsonb_array_length(p_turn->'angles') <> p_n then
    raise exception 'Jumlah sudut (%) harus sama dengan jumlah frame (%)', jsonb_array_length(p_turn->'angles'), p_n;
  end if;
  for a in select (e #>> '{}')::numeric from jsonb_array_elements(p_turn->'angles') e loop
    if a < 0 or a >= 360 then raise exception 'Sudut harus 0–360'; end if;
    if a <= prev then raise exception 'Sudut harus naik berurutan'; end if;
    prev := a; k := k + 1;
  end loop;
  if p_turn ? 'blendShare' and ((p_turn->>'blendShare')::numeric < 0 or (p_turn->>'blendShare')::numeric > 1) then
    raise exception 'blendShare harus 0–1';
  end if;
end; $function$;

-- 4. Draft save: creates the row for athletes that have none yet.
create or replace function public.smb_save_athlete_media_draft(p_athlete_id uuid, p_draft jsonb, p_actor_id uuid, p_actor_name text)
 returns smb_athlete_media_360
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r smb_athlete_media_360;
begin
  if p_draft is not null then
    if jsonb_typeof(p_draft) <> 'object' then raise exception 'Format draft tidak valid'; end if;
    if jsonb_typeof(p_draft->'frames') <> 'array' then raise exception 'Draft tanpa daftar frame'; end if;
    if jsonb_array_length(p_draft->'frames') > 36 then raise exception 'Maksimal 36 frame'; end if;
    if octet_length(p_draft::text) > 1000000 then raise exception 'Draft terlalu besar'; end if;
    perform smb_check_media_turn(p_draft->'turn', jsonb_array_length(p_draft->'frames'));
    -- An athlete without a 360 set yet: start an empty, unpublished row.
    if not exists (select 1 from smb_athletes where id = p_athlete_id) then raise exception 'Atlet tidak ditemukan'; end if;
    insert into smb_athlete_media_360 (athlete_id, base_url, frames, created_by)
    values (p_athlete_id, '', '[]'::jsonb, p_actor_id)
    on conflict (athlete_id) do nothing;
  end if;
  update smb_athlete_media_360 set draft = p_draft
    where athlete_id = p_athlete_id returning * into r;
  if not found then raise exception 'Media 360 atlet belum ada'; end if;
  if p_draft is null then
    perform smb_audit(p_actor_id, p_actor_name, 'athlete.media_360.draft_discard', 'athlete_media_360',
      p_athlete_id, null, null);
  end if;
  return r;
end; $function$;

-- 5. Publish with an optional turn set (old signature replaced; callers that
--    don't pass p_turn publish a plain set, as before).
drop function if exists public.smb_publish_athlete_media_360(uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, text);
create or replace function public.smb_publish_athlete_media_360(p_athlete_id uuid, p_base_url text, p_frames jsonb, p_frame_meta jsonb, p_views jsonb, p_hotspots jsonb, p_actor_id uuid, p_actor_name text, p_turn jsonb default null)
 returns smb_athlete_media_360
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r_old smb_athlete_media_360; r_new smb_athlete_media_360; n int; k text; h jsonb; pk text; pv jsonb;
begin
  select * into r_old from smb_athlete_media_360 where athlete_id = p_athlete_id for update;
  if not found then raise exception 'Media 360 atlet belum ada'; end if;
  if coalesce(p_base_url, '') = '' then raise exception 'base_url kosong'; end if;
  if jsonb_typeof(p_frames) <> 'array' then raise exception 'Daftar frame tidak valid'; end if;
  n := jsonb_array_length(p_frames);
  if n < 8 or n > 36 then raise exception 'Jumlah frame harus 8–36 (sekarang %)', n; end if;
  if exists (select 1 from jsonb_array_elements(p_frames) e where jsonb_typeof(e) <> 'string' or e #>> '{}' = '') then
    raise exception 'Nama frame tidak valid'; end if;
  if (select count(distinct e #>> '{}') from jsonb_array_elements(p_frames) e) <> n then
    raise exception 'Nama frame ganda'; end if;
  if p_frame_meta is not null and jsonb_typeof(p_frame_meta) <> 'object' then raise exception 'frame_meta tidak valid'; end if;
  perform smb_check_media_turn(p_turn, n);
  if p_views is not null then
    foreach k in array array['front','right','back','left'] loop
      if not (p_frames ? (p_views->>k)) then raise exception 'Frame untuk view % tidak ada', k; end if;
    end loop;
  end if;
  if p_hotspots is null or jsonb_typeof(p_hotspots) <> 'array' then raise exception 'Format titik zona tidak valid'; end if;
  for h in select * from jsonb_array_elements(p_hotspots) loop
    if not exists (select 1 from smb_athlete_zones az
                   where az.id = nullif(h->>'athlete_zone_id','')::uuid and az.athlete_id = p_athlete_id) then
      raise exception 'Zona tidak milik atlet ini'; end if;
    for pk, pv in select * from jsonb_each(h->'points') loop
      if pk !~ '^[0-9]+$' or pk::int < 1 or pk::int > n then raise exception 'Nomor frame % tidak valid', pk; end if;
      if (pv->>'x')::numeric not between 0 and 1 or (pv->>'y')::numeric not between 0 and 1 then
        raise exception 'Koordinat titik harus 0–1'; end if;
    end loop;
  end loop;

  -- A row that was never published (created by a draft save) has nothing to snapshot.
  if jsonb_array_length(r_old.frames) > 0 then
    insert into smb_athlete_media_360_history(athlete_id, version, snapshot, actor_id, actor_name)
    values (p_athlete_id, r_old.version, jsonb_build_object(
      'base_url', r_old.base_url, 'frames', r_old.frames, 'frame_meta', r_old.frame_meta,
      'views', r_old.views, 'hotspots', r_old.hotspots, 'turn', r_old.turn), p_actor_id, p_actor_name)
    on conflict (athlete_id, version) do nothing;
  end if;

  update smb_athlete_media_360 set
    base_url = p_base_url, frames = p_frames, frame_meta = coalesce(p_frame_meta, '{}'::jsonb),
    views = p_views, hotspots = p_hotspots, turn = p_turn, is_placeholder = false,
    draft = null, version = r_old.version + 1, published_at = now(), updated_at = now()
  where athlete_id = p_athlete_id returning * into r_new;

  perform smb_audit(p_actor_id, p_actor_name, 'athlete.media_360.publish', 'athlete_media_360', p_athlete_id,
    jsonb_build_object('version', r_old.version, 'base_url', r_old.base_url, 'frames', r_old.frames),
    jsonb_build_object('version', r_new.version, 'base_url', r_new.base_url, 'frames', r_new.frames, 'turn', r_new.turn is not null));
  return r_new;
end; $function$;
revoke all on function public.smb_publish_athlete_media_360(uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.smb_save_athlete_media_draft(uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.smb_check_media_turn(jsonb, int) from public, anon, authenticated;
grant execute on function public.smb_publish_athlete_media_360(uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, text, jsonb) to service_role;
grant execute on function public.smb_save_athlete_media_draft(uuid, jsonb, uuid, text) to service_role;
grant execute on function public.smb_check_media_turn(jsonb, int) to service_role;

-- 6. Public athlete: media_360 also carries the turn set. Identical to the live
--    definition (read 2026-10-06) except for the 'turn' key, and an athlete whose
--    row was created by a draft save but never published returns no media_360.
create or replace function public.smb_public_athlete(p_id uuid)
 returns jsonb
 language sql
 security definer
 set search_path to 'public'
as $function$
  select case when a.id is null then null else jsonb_build_object(
    'id', a.id, 'nama', a.nama, 'handle', a.handle, 'kota', a.kota, 'gender', a.gender,
    'discipline', a.discipline, 'photo_url', a.photo_url, 'podium_count', a.podium_count,
    'rank', a.rank, 'frames_per_season', a.frames_per_season,
    'berat_kg', a.berat_kg, 'tinggi_cm', a.tinggi_cm, 'usia', a.usia,
    'total_terbaik_kg', a.total_terbaik_kg, 'total_terbaik_label', a.total_terbaik_label,
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'athlete_zone_id', az.id, 'zone_id', z.id, 'nama', z.nama,
        'base_price', coalesce(az.base_price, z.base_price), 'exclusive', az.exclusive, 'status', az.status
      ) order by z.sort_order)
      from smb_athlete_zones az join smb_body_zones z on z.id = az.zone_id
      where az.athlete_id = a.id and az.active and z.active and az.status <> 'nonaktif'
    ), '[]'::jsonb),
    'races', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event', e.nama, 'venue', e.venue, 'date', e.event_date,
        'placement', ae.placement, 'is_podium', ae.is_podium
      ) order by e.event_date desc)
      from smb_athlete_events ae join smb_events e on e.id = ae.event_id
      where ae.athlete_id = a.id
    ), '[]'::jsonb),
    'media_360', (
      select case when m.athlete_id is null or jsonb_array_length(m.frames) = 0 then null else jsonb_build_object(
        'base_url', m.base_url, 'frames', m.frames, 'autospin', m.autospin,
        'crossfade', m.crossfade, 'is_placeholder', m.is_placeholder, 'views', m.views,
        'frame_meta', m.frame_meta, 'version', m.version, 'turn', m.turn,
        'hotspots', coalesce((
          select jsonb_agg(
            h.val || jsonb_build_object(
              'zone_nama', z.nama, 'status', az.status,
              'effective_price', coalesce(az.base_price, z.base_price)
            )
          )
          from jsonb_array_elements(m.hotspots) as h(val)
          left join smb_athlete_zones az on az.id = nullif(h.val->>'athlete_zone_id','')::uuid
          left join smb_body_zones z on z.id = az.zone_id
        ), '[]'::jsonb)
      ) end
      from smb_athlete_media_360 m where m.athlete_id = a.id
    )
  ) end
  from (select * from smb_athletes where id = p_id and status = 'active') a;
$function$;

-- Rollback (only if needed; the app code of S1-S3 needs the objects above):
--   drop function public.smb_publish_athlete_media_360(uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, text, jsonb);
--   -- then re-create the 2026-09-29 definitions of smb_publish_athlete_media_360,
--   -- smb_save_athlete_media_draft and smb_public_athlete (20260929_smb_media_360_studio.sql)
--   drop function public.smb_check_media_turn(jsonb, int);
--   alter table public.smb_athlete_media_360 drop column turn;
--   drop table public.smb_athlete_media_sources;
--   -- the bucket can only be removed once empty: delete from storage.buckets where id = 'smb-athlete-360-sources';
