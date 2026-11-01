"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ReinforceBox, NO_EXTRA_LEFT_TEXT } from "@/components/level-check/reinforce-box";
import { httpLevelApi, type LevelApi } from "@/lib/level-check/types";
import {
  buildMapUnit,
  buildPlan,
  capacity,
  formatHours,
  masteryView,
  totalsSentence,
  UNIT_PCT_NOTE,
  type MapUnit,
  type PlanEntry,
  type MapUnitInput,
  type MasteryView,
} from "@/lib/mastery-map/plan";
import "@/styles/level-check.css";

const LEVEL_TEXT = { zayif: "Zayıf", orta: "Orta", iyi: "Biliyorum" } as const;

function tone(view: MasteryView): "none" | "low" | "mid" | "high" {
  if (view.pct == null) return "none";
  if (view.pct < 40) return "low";
  if (view.pct < 75) return "mid";
  return "high";
}

export function masteryText(view: MasteryView): string {
  if (view.pct == null) return view.label;
  return `Bu konuya %${view.pct} hakimsin · ${view.label}`;
}

function UnitCell({ unit, open, onToggle }: { unit: MapUnit; open: boolean; onToggle: () => void }) {
  return (
    <li className="mm-unit" data-tone={tone(unit.view)} data-testid="mm-unit">
      <button type="button" className="mm-unit-btn" aria-expanded={open} onClick={onToggle}>
        <span className="mm-title">{unit.title}</span>
        <span className="mm-pct" data-testid="mm-unit-label">{masteryText(unit.view)}</span>
        {unit.selfRating && unit.levelSource !== "self" ? <span className="mm-self">Kendi işaretin: {LEVEL_TEXT[unit.selfRating]} · plan hakimiyetine göre sıralandı</span> : null}
        {unit.levelSource === "self" && unit.level ? <span className="mm-self">Kendi işaretin: {LEVEL_TEXT[unit.level]}</span> : null}
      </button>
      {open ? (
        <ul className="mm-outcomes" data-testid="mm-outcomes">
          {unit.outcomes.map((o) => {
            const v = masteryView(o.state);
            return (
              <li key={o.outcomeId} data-tone={tone(v)}>
                <b>{o.code}</b> {o.text.length > 120 ? `${o.text.slice(0, 120)}…` : o.text}
                <span className="mm-pct">{masteryText(v)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function EntryRow({ e, later = false }: { e: PlanEntry; later?: boolean }) {
  const part = e.partial
    ? later
      ? ` · kalan ${e.outcomes.length} kazanım`
      : ` · ${e.unit.outcomes.length} kazanımdan en zayıf ${e.outcomes.length} kazanım`
    : "";
  return (
    <li>
      <span>{e.unit.title}</span>{" "}
      <span className="mm-pct">
        {formatHours(e.minutes)}
        {part}
        {e.unit.level === "zayif" ? " · Zayıf" : e.unit.level === "iyi" ? " · Biliyorum" : ""}
      </span>
    </li>
  );
}

/**
 * Hakimiyet Haritası + Kişisel Program (Plan PR 4). Tarama, Ünite Seviye Kontrolü ve pekiştirme yanıtlarından
 * (outcome_mastery) beslenir; plan kalan gün × günlük dakika kapasitesine göre deterministik kurulur.
 */
export function MasteryMap({
  prepId,
  units: inputs,
  daysLeft,
  dailyMinutes,
  api = httpLevelApi,
}: {
  prepId: string;
  units: MapUnitInput[];
  daysLeft: number | null;
  dailyMinutes: number | null;
  api?: LevelApi;
}) {
  const router = useRouter();
  const units = useMemo(() => inputs.map(buildMapUnit), [inputs]);
  const plan = useMemo(() => buildPlan(units, capacity(daysLeft, dailyMinutes)), [units, daysLeft, dailyMinutes]);
  const [open, setOpen] = useState<string | null>(null);
  const [reinforce, setReinforce] = useState<string | null>(null);
  const weakUnits = units.filter((u) => u.weakOutcomes.length > 0);
  // Öneri yalnız şu an gerçekten sunulabilecek ek sorusu olan ünitelerde (söz = teslim).
  const offerUnits = weakUnits.filter((u) => u.extraTotal > 0);
  const reinforceUnit = units.find((u) => u.unitId === reinforce) ?? null;

  return (
    <section className="lc-box mm" aria-label="Hakimiyet Haritası" data-testid="mastery-map">
      <p className="lc-kicker">Hakimiyet Haritası</p>
      <p className="lc-status">Renkler tarama, ünite kontrolü ve pekiştirme yanıtlarından gelir. Üniteye dokun, kazanımlarını gör.</p>
      <p className="lc-status" data-testid="mm-note">{UNIT_PCT_NOTE}</p>
      <ul className="mm-grid">
        {units.map((u) => (
          <UnitCell key={u.unitId} unit={u} open={open === u.unitId} onToggle={() => setOpen(open === u.unitId ? null : u.unitId)} />
        ))}
      </ul>

      {weakUnits.length ? (
        <div className="mm-weak">
          <p className="lc-kicker">Pekiştirme önerisi</p>
          {offerUnits.length ? (
            <ul className="mm-chips">
              {offerUnits.map((u) => (
                <li key={u.unitId}>
                  <button type="button" className="lc-skip" onClick={() => setReinforce(u.unitId)}>
                    {u.title}: {u.extraOutcomes.length} kazanım · {u.extraTotal} ek soru
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="lc-status" data-testid="mm-no-extra">{NO_EXTRA_LEFT_TEXT}</p>
          )}
          {reinforceUnit ? (
            <ReinforceBox
              key={reinforceUnit.unitId}
              prepId={prepId}
              unitId={reinforceUnit.unitId}
              unitTitle={reinforceUnit.title}
              api={api}
              onDone={() => {
                setReinforce(null);
                router.refresh();
              }}
            />
          ) : null}
        </div>
      ) : null}

      <div className="mm-plan" data-testid="personal-plan">
        <p className="lc-kicker">Kişisel program</p>
        <p className="lc-q" data-testid="plan-totals">{totalsSentence(plan)}</p>
        {plan.capacity ? (
          <p className="lc-status">
            {plan.capacity.days} gün × {plan.capacity.dailyMinutes} dk. Süreler tahminidir: kazanım başına Zayıf 40, Orta 30,
            Biliyorum 20 dk (5–8 soru × 3–5 dk + kısa tekrar). Sıra: önce zayıf, sonra kazanım sayısı çok olan; Biliyorum en sonda.
          </p>
        ) : null}
        <ol className="mm-list" data-testid="plan-list">
          {plan.planned.map((e) => <EntryRow key={e.unit.unitId} e={e} />)}
        </ol>
        {plan.ifTime.length ? (
          <>
            <p className="lc-kicker">Zaman kalırsa</p>
            <ul className="mm-list" data-testid="plan-if-time">
              {plan.ifTime.map((e) => <EntryRow key={e.unit.unitId} e={e} later />)}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}
