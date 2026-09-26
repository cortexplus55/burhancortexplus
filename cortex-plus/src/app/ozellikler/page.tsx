import {
  BookOpenCheck,
  Camera,
  ClipboardList,
  FileText,
  GraduationCap,
  Layers,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { CinematicPrimaryCta } from "@/components/marketing/cinematic-cta";
import { MistakeLoopSection } from "@/components/marketing/mistake-loop-section";

export const metadata = {
  title: "Özellikler",
  description:
    "Fotoğraftan çözüm, deneme analizi, quiz ve kişisel plan — sınav odaklı AI öğretmen.",
};

/**
 * Özellikler iki gruba ayrıldı: öğrenciyi ilerleten şeyler ve platformun
 * verdiği sözler. Sekiz kartı tek yığın hâlinde sunmak hepsini eşit ağırlıkta
 * gösteriyordu; oysa "fotoğraftan çözüm" ile "şeffaf kredi" aynı türden vaat
 * değil.
 */
const learning = [
  {
    icon: GraduationCap,
    title: "AI Öğretmen",
    body: "Soruyu yaz, adım adım anlatım al. İpucu iste, daha basit anlatım seç, benzer örnek üret.",
  },
  {
    icon: FileText,
    title: "Kendi Belgemden Çalış",
    body: "PDF ve notlarını yükle; yanıtlar senin belgene atıf vererek gelsin.",
  },
  {
    icon: Camera,
    title: "Fotoğraftan Çözüm",
    body: "Sorunun fotoğrafını yükle, gelişmiş model çözümü adımlarıyla göstersin.",
  },
  {
    icon: Layers,
    title: "Quiz ve Flashcard",
    body: "Konu başlığından ya da belgenden anında test ve tekrar kartları üret, ilerlemeni ölç.",
  },
  {
    icon: BookOpenCheck,
    title: "Deneme Sınavı ve Yanlışlar Defteri",
    body: "Deneme çöz, puanını gör; yanlışların deftere yazılsın, üst üste iki doğruyla çıksın.",
  },
  {
    icon: ClipboardList,
    title: "Çalışma Planı ve İlerleme Analizi",
    body: "Sınav tarihini yaz; günlük görevler zayıf konularına göre yeniden dizilsin, hazırlık yüzdeni gör.",
  },
];

const promises = [
  {
    icon: Receipt,
    title: "Şeffaf kredi",
    body: "Her işlem öncesi harcanacak kredi gösterilir; işlem başarısızsa iade edilir.",
  },
  {
    icon: ShieldCheck,
    title: "Gizlilik önceliği",
    body: "Dosyaların özel depolamada tutulur, yalnızca senin hesabına bağlıdır.",
  },
];

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof GraduationCap;
  title: string;
  body: string;
}) {
  return (
    <article className="mk-feature">
      <span className="mk-icon" aria-hidden>
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-[var(--mk-text)]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--mk-muted)]">{body}</p>
    </article>
  );
}

export default function OzelliklerPage() {
  return (
    <ParityMarketingPage
      title="Özellikler"
      description="Zayıf konuyu gör, bir sonraki adımı bil. Öğrenme araçları tek akışta."
    >
      {/* Döngü listelerden önce: kartlar tek tek ne yaptığımızı sayıyor,
          döngü hepsinin neden bir arada durduğunu anlatıyor. */}
      <MistakeLoopSection variant="full" />

      <div className="mx-auto max-w-6xl px-4 pb-16" data-cinematic-reveal>
        <p className="mk-eyebrow">Çalışırken</p>
        <h2 className="mt-2 text-2xl font-bold text-[var(--mk-text)] md:text-3xl">
          Sorudan sonuca kadar tek yerde
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {learning.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>

        <p className="mk-eyebrow mt-14">Sözümüz</p>
        <h2 className="mt-2 text-2xl font-bold text-[var(--mk-text)] md:text-3xl">
          Ne harcadığın ve neyin nerede durduğu belli
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {promises.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>

        <div className="mt-12">
          <CinematicPrimaryCta label="Başla" />
        </div>
      </div>
    </ParityMarketingPage>
  );
}
