"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ArrowLeft, Trophy, Trash2, Plus } from "lucide-react";
import type { AdminAthleteDetail, AdminZoneRow, EventRow, ZoneStatus } from "@/lib/data";
import { ACTIVE_STATUS, type BadgeTone } from "@/lib/config";
import { type Dict, fmt, tActive } from "@/lib/i18n";
import { formatIDR, formatIDRCompact, formatDayMonth, initials } from "@/lib/format";
import { Badge } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Athlete360Admin } from "@/components/Athlete360Admin";
import {
  updateAthlete,
  upsertAthleteZone,
  setAthleteZonePrice,
  resetAthleteZonePrice,
  addAthleteRace,
  deleteAthleteRace,
} from "@/app/admin/actions";

const ZONE_TONE: Record<ZoneStatus, BadgeTone> = {
  tersedia: "green",
  terisi: "amber",
  nonaktif: "gray",
};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-60">
      {pending ? "Menyimpan…" : label}
    </button>
  );
}

export function AthleteEditorClient({
  athlete,
  events,
  canEdit,
  canPricing,
  saved = false,
  media360,
  m,
}: {
  athlete: AdminAthleteDetail;
  events: EventRow[];
  canEdit: boolean;
  canPricing: boolean;
  saved?: boolean;
  media360: { frames: number; autospin: boolean; crossfade: boolean; isPlaceholder: boolean };
  m: Dict;
}) {
  const [photo, setPhoto] = useState(athlete.photoUrl ?? "");
  const [imgOk, setImgOk] = useState(true);
  const showImg = photo.trim().length > 0 && imgOk;

  const zoneStatusLabel = (s: ZoneStatus | null) =>
    s === "tersedia" ? m.ae_st_tersedia : s === "terisi" ? m.ae_st_terisi : s === "nonaktif" ? m.ae_st_nonaktif : "—";

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/atlet"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:text-text"
            aria-label={m.ae_back}
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-text">{athlete.nama}</h1>
              <Badge tone={ACTIVE_STATUS[athlete.status].tone}>{tActive(m, athlete.status)}</Badge>
            </div>
            <p className="text-xs text-faint">{athlete.handle}</p>
          </div>
        </div>
      </div>

      {/* Scroll region */}
      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
        {/* ---------- Profile ---------- */}
        <section className="card p-4">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-text">{m.ae_profile}</h2>
            {saved && (
              <span className="rounded-full bg-[#12b76a]/15 px-2.5 py-0.5 text-xs font-medium text-[#12b76a]">
                Tersimpan ✓
              </span>
            )}
          </div>
          <form action={updateAthlete} className="flex flex-col gap-4 sm:flex-row">
            <input type="hidden" name="id" value={athlete.id} />
            {/* Photo preview */}
            <div className="flex shrink-0 flex-col items-center gap-2">
              {showImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt={athlete.nama}
                  className="h-24 w-24 rounded-2xl border border-border object-cover"
                  onError={() => setImgOk(false)}
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-border bg-surface-2 text-2xl font-semibold text-muted">
                  {initials(athlete.nama)}
                </div>
              )}
            </div>

            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="col-span-1 sm:col-span-2 flex flex-col gap-1">
                <span className="eyebrow">{m.ae_photo}</span>
                <input
                  name="photo_url"
                  value={photo}
                  onChange={(e) => {
                    setPhoto(e.target.value);
                    setImgOk(true);
                  }}
                  placeholder="https://media.20fit.id/…"
                  className="input"
                  disabled={!canEdit}
                />
                <span className="text-[11px] text-faint">{m.ae_photoHint}</span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="eyebrow">{m.ath_formName}</span>
                <input name="nama" required defaultValue={athlete.nama} className="input" disabled={!canEdit} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow">{m.ath_formHandle}</span>
                <input name="handle" required defaultValue={athlete.handle} className="input" disabled={!canEdit} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow">{m.city}</span>
                <input name="kota" required defaultValue={athlete.kota} className="input" disabled={!canEdit} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow">{m.gender}</span>
                <select name="gender" defaultValue={athlete.gender} className="input" disabled={!canEdit}>
                  <option value="male">{m.male}</option>
                  <option value="female">{m.female}</option>
                </select>
              </label>
              <label className="col-span-1 sm:col-span-2 flex flex-col gap-1">
                <span className="eyebrow">{m.ae_discipline}</span>
                <input
                  name="discipline"
                  defaultValue={athlete.discipline ?? ""}
                  placeholder={m.ae_disciplinePlaceholder}
                  className="input"
                  disabled={!canEdit}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow">{m.ae_rank}</span>
                <input
                  name="rank"
                  type="number"
                  min="1"
                  defaultValue={athlete.rank ?? ""}
                  className="input"
                  disabled={!canEdit}
                />
                <span className="text-[11px] text-faint">{m.ae_rankHint}</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow">{m.ae_podiums}</span>
                <input
                  name="podium_count"
                  type="number"
                  min="0"
                  defaultValue={athlete.podiumCount}
                  className="input"
                  disabled={!canEdit}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow">{m.ae_frames}</span>
                <input
                  name="frames_per_season"
                  type="number"
                  min="0"
                  defaultValue={athlete.framesPerSeason}
                  className="input"
                  disabled={!canEdit}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow">{m.status}</span>
                <select name="status" defaultValue={athlete.status} className="input" disabled={!canEdit}>
                  <option value="active">{m.active}</option>
                  <option value="inactive">{m.inactive}</option>
                </select>
              </label>

              {canEdit && (
                <div className="col-span-1 sm:col-span-2">
                  <SaveButton label={m.ae_saveProfile} />
                </div>
              )}
            </div>
          </form>
        </section>

        {/* ---------- 360° photos (admin upload) ---------- */}
        {canEdit && (
          <Athlete360Admin
            athleteId={athlete.id}
            currentFrames={media360.frames}
            isPlaceholder={media360.isPlaceholder}
            initialAutospin={media360.autospin}
            initialCrossfade={media360.crossfade}
            m={m}
          />
        )}

        {/* ---------- Body zones ---------- */}
        <section className="card p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text">{m.ae_zones}</h2>
          </div>
          <p className="mb-2 text-xs text-muted">{m.ae_zonesHint}</p>
          {canPricing ? (
            <p className="mb-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] text-muted">
              {m.ae_overrideNote}
            </p>
          ) : (
            <p className="mb-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
              {m.ae_pricingReadonly}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="th">{m.ae_zone}</th>
                  <th className="th">{m.ae_effectivePrice}</th>
                  <th className="th text-center">{m.ae_offered}</th>
                  <th className="th text-center">{m.ae_exclusive}</th>
                  <th className="th">{m.status}</th>
                  {canPricing && <th className="th text-right">{m.action}</th>}
                </tr>
              </thead>
              <tbody>
                {athlete.zones.map((z) => (
                  <ZoneRow
                    key={z.zoneId}
                    z={z}
                    athleteId={athlete.id}
                    athleteName={athlete.nama}
                    canPricing={canPricing}
                    statusTone={z.status ? ZONE_TONE[z.status] : "gray"}
                    statusLabel={zoneStatusLabel(z.status)}
                    m={m}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------- Race history ---------- */}
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold text-text">{m.ae_races}</h2>
          <p className="mb-3 text-xs text-muted">{m.ae_racesHint}</p>

          {canEdit && (
            events.length === 0 ? (
              <p className="mb-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
                {m.ae_noEvents}
              </p>
            ) : (
              <form
                action={addAthleteRace}
                className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-[1fr_120px_auto_auto]"
              >
                <input type="hidden" name="athlete_id" value={athlete.id} />
                <select name="event_id" required className="input" defaultValue="">
                  <option value="" disabled>{m.ae_event}…</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nama} · {formatDayMonth(e.date)}
                    </option>
                  ))}
                </select>
                <input
                  name="placement"
                  type="number"
                  min="1"
                  placeholder={m.ae_placement}
                  className="input"
                  title={m.ae_placementHint}
                />
                <label className="flex items-center gap-2 px-1 text-sm text-muted">
                  <input type="checkbox" name="is_podium" className="h-4 w-4 accent-accent" />
                  {m.ae_podium}
                </label>
                <button type="submit" className="btn btn-primary whitespace-nowrap">
                  <Plus size={16} /> {m.ae_addRace}
                </button>
              </form>
            )
          )}

          {athlete.races.length === 0 ? (
            <p className="text-sm text-faint">{m.ae_noRaces}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {athlete.races.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-text">{r.event}</span>
                      {r.isPodium && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(183,121,31,0.14)] px-2 py-0.5 text-[11px] font-medium text-amber">
                          <Trophy size={11} />
                          {r.placement ? `#${r.placement}` : m.ae_podium}
                        </span>
                      )}
                      {!r.isPodium && r.placement && (
                        <span className="tabnum text-xs text-muted">#{r.placement}</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-faint">
                      {r.venue} · {formatDayMonth(r.date)}
                    </div>
                  </div>
                  {canEdit && (
                    <form action={deleteAthleteRace} className="shrink-0">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="athlete_id" value={athlete.id} />
                      <ConfirmButton
                        message={fmt(m.ae_confirmRemoveRace, { event: r.event, name: athlete.nama })}
                        className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                      >
                        <Trash2 size={13} /> {m.ae_removeRace}
                      </ConfirmButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SourceBadge({ isOverride, m }: { isOverride: boolean; m: Dict }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        isOverride ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"
      }`}
    >
      {isOverride ? m.ae_srcCustom : m.ae_srcBase}
    </span>
  );
}

function ZoneRow({
  z,
  athleteId,
  athleteName,
  canPricing,
  statusTone,
  statusLabel,
  m,
}: {
  z: AdminZoneRow;
  athleteId: string;
  athleteName: string;
  canPricing: boolean;
  statusTone: BadgeTone;
  statusLabel: string;
  m: Dict;
}) {
  const [editing, setEditing] = useState(false);
  const isTaken = z.status === "terisi";
  const formId = `zone-${z.zoneId}`;

  if (!canPricing) {
    return (
      <tr className="border-b border-border/60 last:border-0">
        <td className="td font-medium">{z.nama}</td>
        <td className="td">
          <span className="tabnum">{formatIDR(z.effectivePrice)}</span>{" "}
          <SourceBadge isOverride={z.isOverride} m={m} />
        </td>
        <td className="td text-center text-muted">{z.active ? "✓" : "—"}</td>
        <td className="td text-center text-muted">{z.exclusive ? "✓" : "—"}</td>
        <td className="td"><Badge tone={statusTone}>{statusLabel}</Badge></td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/60 last:border-0 align-top">
      <td className="td font-medium">{z.nama}</td>

      {/* Effective price + source, with edit / reset */}
      <td className="td">
        {editing ? (
          <form action={setAthleteZonePrice} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="athlete_id" value={athleteId} />
            <input type="hidden" name="zone_id" value={z.zoneId} />
            <input
              name="price"
              type="number"
              min="0"
              step="1"
              defaultValue={z.effectivePrice}
              autoFocus
              className="input w-32 tabnum"
            />
            <button type="submit" className="text-xs font-medium text-accent hover:underline">{m.ae_savePrice}</button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:text-text">{m.ae_cancel}</button>
          </form>
        ) : (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="tabnum">{formatIDR(z.effectivePrice)}</span>
              <SourceBadge isOverride={z.isOverride} m={m} />
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-accent hover:underline">
                {m.ae_editPrice}
              </button>
              {z.isOverride && (
                <form action={resetAthleteZonePrice} className="inline">
                  <input type="hidden" name="athlete_id" value={athleteId} />
                  <input type="hidden" name="zone_id" value={z.zoneId} />
                  <ConfirmButton
                    message={fmt(m.ae_confirmResetPrice, { zone: z.nama, name: athleteName })}
                    className="text-xs text-muted hover:text-text"
                  >
                    {m.ae_resetPrice}
                  </ConfirmButton>
                </form>
              )}
            </div>
            {z.isOverride && (
              <span className="text-[11px] text-faint">
                {fmt(m.ae_catalogRef, { price: formatIDRCompact(z.catalogPrice) })}
              </span>
            )}
          </div>
        )}
      </td>

      {/* Offered / Exclusive / Status / Save (active + exclusive only) */}
      <td className="td text-center">
        <form id={formId} action={upsertAthleteZone}>
          <input type="hidden" name="athlete_id" value={athleteId} />
          <input type="hidden" name="zone_id" value={z.zoneId} />
          {isTaken && <input type="hidden" name="active" value="on" />}
        </form>
        {isTaken ? (
          <span className="text-xs text-amber" title={m.ae_zoneTakenNote}>🔒</span>
        ) : (
          <input form={formId} name="active" type="checkbox" defaultChecked={z.active} className="h-4 w-4 accent-accent" />
        )}
      </td>
      <td className="td text-center">
        <input form={formId} name="exclusive" type="checkbox" defaultChecked={z.exclusive} className="h-4 w-4 accent-accent" />
      </td>
      <td className="td"><Badge tone={statusTone}>{statusLabel}</Badge></td>
      <td className="td text-right">
        <button type="submit" form={formId} className="text-xs font-medium text-accent hover:underline">
          {m.ae_saveZone}
        </button>
      </td>
    </tr>
  );
}
