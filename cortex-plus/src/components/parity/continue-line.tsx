import Link from "next/link";
import {
  AudioLines,
  BookOpenText,
  CalendarDays,
  CheckCheck,
  Clapperboard,
  Clock3,
  Crosshair,
  FileText,
  Flag,
  Layers,
  ListChecks,
  type LucideIcon,
  MessagesSquare,
  Mic,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { ContinueStep } from "@/lib/learning/prep-cards";
import { subjectLook } from "@/lib/ui/subject-look";

/** Adım türünün simgesi (yoldaki düğümlerle aynı anlam). */
const KIND_ICON: Record<string, LucideIcon> = {
  lesson: BookOpenText,
  quiz: ListChecks,
  final_check: ListChecks,
  true_false: CheckCheck,
  flashcards: Layers,
  spaced: RotateCcw,
  podcast: AudioLines,
  oral: Mic,
  qa: MessagesSquare,
  written_exam: FileText,
  focused: Crosshair,
  gaps: Crosshair,
  readiness: Flag,
  level: Flag,
  video: Clapperboard,
};

/** Halkanın çevresi (r = 27). */
const RING = 2 * Math.PI * 27;

/** "Sınava 35 gün"; telefonda "Sınava" gizlenir ("35 gün"), tam metin ekran okuyucuda kalır. */
function DaysLabel({ days }: { days: number }) {
  if (days <= 0) return <>Sınav bugün</>;
  if (days === 1) return <>Sınav yarın</>;
  return (
    <>
      <span className="cp-resume-days-long">Sınava </span>
      {days} gün
    </>
  );
}

/**
 * Ana ekranda "Kaldığın yerden devam" kartı.
 *
 * 8 Kasım 2026'da tek satır olarak geldi (geri dönen öğrenci devam etmek için Sınavlar'a gitmek zorundaydı); aynı gün
 * ürün sahibi "çok özensiz ve gösterişsiz; kullanıcı girdiğinde çok özel bir görünüm görsün" dedi. Kart artık
 * hazırlığın kimliğini (dersin simgesi, adı, sınava kalan gün), yolun ne kadarının bittiğini (sayfa açılınca dolan
 * halka; İlerleme'deki "Tamamlama" ile aynı hesap) ve sıradaki adımı gösterir. Satış yok; bütün kart tek bağlantı,
 * doğrudan sıradaki adıma gider. Gösterilen her sayı kayıttan.
 */
export function ContinueLine({ step }: { step: ContinueStep }) {
  const look = subjectLook(`${step.subject ?? ""} ${step.prepTitle}`);
  const SubjectIcon = look.icon;
  const KindIcon = KIND_ICON[step.next.kind] ?? Sparkles;
  const progress = step.progress && step.progress.total > 0 ? step.progress : null;
  const pct = progress ? Math.max(0, Math.min(100, progress.pct)) : 0;
  const started = Boolean(progress && progress.done > 0);
  const days = typeof step.daysLeft === "number" && step.daysLeft >= 0 ? step.daysLeft : null;

  return (
    <Link
      href={step.next.href}
      className="cp-resume"
      data-kind={step.next.kind}
      style={{ ["--resume-subject" as string]: look.accent }}
    >
      <span className="cp-resume-head">
        <span className="cp-resume-subject" aria-hidden>
          <SubjectIcon className="h-[1.1rem] w-[1.1rem]" />
        </span>
        <span className="cp-resume-prep">
          <small>{started ? "Kaldığın yerden devam" : "Yeni hazırlığın"}</small>
          <strong>{step.prepTitle}</strong>
        </span>
        {days != null ? (
          <span className={days <= 3 ? "cp-resume-days cp-resume-days--soon" : "cp-resume-days"}>
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            <DaysLabel days={days} />
          </span>
        ) : null}
      </span>

      <span className="cp-resume-body">
        <span className="cp-resume-ring" aria-hidden>
          <svg className="cp-resume-ring-svg" viewBox="0 0 64 64" width="64" height="64">
            <circle className="cp-resume-ring-track" cx="32" cy="32" r="27" />
            <circle
              className="cp-resume-ring-fill"
              cx="32"
              cy="32"
              r="27"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - pct / 100)}
              style={{ ["--resume-ring" as string]: `${RING}` }}
            />
          </svg>
          <KindIcon className="cp-resume-kind-icon h-6 w-6" />
        </span>
        <span className="cp-resume-step">
          <span className="cp-resume-kind">
            Sıradaki: {step.next.kindLabel}
            {/* Kompakt hâlde (telefon, kısa ekran) süre bu satıra, hazırlığın adı ve kalan gün alttaki bağlam satırına iner. */}
            <span className="cp-resume-kind-min"> · ~{step.next.minutes} dk</span>
          </span>
          <strong className="cp-resume-heading">{step.next.heading}</strong>
          <span className="cp-resume-meta">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />~{step.next.minutes} dk
          </span>
          <span className="cp-resume-ctx">
            <span className="cp-resume-ctx-title">{step.prepTitle}</span>
            {days != null ? (
              <span className={days <= 3 ? "cp-resume-ctx-days cp-resume-ctx-days--soon" : "cp-resume-ctx-days"}>
                <DaysLabel days={days} />
              </span>
            ) : null}
            {started ? <span className="cp-resume-ctx-pct">%{pct}</span> : null}
          </span>
        </span>
      </span>

      <span className="cp-resume-progress">
        {started && progress ? (
          <>
            <b>%{pct}</b> tamamlandı
            <span className="cp-resume-count">
              {progress.done} / {progress.total} adım
            </span>
          </>
        ) : (
          <>İlk adım seni bekliyor</>
        )}
      </span>
      {/* Masaüstünde alt satırda yazılı düğme; telefonda adımın yanında yuvarlak oynat düğmesi (kart kısa kalsın). */}
      <span className="cp-resume-go">
        <span className="cp-resume-go-icon" aria-hidden>
          <Play className="h-3.5 w-3.5" fill="currentColor" />
        </span>
        <span className="cp-resume-go-text">{started ? "Devam et" : "Başla"}</span>
      </span>
    </Link>
  );
}
