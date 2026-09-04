import Link from "next/link";
import { ShieldCheck, Sparkles, Zap } from "lucide-react";

const ITEMS = [
  {
    icon: ShieldCheck,
    title: "Memnuniyet odağı",
    body: "Plus planında beklentin karşılanmazsa destek ekibimizle iletişime geçebilirsin.",
  },
  {
    icon: Zap,
    title: "Anında erişim",
    body: "Kayıt sonrası AI öğretmen, deneme sınavları ve çalışma araçları aynı gün kullanıma açılır.",
  },
  {
    icon: Sparkles,
    title: "Şeffaf kredi",
    body: "Her AI işleminin maliyeti önceden görünür; sürpriz fatura yok.",
  },
];

export function CinematicGuaranteeStrip() {
  return (
    <section className="border-y border-[var(--mk-border)] bg-[#0a0a0a] py-12 md:py-14">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-6 md:grid-cols-3">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="mk-card mk-card-cinematic flex gap-4 rounded-2xl p-5 md:p-6"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300"
                  aria-hidden
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-[var(--mk-text)]">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--mk-muted)]">
                    {item.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-8 text-center text-sm text-[var(--mk-muted)]">
          <Link
            href="/fiyatlandirma"
            className="font-medium text-amber-300/90 underline-offset-4 hover:underline"
          >
            Planları ve Plus avantajlarını karşılaştır
          </Link>
        </p>
      </div>
    </section>
  );
}
