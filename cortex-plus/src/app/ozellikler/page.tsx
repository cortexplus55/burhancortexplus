import { AstraMarketingPage } from "@/components/parity/astra-marketing";
import { CinematicPrimaryCta } from "@/components/marketing/cinematic-cta";

export const metadata = {
  title: "Özellikler",
  description:
    "AI öğretmen, doküman tabanlı çalışma, quiz, flashcard, deneme sınavı ve çalışma planı.",
};

const features = [
  {
    title: "AI öğretmen",
    body: "Soruyu yaz, adım adım anlatım al. İpucu iste, daha basit anlatım seç, benzer örnek üret.",
  },
  {
    title: "Kendi kaynağınla çalış",
    body: "PDF ve notlarını yükle; yanıtlar senin kaynaklarına atıf vererek gelsin.",
  },
  {
    title: "Fotoğraftan soru çözümü",
    body: "Sorunun fotoğrafını yükle, gelişmiş model çözümü adımlarıyla göstersin.",
  },
  {
    title: "Quiz ve flashcard",
    body: "Konu başlığından anında test ve tekrar kartları üret, ilerlemeni ölç.",
  },
  {
    title: "Deneme sınavı ve analiz",
    body: "Deneme çöz, puanını gör, eksik konularının listesini çıkar.",
  },
  {
    title: "Çalışma planı",
    body: "Hedefini yaz; haftalara bölünmüş, işaretlenebilir görev listesi oluşsun.",
  },
  {
    title: "Şeffaf kredi",
    body: "Her işlem öncesi harcanacak kredi gösterilir; işlem başarısızsa iade edilir.",
  },
  {
    title: "Gizlilik önceliği",
    body: "Dosyaların özel depolamada tutulur, yalnızca senin hesabına bağlıdır.",
  },
];

export default function OzelliklerPage() {
  return (
    <AstraMarketingPage
      title="Özellikler"
      description="Cortex Plus, çalışmanı tek bir akışta toplayan yapay zekâ destekli öğrenme platformudur."
    >
      <div className="mx-auto max-w-6xl px-4 pb-16" data-cinematic-reveal>
        <div className="grid gap-4 md:grid-cols-2">
          {features.map((feature) => (
            <article key={feature.title} className="mk-card p-5">
              <h2 className="font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm text-[var(--mk-muted)]">{feature.body}</p>
            </article>
          ))}
        </div>
        <div className="mt-10">
          <CinematicPrimaryCta label="Başla" />
        </div>
      </div>
    </AstraMarketingPage>
  );
}
