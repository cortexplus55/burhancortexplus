"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PrepCard, type ExamPrepCard } from "@/components/parity/exam-prep";
import { ListFilterChips, ListFilterEmpty, ListSearchBox } from "@/components/ui/list-filter";
import {
  EMPTY_PREP_FILTER,
  filterPrepCards,
  isPrepFilterActive,
  prepSubjects,
  type PrepFilter,
} from "@/lib/learning/prep-card-filter";

/** Ders süzgecinin "hepsi" seçeneği; gerçek bir sınav türüyle çakışmayan iç değer. */
const ALL_SUBJECTS = "__all__";

/**
 * "Sınav hazırlıklarım" — kıyas ürünündeki ayrı sayfa (1 Ekim 2026): bütün
 * hazırlıklar, Yaklaşan / Geçmiş. Ana liste yalnız son birkaçını gösteriyor. 20 Kasım 2026 (Faz 3): hazırlık
 * adında ve sınav türünde anlık arama, sınav/ders süzgeci; sekme sayıları süzülmüş listeden.
 */
export function MyPrepsView({ cards, userInitial }: { cards: ExamPrepCard[]; userInitial: string }) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [filter, setFilter] = useState<PrepFilter>(EMPTY_PREP_FILTER);
  const subjects = useMemo(() => prepSubjects(cards), [cards]);
  const filtered = useMemo(() => filterPrepCards(cards, filter), [cards, filter]);
  const filterActive = isPrepFilterActive(filter);
  const upcoming = filtered.filter((card) => !card.past);
  const past = filtered.filter((card) => card.past);
  const shown = tab === "upcoming" ? upcoming : past;
  const joins = cards.reduce((sum, card) => sum + (card.joinCount ?? 0), 0);

  return (
    <div className="cp-exam-page cp-exam-page--list cp-my-preps">
      <header className="cp-my-preps-head">
        <span className="cp-my-preps-avatar" aria-hidden>
          {userInitial}
        </span>
        <h1>Sınav hazırlıklarım</h1>
        <p>
          {cards.length} hazırlık
          {joins > 0 ? ` · ${joins} katılım` : ""}
        </p>
      </header>

      {cards.length ? (
        <div className="cx-list-filter cp-my-preps-filter" data-testid="preps-filter">
          <ListSearchBox
            value={filter.query}
            onChange={(query) => setFilter((current) => ({ ...current, query }))}
            label="Hazırlıklarda ara"
            placeholder="Hazırlık adı ya da sınav türü"
          />
          {subjects.length > 1 ? (
            <ListFilterChips
              label="Sınav ya da derse göre süz"
              options={[{ id: ALL_SUBJECTS, label: "Tümü" }, ...subjects.map((subject) => ({ id: subject, label: subject }))]}
              value={filter.subject ?? ALL_SUBJECTS}
              onChange={(subject) =>
                setFilter((current) => ({ ...current, subject: subject === ALL_SUBJECTS ? null : subject }))
              }
            />
          ) : null}
        </div>
      ) : null}

      <div className="cp-my-preps-tabs" role="tablist" aria-label="Hazırlıklar">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "upcoming"}
          className={tab === "upcoming" ? "is-on" : undefined}
          onClick={() => setTab("upcoming")}
        >
          Yaklaşan ({upcoming.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "past"}
          className={tab === "past" ? "is-on" : undefined}
          onClick={() => setTab("past")}
        >
          Geçmiş ({past.length})
        </button>
      </div>

      {shown.length ? (
        <div className="cp-my-preps-grid">
          {shown.map((card, index) => (
            <PrepCard key={card.id} card={card} showTargetLabel={index === 0} />
          ))}
        </div>
      ) : filterActive ? (
        <ListFilterEmpty title="Aramana uyan hazırlık yok" onClear={() => setFilter(EMPTY_PREP_FILTER)} />
      ) : (
        <p className="cp-upload-hint">
          {tab === "upcoming"
            ? "Yaklaşan sınavın yok. Yeni bir hazırlık kurabilirsin."
            : "Sınav günü geçmiş bir hazırlığın yok."}
        </p>
      )}

      <Link href="/deneme-sinavlari/olustur" className="cp-exam-create cp-my-preps-new">
        + Yeni hazırlık
      </Link>
    </div>
  );
}
