"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { ArrowRight, X } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";
import { CortexMark } from "@/components/brand/cortex-mark";
import { fileFindings, ScanCore, ScanFindings, useScanMoment, type ScanFinding } from "@/components/learning/scan-core";
import { guestFileProblem, holdGuestDocuments, pickGuestFiles, purgeStaleGuestDocuments } from "@/lib/documents/guest-handoff";
import { DOCUMENT_UPLOAD_ACCEPT } from "@/lib/documents/upload-accept";
import { clearTourProgress, readTourProgress, type TourProgress } from "@/lib/marketing/guest-tour-progress";
import {
  FIRST_STEP_CORE_TITLE,
  FIRST_STEP_SOLVE_HREF,
  FIRST_STEP_UPLOAD_HREF,
  firstStepGreeting,
  firstStepPlan,
} from "@/lib/student/first-step";
import { TOUR_RESUME_LINE, tourReachedRoadmap, tourResumeHref } from "@/lib/student/tour-resume";
import "@/styles/first-step-launcher.css";

const HIDE_KEY = "cp:first-step:hidden";

/**
 * Ana sayfada, henüz hazırlığı olmayan öğrenciye kişiselleştirilmiş ilk adım (7 Kasım 2026; 19 Ekim'deki tek kartın
 * yerine). Başlık öğrencinin sınıfı ve hedef sınavıyla; üç büyük kapı: notunu yükle, hazır müfredattan başla (düzeyine
 * göre ders çipleri), çözemediğin soruyu çek. "Şimdilik gizle" yalnız bu sekme oturumu için; ilk hazırlık kurulunca
 * kart zaten görünmez. Sohbet kutusu altta durur, engellenmez.
 */
export function FirstStepLauncher({
  firstName,
  gradeLevel,
  goalText,
}: {
  firstName?: string | null;
  gradeLevel?: string | null;
  goalText?: string | null;
}) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(HIDE_KEY) === "1") setHidden(true);
    } catch {
      /* depolama kapalıysa kart her zaman görünür */
    }
  }, []);
  if (hidden) return null;

  const plan = firstStepPlan({ gradeLevel, goalText });

  function hide() {
    setHidden(true);
    try {
      sessionStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="cp-first-step" aria-labelledby="cp-first-step-title">
      <TourResumeCard gradeLevel={gradeLevel} goalText={goalText} />
      <div className="cp-first-step-head">
        <h2 id="cp-first-step-title" className="cp-first-step-title">
          {firstStepGreeting(firstName, plan.targetLabel)}
        </h2>
        <button type="button" className="cp-first-step-hide" onClick={hide} aria-label="Şimdilik gizle">
          <X className="h-4 w-4" aria-hidden />
          <span>Şimdilik gizle</span>
        </button>
      </div>

      <div className="cp-first-step-grid">
        <UploadDoor />

        <div className="cp-first-step-card cp-first-step-card--curriculum">
          <Icon3D name="mufredat" size={44} />
          <strong>⚡ Dosya yüklemeden hazır müfredatla başla</strong>
          <span>{plan.curriculumBody}</span>
          {plan.chips.length ? (
            <div className="cp-first-step-chips" aria-label="Hızlı ders seçimi">
              {plan.chips.map((chip) => (
                <Link key={chip.label} href={chip.href} className="cp-first-step-chip">
                  {chip.label}
                </Link>
              ))}
            </div>
          ) : null}
          <Link href={plan.curriculumHref} className="cp-first-step-main">
            Müfredattan başla <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <Link href={FIRST_STEP_SOLVE_HREF} className="cp-first-step-card">
          <Icon3D name="alistirma" size={44} />
          <strong>📸 Çözemediğin sorunun fotoğrafını çek</strong>
          <span>Takıldığın soruyu ya da kendi el yazısı çözümünü yükle; nerede hata yaptığını satır satır bulalım.</span>
          <em>
            Soruyu çöz <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </em>
        </Link>
      </div>
    </section>
  );
}

/**
 * "Not yükle" kapısı (C2, 13 Kasım 2026). Görseli uygulama içi tarama çekirdeği; iki yol var:
 *
 * - Çekirdeğe dosya bırakılır ya da dokunulup seçilir: dosya sunucuya GİTMEZ, tarayıcıda bekler (misafir dosya
 *   köprüsü, `guest-handoff.ts`; oturum açmış öğrencide de aynı sekme oturumu + IndexedDB). Kısa tarama anından sonra
 *   kuruluma gidilir; materyal adımındaki "Bu dosyayı ekle" kartı dosyayı öğrencinin dokunuşuyla bildiğimiz yükleme
 *   yoluna verir. An yalnız görsel: dosya saklanır saklanmaz ve an bitince (ya da atlanınca) gidilir.
 * - Metne dokunmak bugünkü bağlantıdır: doğrudan kurulum.
 *
 * Bekletme sınırını (10 dosya, 100 MB) aşan dosyalar burada bekletilmez; kurulumun materyal adımında eklenir.
 */
function UploadDoor() {
  const scan = useScanMoment();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [findings, setFindings] = useState<ScanFinding[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    // Unutulan eski bekletmeler (2 saati geçmiş) cihazda kalmasın; süresi geçmemiş kayda dokunulmaz.
    void purgeStaleGuestDocuments();
    return () => {
      alive.current = false;
    };
  }, []);

  async function take(list: readonly File[]) {
    if (!list.length || busy) return;
    // Türü ya da boyutu okunamayan dosyanın cümlesi gösterilir; bekletme sınırı burada söylenmez (dosyalar kurulumda
    // eklenir, oradaki yükleme sınır tanımıyor).
    const rejected = list.map((file) => guestFileProblem(file)).filter((problem): problem is string => Boolean(problem));
    const { accepted } = pickGuestFiles(list.filter((file) => !guestFileProblem(file)));
    setProblems(rejected);
    if (!accepted.length) return;
    setBusy(true);
    setFindings(fileFindings(accepted));
    let held = false;
    let shown = false;
    const go = () => {
      if (held && shown && alive.current) linkRef.current?.click();
    };
    scan.play(() => {
      shown = true;
      go();
    });
    try {
      await holdGuestDocuments(accepted);
    } finally {
      held = true;
      go();
    }
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) return;
    event.preventDefault();
    setOver(true);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    setOver(false);
    void take([...event.dataTransfer.files]);
  }

  return (
    <div
      className="cp-first-step-card cp-first-step-card--upload"
      data-over={over || undefined}
      data-scanning={scan.playing || undefined}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <button
        type="button"
        className="cp-first-step-core"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => inputRef.current?.click()}
      >
        <ScanCore playing={scan.playing} size="s" />
        <span className="cp-first-step-core-title">{FIRST_STEP_CORE_TITLE}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={DOCUMENT_UPLOAD_ACCEPT}
        className="cp-first-step-input"
        tabIndex={-1}
        aria-hidden
        data-first-step-input
        onChange={(event) => {
          void take(event.target.files ? [...event.target.files] : []);
          event.target.value = "";
        }}
      />
      {busy ? <ScanFindings items={findings} /> : null}
      {problems.length ? (
        <ul className="cp-first-step-problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      <Link ref={linkRef} href={FIRST_STEP_UPLOAD_HREF} className="cp-first-step-card-link">
        <strong>{"📄 Kendi ders notunu, PDF'ini ya da fotoğrafını yükle"}</strong>
        <span>Defter fotoğrafını, hocanın slaytını ya da çıkmış soruları yükle; notundaki kurallara birebir sadık bir çalışma yolu kuralım.</span>
        <em>
          Notunu yükle <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </em>
      </Link>
    </div>
  );
}

/**
 * Turdan kayda süreklilik (C3, 13 Kasım 2026, ürün sahibinin kararı): misafir ana sayfanın turunda yol haritasına
 * kadar geldiyse (bu sekmenin kaydı, `guest-tour-progress.ts`) tek kart. Dokununca turdaki konu resmî kurulumda seçili
 * açılır (`tourResumeHref`); kart kullanılınca ya da gizlenince kayıt silinir. Turdaki cevaplar ölçüm sayılmaz.
 */
function TourResumeCard({ gradeLevel, goalText }: { gradeLevel?: string | null; goalText?: string | null }) {
  const [progress, setProgress] = useState<TourProgress | null>(null);
  const titleId = useId();
  useEffect(() => {
    setProgress(readTourProgress());
  }, []);
  if (!progress || !tourReachedRoadmap(progress)) return null;
  const href = tourResumeHref({ segment: progress.segment, gradeLevel, goalText });

  function hide() {
    clearTourProgress();
    setProgress(null);
  }

  return (
    <div className="cp-first-step-tour" data-tour-resume>
      <Link href={href} className="cp-first-step-tour-go" onClick={() => clearTourProgress()}>
        <span className="cp-first-step-tour-mark" aria-hidden>
          <CortexMark size={20} />
        </span>
        <strong id={titleId}>{TOUR_RESUME_LINE}</strong>
        <ArrowRight className="cp-first-step-tour-arrow h-4 w-4" aria-hidden />
      </Link>
      <button type="button" className="cp-first-step-hide" onClick={hide} aria-describedby={titleId}>
        <X className="h-4 w-4" aria-hidden />
        <span>Şimdilik gizle</span>
      </button>
    </div>
  );
}
