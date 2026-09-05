import Link from "next/link";
import { BookMarked, CalendarCheck, MessagesSquare, Target } from "lucide-react";

/**
 * "Yanlışların kaybolmuyor" bölümü.
 *
 * Dört ayrı özelliği dört kart olarak sıralamamak bilinçli: satılacak fikir
 * özelliklerin sayısı değil, birbirlerini beslemeleri. Deneme defteri
 * dolduruyor, defter günlük turu besliyor, tur ısrarla takılınan konuyu
 * buluyor, o konu anlatmaya gidiyor. Dört kart bunu anlatmaz, zincir anlatır.
 *
 * Numaralar da süs değil: burada gerçekten sıra var, adımlardan biri
 * atlanırsa sonraki boş kalıyor. Sırasız bir listede numara kullanmıyoruz.
 *
 * `variant="short"` ana sayfada, `"full"` Özellikler sayfasında: aynı fikir,
 * iki derinlik. Metinler tek yerde duruyor ki ikisi zamanla ayrışmasın.
 */

const STEPS = [
  {
    icon: Target,
    title: "Deneme çözersin",
    short: "Yapay zekâ hangi konuda puan kaybettiğini çıkarır.",
    full: "Sınav biter bitmez özet, puanı kaybettiğin konular ve sıradaki adımlar önüne gelir. Doğru–yanlış listesiyle bırakmaz.",
  },
  {
    icon: BookMarked,
    title: "Yanlışların deftere düşer",
    short: "Konuya göre gruplanır, hiçbir yere kaybolmaz.",
    full: "Yanlış yaptığın her soru konusuyla birlikte defterine yazılır. Senin bir şey yapman gerekmez; sınavı kapattığında defter zaten dolmuştur.",
  },
  {
    icon: CalendarCheck,
    title: "Her gün 10 soru gelir",
    short: "Defterinden, konulara dağıtılmış. Beş dakika.",
    full: "Günün turu defterinden çeker ve konuları karıştırır. Bir soru defterden ancak üst üste iki kez doğru yapınca çıkar — tek doğru şans olabilir.",
  },
  {
    icon: MessagesSquare,
    title: "Takıldığın konuyu anlatırsın",
    short: "Ezberle anlamayı ayıran yer burası.",
    full: "Bir konuda soru birikiyorsa sorun soruda değil. O konuyu kendi cümlelerinle anlatırsın; nerede bağ kuramadığın, neye hiç değinmediğin tek tek önüne konur.",
  },
] as const;

export function MistakeLoopSection({
  variant = "short",
}: {
  variant?: "short" | "full";
}) {
  const full = variant === "full";

  return (
    <section
      className="mx-auto max-w-6xl px-4 py-16"
      data-cinematic-reveal
      aria-labelledby="loop-heading"
    >
      <p className="mk-eyebrow">Yanlışların kaybolmuyor</p>
      <h2
        id="loop-heading"
        className="mt-2 max-w-3xl text-2xl font-bold text-[var(--mk-text)] md:text-3xl"
        style={{ textWrap: "balance" }}
      >
        Çoğu öğrenci yanlışını çözer, açıklamayı okur ve unutur
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--mk-muted)] md:text-base">
        {full
          ? "Cortex Plus'ta o yanlış bir yere yazılıyor ve doğru yapana kadar peşini bırakmıyor. Dört ayrı özellik değil, birbirini besleyen tek bir döngü — her adım bir sonrakini dolduruyor."
          : "Cortex Plus'ta o yanlış bir yere yazılıyor ve doğru yapana kadar peşini bırakmıyor."}
      </p>

      <ol className="mk-loop mt-10">
        {STEPS.map((step, index) => (
          <li key={step.title} className="mk-loop-step">
            <span className="mk-loop-marker" aria-hidden="true">
              <step.icon className="h-5 w-5" />
            </span>
            <div className="mk-loop-body">
              <p className="mk-loop-index">{index + 1}. adım</p>
              <h3 className="mk-loop-title">{step.title}</h3>
              <p className="mk-loop-text">{full ? step.full : step.short}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Döngünün kapandığını söyleyen satır. Dört adımı yan yana dizmek
          "sonra biter" izlenimi veriyordu; oysa dördüncü adım öğrenciyi
          birinciye geri gönderiyor. */}
      <p className="mk-loop-close">
        Sonra yeni bir deneme, yeni yanlışlar — ve döngü baştan başlar.
      </p>

      {full ? (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/kayit" className="mk-loop-cta">
            Ücretsiz dene
          </Link>
          <Link href="/fiyatlandirma" className="mk-loop-cta mk-loop-cta--ghost">
            Paketleri gör
          </Link>
        </div>
      ) : null}
    </section>
  );
}
