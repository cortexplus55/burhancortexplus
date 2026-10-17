"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import { cn } from "@/lib/utils";
import { clearExamWizardDraft, readExamWizardDraft } from "@/lib/learning/exam-wizard-draft";

export type ExamPrepCard = {
  id: string;
  title: string;
  examType?: string;
  progressPct: number;
  daysLabel: string;
  topicsDone: number;
  topicsTotal: number;
  targetScore: number | null;
  continueHref: string;
  /** Sınav günü geçti ("Geçmiş" sekmesi). */
  past?: boolean;
  /** Okulda paylaşıldıysa katılım sayısı. */
  joinCount?: number;
};

/**
 * Astra'nın sınav listesindeki üç kutu (17 Ekim 2026, yan yana bakıldı): her biri ayrı
 * sayfa açar. Önceden listenin altında aynı sayfada sekmeydiler.
 */
const CATALOG_TILES: { href: string; label: string; icon: Icon3DName }[] = [
  { href: "/deneme-sinavlari/okulum", label: "Okulum", icon: "okulum" },
  { href: "/deneme-sinavlari/mufredat", label: "Müfredat", icon: "mufredat" },
  { href: "/deneme-sinavlari/resmi", label: "Resmî sınavlar", icon: "resmi-sinavlar" },
];

export function ParityExamPrep({ cards }: { cards: ExamPrepCard[] }) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [howOpen, setHowOpen] = useState(false);
  const upcoming = cards.filter((card) => !card.past);
  const past = cards.filter((card) => card.past);
  const shown = tab === "upcoming" ? upcoming : past;

  return (
    <div className="cp-exam-page cp-exam-page--list">
      {/* Astra: tek şerit — solda Ara, sağda yeni hazırlık. */}
      <div className="cp-exam-toolbar">
        <Link href="/deneme-sinavlari/ara" className="cp-exam-toolbar-btn">
          <Search className="h-4 w-4" aria-hidden />
          Ara
        </Link>
        <Link href="/deneme-sinavlari/olustur" className="cp-exam-toolbar-btn">
          <Plus className="h-4 w-4" aria-hidden />
          Yeni hazırlık
        </Link>
      </div>

      <nav className="cp-catalog-tiles" aria-label="Hazır hazırlıklar">
        {CATALOG_TILES.map(({ href, label, icon }) => (
          <Link key={href} href={href} className="cp-catalog-tile">
            <span className="cp-catalog-tile-icon cp-catalog-tile-icon--3d" aria-hidden>
              <Icon3D name={icon} size={44} />
            </span>
            <span className="cp-catalog-tile-label">{label}</span>
          </Link>
        ))}
      </nav>

      {cards.length ? (
        <section className="cp-prep-row-section" aria-labelledby="my-preps-title">
          <div className="cp-prep-list-head">
            <h1 id="my-preps-title" className="cp-prep-row-title">
              {/* Başlık bütün hazırlıkların sayfasını açar. */}
              <Link href="/deneme-sinavlari/hazirliklarim">
                Sınav hazırlıklarım <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </h1>
            <div className="cp-prep-when" role="tablist" aria-label="Hazırlıklar">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "upcoming"}
                className={cn(tab === "upcoming" && "is-on")}
                onClick={() => setTab("upcoming")}
              >
                Yaklaşan
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "past"}
                className={cn(tab === "past" && "is-on")}
                onClick={() => setTab("past")}
              >
                Geçmiş
              </button>
            </div>
          </div>
          {shown.length ? (
            <div className="cp-prep-grid">
              {shown.map((card, index) => (
                <PrepCard key={card.id} card={card} showTargetLabel={index === 0} />
              ))}
            </div>
          ) : (
            <p className="cp-upload-hint">
              {tab === "upcoming"
                ? "Yaklaşan sınavın yok. Yeni bir hazırlık kurabilirsin."
                : "Sınav günü geçmiş bir hazırlığın yok."}
            </p>
          )}
        </section>
      ) : (
        <article className="cp-exam-active-card cp-exam-discover">
          <Icon3D name="bos-hazirlik" size={72} className="cp-empty-art" />
          <p className="cp-exam-discover-kicker">Henüz hazırlık yok</p>
          <h1 className="cp-exam-active-title">İlk sınav yolunu kur</h1>
          <p className="mt-2 text-sm text-[var(--cp-muted)]">
            Hedef sınavını söyle, konuları topla, kısa tanı testiyle seviyeni ölç — günlük yol otomatik açılır.
          </p>
          <ol className="cp-exam-discover-steps" aria-label="Nasıl başlanır">
            <li><strong>1</strong><span>Sınavı anlat</span></li>
            <li><strong>2</strong><span>Konu seç + tanı</span></li>
            <li><strong>3</strong><span>Yolda ilerle</span></li>
          </ol>
          <div className="cp-exam-active-footer">
            <button type="button" className="cp-exam-how cp-exam-how--ghost" onClick={() => setHowOpen(true)}>
              Nasıl çalışır?
            </button>
            <Link href="/deneme-sinavlari/olustur" className="cp-exam-continue cp-exam-continue--primary">
              Hazırlık oluştur
            </Link>
          </div>
        </article>
      )}

      <WizardDrafts />

      {howOpen ? (
        <div
          className="cp-exam-how-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exam-how-title"
          onClick={() => setHowOpen(false)}
        >
          <article className="cp-exam-how-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="cp-exam-how-head">
              <h2 id="exam-how-title">Nasıl çalışır</h2>
              <button type="button" aria-label="Kapat" onClick={() => setHowOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <ol className="cp-exam-how-steps">
              <li>
                <strong>Sınavını anlat</strong>
                <span>Sohbette neler çıkacağını söyle. Konular toplanır, sınav tarihini seçersin.</span>
              </li>
              <li>
                <strong>Hadi başlayalım</strong>
                <span>Bir konu seç. Kısa başlangıç soruları o konudaki seviyeni ölçer; sonra derse geçersin.</span>
              </li>
              <li>
                <strong>Yolda ilerle</strong>
                <span>Podcast, alıştırma, quiz, sözlü ve deneme önerilen sıradadır. İstediğin etkinliği istediğin zaman açabilirsin.</span>
              </li>
              <li>
                <strong>Ders bitince</strong>
                <span>Skorunu gör, eğitmenden kısa not al, sonraki düğüme geç.</span>
              </li>
            </ol>
            <Link
              href="/deneme-sinavlari/olustur"
              className="cp-exam-continue cp-exam-continue--primary"
              onClick={() => setHowOpen(false)}
            >
              Hazırlık oluştur
            </Link>
          </article>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Astra'daki "Taslaklar": yarım bırakılan kurulum, kaldığı yerden tamamlanır ya da atılır.
 * Bizde kurulum taslağı tarayıcıda (24 saat); sunucuda yarım hazırlık açılmıyor.
 */
function WizardDrafts() {
  const [draft, setDraft] = useState<{ name: string } | null>(null);

  useEffect(() => {
    const saved = readExamWizardDraft();
    if (!saved) return;
    const started = Boolean(saved.subject.trim() || saved.materials.length || saved.title?.trim());
    if (!started) return;
    setDraft({ name: saved.title?.trim() || saved.subject.trim() || "Adsız hazırlık" });
  }, []);

  if (!draft) return null;
  return (
    <section className="cp-prep-drafts" aria-label="Taslaklar">
      <h2 className="cp-prep-drafts-title">Taslaklar</h2>
      <div className="cp-prep-draft">
        <span className="cp-prep-draft-name">{draft.name}</span>
        <Link href="/deneme-sinavlari/olustur" className="cp-prep-draft-resume">
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Oluşturmayı tamamla
        </Link>
        <button
          type="button"
          className="cp-prep-draft-drop"
          aria-label="Taslağı sil"
          onClick={() => {
            clearExamWizardDraft();
            setDraft(null);
          }}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

/**
 * Astra'nın hazırlık kartı: üstte başlık ve hedef işaretli ilerleme çubuğu (noktalı ray,
 * ilerleme noktası, yüzde); altta ayrı şeritte gün · konu ve Devam et.
 */
export function PrepCard({ card, showTargetLabel }: { card: ExamPrepCard; showTargetLabel: boolean }) {
  const target =
    card.targetScore != null && card.targetScore > 0 && card.targetScore <= 100
      ? Math.min(100, Math.max(8, card.targetScore))
      : 75;
  const finished = card.topicsTotal > 0 && card.topicsDone === card.topicsTotal;
  return (
    <article className="cp-prep-card">
      <div className="cp-prep-card-body">
        <h2 className="cp-prep-card-title">{card.title}</h2>
        <div className="cp-prep-meter">
          <div className="cp-prep-meter-rail">
            {showTargetLabel ? (
              <span className="cp-exam-target-label" style={{ left: `${target}%` }}>
                hedef puan
              </span>
            ) : null}
            <span className="cp-prep-meter-fill" style={{ width: `${card.progressPct}%` }} />
            <span
              className={cn("cp-prep-meter-knob", card.progressPct > 0 && "is-moving")}
              style={{ left: `${card.progressPct}%` }}
              aria-hidden
            />
            <span className="cp-exam-target-marker" style={{ left: `${target}%` }} aria-hidden />
          </div>
          <span className="cp-prep-meter-pct">{card.progressPct}%</span>
        </div>
      </div>
      <div className="cp-prep-card-foot">
        <span className="cp-prep-card-meta">
          {card.daysLabel}
          <span aria-hidden> · </span>
          <strong>
            {card.topicsDone} / {card.topicsTotal}
          </strong>{" "}
          <small>konu</small>
        </span>
        <Link href={card.continueHref} className="cp-prep-card-go">
          {finished ? "Deneme çöz" : "Devam et"}
        </Link>
      </div>
    </article>
  );
}
