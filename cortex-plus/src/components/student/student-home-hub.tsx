import Link from "next/link";
import { formatDate } from "@/lib/format";
import "@/styles/cortex-premium.css";

const shortcuts = [
  { href: "/ogretmen", label: "Yeni ders sohbeti", body: "Takıldığın soruyu adım adım çöz." },
  { href: "/soru-coz", label: "Fotoğraftan çöz", body: "Sorunun fotoğrafını yükle." },
  { href: "/deneme-sinavlari", label: "Deneme çöz", body: "Eksiklerini ortaya çıkar." },
  { href: "/araclar", label: "Araçlar", body: "Hesaplayıcılar ve çalışma kısayolları." },
];

export function StudentHomeHub({
  firstName,
  walletLine,
  conversations,
}: {
  firstName: string;
  walletLine: string | null;
  conversations: { id: string; title: string | null; updated_at: string }[];
}) {
  return (
    <section className="cortex-premium mb-4 space-y-4">
      {walletLine ? (
        <p className="text-center text-xs text-[var(--cx-muted)] sm:text-left">
          {walletLine}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {shortcuts.map((item) => (
          <Link key={item.href} href={item.href} className="cortex-premium-tool-card block">
            <p className="text-sm font-semibold text-[var(--cx-text)]">{item.label}</p>
            <p className="mt-1 text-xs text-[var(--cx-muted)]">{item.body}</p>
          </Link>
        ))}
      </div>
      {conversations.length > 0 ? (
        <div className="rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-surface-solid)] p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Kaldığın yerden devam et</h2>
            <Link
              href="/sohbetler"
              className="text-xs font-medium text-[var(--cx-gold-hover)]"
            >
              Tümü
            </Link>
          </div>
          <ul className="space-y-2 text-sm">
            {conversations.slice(0, 3).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/ogretmen?sohbet=${c.id}`}
                  className="flex justify-between gap-2 hover:text-[var(--cx-gold-hover)]"
                >
                  <span className="truncate">{c.title ?? "Başlıksız sohbet"}</span>
                  <span className="shrink-0 text-xs text-[var(--cx-muted)]">
                    {formatDate(c.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
