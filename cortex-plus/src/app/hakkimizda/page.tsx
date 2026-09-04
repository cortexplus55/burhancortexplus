import { Compass, Receipt, ShieldCheck } from "lucide-react";
import { MarketingPage, MarketingCta } from "@/components/layout/marketing-page";

export const metadata = {
  title: "Hakkımızda",
  description: "Cortex Plus'ın amacı ve çalışma ilkeleri.",
};

/**
 * Sayfa üç ilke etrafında kuruldu. Önceden aynı içerik üç düz paragraftı;
 * okuyan kişi hangi cümlenin bir söz, hangisinin açıklama olduğunu ayıramıyordu.
 */
const principles = [
  {
    icon: Compass,
    title: "Cevabı değil yolu veriyoruz",
    body: "Yapay zekâ öğrencinin yerine düşünen değil, düşünmeyi öğreten bir araç olmalı. Yanıtlar hazır sonuç yerine adım adım anlatım sunar; ipucu, daha basit anlatım ve benzer örnek seçenekleriyle öğrenciyi çözüme kendi yürütür.",
  },
  {
    icon: Receipt,
    title: "Ne harcadığın önceden belli",
    body: "Her işlemin kredi bedeli işlemden önce ekranda görünür. İşlem başarısız olursa kredi iade edilir. Sürpriz fatura ya da görünmeyen kesinti yok.",
  },
  {
    icon: ShieldCheck,
    title: "Sohbetin sana ait",
    body: "Sohbet içerikleri yalnızca senin hesabında kalır. Kullanıcı verisi yalnızca hizmetin çalışması için işlenir; ilerleme özetleri ise yalnızca sen istersen paylaşılır.",
  },
];

export default function HakkimizdaPage() {
  return (
    <MarketingPage
      title="Hakkımızda"
      description="Cortex Plus, öğrencinin kendi hızında ilerlemesini kolaylaştırmak için kuruldu."
    >
      <p className="mk-eyebrow">Çalışma ilkelerimiz</p>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {principles.map(({ icon: Icon, title, body }) => (
          <article key={title} className="mk-feature">
            <span className="mk-icon" aria-hidden>
              <Icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-[var(--mk-text)]">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--mk-muted)]">
              {body}
            </p>
          </article>
        ))}
      </div>

      <div className="mk-card mt-10 p-6 sm:p-8">
        <p className="text-base leading-relaxed text-[var(--mk-text)] sm:text-lg">
          Bir öğrencinin bir konuyu gerçekten anladığı an, cevabı gördüğü an
          değil; kendi adımıyla vardığı andır. Ürünü bu cümleye göre kuruyoruz —
          eklediğimiz her özellik o anı yaklaştırdığı için var.
        </p>
      </div>

      <MarketingCta />
    </MarketingPage>
  );
}
