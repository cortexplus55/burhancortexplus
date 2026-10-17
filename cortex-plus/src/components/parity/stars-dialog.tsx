"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, ChevronDown, CircleHelp, MapPin, Star, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import "@/styles/stars.css";
import { STAR_RULES, STAR_SOURCE_LABEL, type StarSource } from "@/lib/stars/rules";
import {
  starsToTop,
  toLeaderboardRows,
  toMyStars,
  todayLine,
  type LeaderboardRow,
  type MyStars,
  type StarPeriod,
  type StarScope,
} from "@/lib/stars/view";

const SCOPES: { id: StarScope; label: string; icon: typeof Users; lead: string }[] = [
  { id: "school", label: "Okul arkadaşları", icon: Users, lead: "Okulundaki öğrencilerle sıralaman" },
  { id: "country", label: "Türkiye", icon: MapPin, lead: "Türkiye genelinde yıldızı olan herkese karşı sen" },
  { id: "schools", label: "Okullar", icon: Building2, lead: "Öğrencilerinin kazandığı yıldızlara göre okul sıralaması" },
];

const number = new Intl.NumberFormat("tr-TR");

/**
 * Yıldızlar penceresi (17 Ekim 2026, Astra'daki gibi; `?dialog=stars`). Bu haftanın
 * yıldızları, üç sıralama, Bu hafta / Tüm zamanlar, kazanç kaynakları ve kurallar.
 * Ürün sahibinin kararıyla öğrenci sıralamada adını gizleyebilir.
 */
export function StarsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [scope, setScope] = useState<StarScope>("school");
  const [period, setPeriod] = useState<StarPeriod>("week");
  const [me, setMe] = useState<MyStars | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [fallback, setFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [savingHidden, setSavingHidden] = useState(false);

  const load = useCallback(async (nextScope: StarScope, nextPeriod: StarPeriod) => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/stars?scope=${nextScope}&period=${nextPeriod}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { me: unknown; rows: unknown; fallback?: boolean };
      setMe(toMyStars(body.me));
      setRows(toLeaderboardRows(body.rows));
      setFallback(Boolean(body.fallback));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load(scope, period);
  }, [open, scope, period, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (helpOpen) setHelpOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, helpOpen, onClose]);

  async function toggleHidden(next: boolean) {
    setSavingHidden(true);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars_hidden: next }),
      });
      if (!res.ok) throw new Error();
      setMe((prev) => (prev ? { ...prev, hidden: next } : prev));
      toast.success(next ? "Adın artık başkalarının sıralamasında görünmüyor." : "Adın sıralamada görünüyor.");
      void load(scope, period);
    } catch {
      toast.error("Ayar kaydedilemedi.");
    } finally {
      setSavingHidden(false);
    }
  }

  if (!open) return null;
  const current = SCOPES.find((item) => item.id === scope)!;
  const need = scope === "schools" ? null : starsToTop(rows);
  const sources = period === "week" ? me?.sourcesWeek : me?.sourcesAll;
  const sourceRows = Object.entries(sources ?? {})
    .filter(([, amount]) => (amount ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) as [StarSource, number][];
  const noSchool = scope === "school" && me && !me.hasSchool;
  const aloneInSchool = scope === "school" && me?.hasSchool && rows.filter((row) => !row.isMe).length === 0;

  return (
    <div className="cp-stars-back" onClick={onClose}>
      <div
        className="cp-stars-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stars-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="cp-stars-head">
          <button type="button" className="cp-stars-round" aria-label="Kapat" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </button>
          <h2 id="stars-title">Yıldızlar</h2>
          <button type="button" className="cp-stars-round" aria-label="Nasıl yıldız kazanılır" onClick={() => setHelpOpen(true)}>
            <CircleHelp className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <section className="cp-stars-mine" aria-label="Bu haftaki yıldızların">
          <Star className="cp-stars-mine-icon" aria-hidden />
          <div>
            <p className="cp-stars-kicker">{period === "week" ? "Bu haftaki yıldızların" : "Bütün yıldızların"}</p>
            <p className="cp-stars-big">{number.format(period === "week" ? (me?.week ?? 0) : (me?.all ?? 0))}</p>
            <p className="cp-stars-sub">
              {need != null
                ? `İlk 20 arasına girmek için ${number.format(need)} yıldız`
                : fallback
                  ? "Bu haftanın sıralaması 3 kişi yıldız kazanınca başlar"
                  : todayLine(me?.today ?? 0)}
            </p>
          </div>
        </section>

        <div className="cp-stars-scopes" role="tablist" aria-label="Sıralama">
          {SCOPES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={scope === id}
              className={cn(scope === id && "is-on")}
              onClick={() => setScope(id)}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <div className="cp-stars-row-head">
          <p>{fallback ? "Bu hafta üç kişi yıldız kazanana kadar geçen haftanın kazananları" : current.lead}</p>
          <div className="cp-stars-period" role="tablist" aria-label="Dönem">
            <button type="button" role="tab" aria-selected={period === "week"} className={cn(period === "week" && "is-on")} onClick={() => setPeriod("week")}>
              Bu hafta
            </button>
            <button type="button" role="tab" aria-selected={period === "all"} className={cn(period === "all" && "is-on")} onClick={() => setPeriod("all")}>
              Tüm zamanlar
            </button>
          </div>
        </div>

        {noSchool ? (
          <div className="cp-stars-empty">
            <Users className="h-6 w-6" aria-hidden />
            <strong>Okulunu seç</strong>
            <span>Okul arkadaşlarınla sıralamada yer almak için okulunu ekle.</span>
            <Link href="/deneme-sinavlari/okulum" className="cp-stars-pill" onClick={onClose}>
              Okulumu seç
            </Link>
          </div>
        ) : aloneInSchool && !loading ? (
          <div className="cp-stars-empty">
            <Users className="h-6 w-6" aria-hidden />
            <strong>Okulundan ilk katılan sensin</strong>
            <span>Sınıf arkadaşlarını davet et, okul sıralamasında birlikte yarışın.</span>
            <Link href="/davet" className="cp-stars-pill" onClick={onClose}>
              Sınıf arkadaşlarını davet et
            </Link>
          </div>
        ) : failed ? (
          <p className="cp-stars-note">Sıralama şu an açılamadı. Biraz sonra yeniden dene.</p>
        ) : (
          <ol className={cn("cp-stars-list", loading && "is-loading")} aria-label={current.label}>
            {rows.map((row) => (
              <li key={`${row.rank}-${row.label}-${row.isMe}`} className={cn(row.isMe && "is-me")}>
                <span className="cp-stars-rank">{row.rank}</span>
                <span className="cp-stars-avatar" aria-hidden>
                  {scope === "schools" ? <Building2 className="h-4 w-4" /> : row.label.slice(0, 1)}
                </span>
                <span className="cp-stars-who">
                  <strong>
                    {row.label}
                    {row.isMe ? " (sen)" : ""}
                  </strong>
                  {scope === "schools" && row.students != null ? (
                    <span>{number.format(row.students)} öğrenci</span>
                  ) : row.detail ? (
                    <span>{row.detail}</span>
                  ) : null}
                </span>
                <span className="cp-stars-count">
                  <Star className="h-3.5 w-3.5" aria-hidden />
                  {number.format(row.stars)}
                  <span className="sr-only"> yıldız</span>
                </span>
              </li>
            ))}
            {!rows.length && !loading ? <li className="cp-stars-note">Henüz yıldız kazanan yok.</li> : null}
          </ol>
        )}

        <section className="cp-stars-sources">
          <button type="button" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((value) => !value)}>
            Yıldızlarını nereden kazandın
            <ChevronDown className={cn("h-4 w-4", sourcesOpen && "rotate-180")} aria-hidden />
          </button>
          {sourcesOpen ? (
            sourceRows.length ? (
              <ul>
                {sourceRows.map(([source, amount]) => (
                  <li key={source}>
                    <span>{STAR_SOURCE_LABEL[source] ?? source}</span>
                    <span className="cp-stars-count">
                      <Star className="h-3.5 w-3.5" aria-hidden />
                      {number.format(amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cp-stars-note">
                {period === "week" ? "Bu hafta henüz yıldız kazanmadın." : "Henüz yıldız kazanmadın."}
              </p>
            )
          ) : null}
        </section>

        <label className="cp-stars-hide">
          <input
            type="checkbox"
            checked={Boolean(me?.hidden)}
            disabled={!me || savingHidden}
            onChange={(event) => void toggleHidden(event.target.checked)}
          />
          <span>
            <strong>Sıralamada adımı gösterme</strong>
            <span>Yıldızların sayılmaya devam eder; adın yalnız senin listende görünür.</span>
          </span>
        </label>

        {helpOpen ? (
          <div className="cp-stars-help" role="dialog" aria-modal="true" aria-labelledby="stars-help-title">
            <header className="cp-stars-head">
              <button type="button" className="cp-stars-round" aria-label="Kapat" onClick={() => setHelpOpen(false)}>
                <X className="h-4 w-4" aria-hidden />
              </button>
              <h2 id="stars-help-title">Nasıl yıldız kazanılır</h2>
              <span />
            </header>
            <ul className="cp-stars-rules">
              {STAR_RULES.map((rule) => (
                <li key={rule.source}>
                  <span>
                    <strong>{rule.title}</strong>
                    <span>{rule.detail}</span>
                  </span>
                  <span className="cp-stars-count">
                    <Star className="h-3.5 w-3.5" aria-hidden />
                    {rule.amount}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Kazanç olunca üst çubuk sayısı tazelenir (sonuç ekranı bu olayı yayar). */
export const STARS_CHANGED_EVENT = "cp:stars-changed";

/**
 * Üst çubuktaki yıldız düğmesi (Astra: "Yıldızlar: bugün 11 / 50"). Bugünün sayısı
 * hafif uçtan okunur; pencere `?dialog=stars` ile açılır.
 */
export function StarsButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [today, setToday] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/stars?only=me", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { me: unknown };
      setToday(toMyStars(body.me).today);
    } catch {
      // Sayı gösterilmezse düğme yine çalışır.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(STARS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(STARS_CHANGED_EVENT, onChange);
  }, [refresh]);

  function open() {
    const params = new URLSearchParams(window.location.search);
    params.set("dialog", "stars");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const label = todayLine(today ?? 0);
  return (
    <button type="button" className="cp-stars-btn" aria-label={label} title={label} aria-haspopup="dialog" onClick={open}>
      <Star className="h-4 w-4" aria-hidden />
      {today != null ? <span>{today}</span> : null}
    </button>
  );
}
