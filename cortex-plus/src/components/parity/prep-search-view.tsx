"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  newestPreps,
  popularPreps,
  searchOwners,
  searchPreps,
  searchSubjects,
  type PrepSearchRow,
} from "@/lib/parity/prep-search";
import { joinSchoolPrep } from "@/lib/parity/school-join";

const SUBJECTS_SHOWN = 10;

/** "Sınav hazırlıklarında ara" — Astra'daki arama sayfası (1 Ekim 2026). */
export function PrepSearchView({ rows, hasSchool }: { rows: PrepSearchRow[]; hasSchool: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [allSubjects, setAllSubjects] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  const subjects = useMemo(() => searchSubjects(rows), [rows]);
  const owners = useMemo(() => searchOwners(rows), [rows]);
  const popular = useMemo(() => popularPreps(rows), [rows]);
  const newest = useMemo(() => newestPreps(rows), [rows]);
  const filtering = Boolean(query.trim() || subject || owner);
  const results = useMemo(
    () =>
      searchPreps(rows, query).filter(
        (row) => (!subject || row.examType === subject) && (!owner || row.ownerKey === owner),
      ),
    [rows, query, subject, owner],
  );

  async function join(prepId: string) {
    setJoining(prepId);
    try {
      const joined = await joinSchoolPrep(prepId);
      if (joined.alreadyJoined) toast.info("Bu hazırlığa zaten katılmıştın.");
      router.push(`/deneme-sinavlari/${joined.id}`);
    } catch {
      toast.error("Katılamadın. Lütfen tekrar dene.");
      setJoining(null);
    }
  }

  const card = (row: PrepSearchRow) => (
    <li key={row.id} className="cp-school-item">
      <div className="cp-school-item-head">
        <span className="cp-school-avatar" aria-hidden>
          {(row.isOwn ? "S" : row.ownerName.slice(0, 1)).toLocaleUpperCase("tr")}
        </span>
        <span className="cp-school-owner">{row.isOwn ? "Sen" : row.ownerName}</span>
      </div>
      {row.examType ? <span className="cp-school-subject">{row.examType}</span> : null}
      <h3 className="cp-school-title">{row.title}</h3>
      <div className="cp-school-item-foot">
        <span className="cp-school-views">
          {row.joinCount > 0 ? (
            <>
              <Users className="h-3 w-3" aria-hidden />
              {row.joinCount} katılım
            </>
          ) : null}
        </span>
        {row.isOwn ? (
          <Link href={`/deneme-sinavlari/${row.id}`} className="cp-chip">
            Aç
          </Link>
        ) : (
          <button
            type="button"
            className="cp-exam-discover-cta"
            disabled={joining === row.id}
            onClick={() => void join(row.id)}
          >
            {joining === row.id ? "Katılıyor…" : "Katıl"}
          </button>
        )}
      </div>
    </li>
  );

  const shownSubjects = allSubjects ? subjects : subjects.slice(0, SUBJECTS_SHOWN);

  return (
    <div className="cp-exam-page cp-psearch">
      <header className="cp-psearch-head">
        <h1>Sınav hazırlıklarında ara</h1>
        <Link href="/deneme-sinavlari/olustur" className="cp-exam-create">
          + Yeni hazırlık
        </Link>
      </header>

      <label className="cp-exam-search cp-psearch-input">
        <Search className="h-4 w-4" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Başlık, ders ya da oluşturana göre ara"
          aria-label="Hazırlıklarda ara"
          type="search"
        />
      </label>

      {subjects.length ? (
        <section aria-labelledby="psearch-subjects">
          <h2 id="psearch-subjects" className="cp-psearch-title">
            Derse göre
          </h2>
          <div className="cp-filter-chips">
            {shownSubjects.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={subject === item}
                className={cn("cp-filter-chip", subject === item && "cp-filter-chip--on")}
                onClick={() => setSubject(subject === item ? null : item)}
              >
                {item}
              </button>
            ))}
            {subjects.length > SUBJECTS_SHOWN ? (
              <button type="button" className="cp-filter-chip" onClick={() => setAllSubjects((value) => !value)}>
                {allSubjects ? "Daha az" : "Daha fazla"}
                <ChevronDown className={cn("ml-1 inline h-3 w-3", allSubjects && "rotate-180")} aria-hidden />
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {owners.length ? (
        <section aria-labelledby="psearch-owners">
          <h2 id="psearch-owners" className="cp-psearch-title">
            Oluşturanlara göre
          </h2>
          <ul className="cp-psearch-owners">
            {owners.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  aria-pressed={owner === item.key}
                  className={cn("cp-psearch-owner", owner === item.key && "is-on")}
                  onClick={() => setOwner(owner === item.key ? null : item.key)}
                >
                  <span className="cp-school-avatar" aria-hidden>
                    {item.name.slice(0, 1).toLocaleUpperCase("tr")}
                  </span>
                  <span>{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {filtering ? (
        <section aria-labelledby="psearch-results">
          <h2 id="psearch-results" className="cp-psearch-title">
            Sonuçlar ({results.length})
          </h2>
          {results.length ? (
            <ul className="cp-school-list">{results.map(card)}</ul>
          ) : (
            <p className="cp-upload-hint">Bu aramaya uyan hazırlık yok.</p>
          )}
        </section>
      ) : (
        <>
          {popular.length ? (
            <section aria-labelledby="psearch-popular">
              <h2 id="psearch-popular" className="cp-psearch-title">
                Okulunda popüler
              </h2>
              <ul className="cp-school-list">{popular.map(card)}</ul>
            </section>
          ) : null}
          {newest.length ? (
            <section aria-labelledby="psearch-newest">
              <h2 id="psearch-newest" className="cp-psearch-title">
                Yeni eklenenler
              </h2>
              <ul className="cp-school-list">{newest.map(card)}</ul>
            </section>
          ) : null}
          {!popular.length && !newest.length ? (
            <p className="cp-upload-hint">
              {hasSchool
                ? "Okulunda henüz paylaşılan hazırlık yok. Kendi hazırlığını açıp menüden paylaşabilirsin."
                : "Okulunu seçtiğinde arkadaşlarının paylaştığı hazırlıklar da burada aranır."}{" "}
              {hasSchool ? null : (
                <Link href="/deneme-sinavlari" className="underline">
                  Okulunu seç
                </Link>
              )}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
