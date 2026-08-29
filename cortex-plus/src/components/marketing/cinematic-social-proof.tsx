import { Star } from "lucide-react";

const STATS = [
  { value: "12.400+", label: "aktif öğrenci" },
  { value: "4.8", label: "ortalama memnuniyet" },
  { value: "2.1M+", label: "çözülen soru" },
  { value: "%94", label: "hedef net artışı (anket)" },
];

const TESTIMONIALS = [
  {
    name: "Elif K.",
    role: "TYT adayı · İstanbul",
    quote:
      "Deneme analizi sayesinde hangi konuya dönmem gerektiğini ilk kez net gördüm. Cortex Plus’ı arkadaşlarıma anlattım.",
    result: "+18 net (8 hafta)",
  },
  {
    name: "Mert A.",
    role: "Lise 12 · Ankara",
    quote:
      "Fotoğraftan soru çözümü gece tekrarında hayat kurtarıyor. ChatGPT’de kaybolmuyorum, adım adım gidiyor.",
    result: "Matematik ort. 72 → 86",
  },
  {
    name: "Zeynep D.",
    role: "LGS adayı · İzmir",
    quote:
      "Çalışma planımı ve kredi harcamamı tek ekranda görüyorum. Plus’a geçince limit artışı sınav döneminde fark etti.",
    result: "Haftalık plan disiplini",
  },
  {
    name: "Can Y.",
    role: "AYT adayı · Bursa",
    quote:
      "Sözlü pratik modülü yüzünden okul mock sınavında rahatladım. Bizi seçmiş hissetmiyorum, gerçekten kullanıyoruz.",
    result: "Sözlü notu 78 → 91",
  },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function CinematicSocialProof() {
  return (
    <section className="border-t border-[var(--mk-border)] bg-[#080808] py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">
          Bizi seçenler
        </p>
        <h2 className="mk-display mt-3 text-center text-2xl md:text-4xl">
          Sınav yolculuğunda ilham veren örnekler
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-[var(--mk-muted)] md:text-base">
          Tanıtım amaçlı örnek geri bildirimler; bireysel sonuçlar çalışma
          düzenine göre değişir.
        </p>

        <div className="mt-14 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4 md:gap-6">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="mk-card mk-card-cinematic rounded-2xl p-5 md:p-6 text-center"
            >
              <p className="text-2xl font-bold text-amber-300 md:text-3xl">
                {s.value}
              </p>
              <p className="mt-1 text-xs text-[var(--mk-muted)] md:text-sm">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 md:gap-6 lg:gap-8">
          {TESTIMONIALS.map((t) => (
            <article
              key={t.name}
              className="mk-card mk-card-cinematic flex min-h-[220px] flex-col p-6 md:p-8"
            >
              <div className="flex items-start gap-4">
                <div
                  className="mk-avatar-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--mk-surface)] text-sm font-semibold text-amber-200"
                  aria-hidden
                >
                  {initials(t.name)}
                </div>
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs text-[var(--mk-muted)]">{t.role}</p>
                  <div className="mt-1 flex gap-0.5 text-amber-400" aria-hidden>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-current" />
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-[var(--mk-muted)]">
                &ldquo;{t.quote}&rdquo;
              </p>
              <p className="mt-4 inline-flex w-fit rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
                {t.result}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
