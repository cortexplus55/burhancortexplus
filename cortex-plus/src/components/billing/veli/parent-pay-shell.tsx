import type { ReactNode } from "react";
import Link from "next/link";
import { Lock, ShieldCheck } from "lucide-react";
import { PARENT_PAY_COPY } from "@/lib/payments/parent-pay-copy";
import "@/styles/veli-odeme.css";

/**
 * Velinin ödeme sayfalarının kabuğu (Faz 5 §2): güven veren üst bant (Cortex Plus logosu + "Güvenli veli ödemesi"),
 * tek sütun mobil gövde, altta PayTR ve banka rozetleri ve yasal bağlantılar. Logo dosyası üst çubuktakiyle aynı
 * (`/logo-mark-trim.png`); dosyanın kendisine ve site başlığına dokunulmaz.
 */
export function ParentPayShell({ children }: { children: ReactNode }) {
  return (
    <div className="vo-page" data-testid="veli-odeme">
      <header className="vo-header">
        <Link href="/" className="vo-brand" aria-label="Cortex Plus ana sayfa">
          {/* eslint-disable-next-line @next/next/no-img-element -- üst çubuktaki logo dosyasının aynısı */}
          <img src="/logo-mark-trim.png" alt="" width={38} height={25} draggable={false} />
          <span>
            Cortex <b>Plus</b>
          </span>
        </Link>
        <span className="vo-secure-pill">
          <Lock className="h-3.5 w-3.5" aria-hidden /> {PARENT_PAY_COPY.brandLine}
        </span>
      </header>
      <main className="vo-main">{children}</main>
      <footer className="vo-footer">
        <ul className="vo-badges" aria-label="Ödeme güvencesi">
          {PARENT_PAY_COPY.badges.map((badge) => (
            <li key={badge}>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {badge}
            </li>
          ))}
        </ul>
        <nav className="vo-legal" aria-label="Yasal metinler">
          <Link href="/on-bilgilendirme">Ön Bilgilendirme</Link>
          <Link href="/mesafeli-satis">Mesafeli Satış</Link>
          <Link href="/iptal-iade">İptal ve iade</Link>
          <Link href="/iletisim">İletişim</Link>
        </nav>
      </footer>
    </div>
  );
}

export function ParentPayNotice({
  tone,
  title,
  body,
  testId,
}: {
  tone: "warn" | "ok";
  title: string;
  body: string;
  testId?: string;
}) {
  return (
    <section className={`vo-card vo-notice vo-notice--${tone}`} role={tone === "warn" ? "alert" : "status"} data-testid={testId}>
      <p className="vo-notice-icon" aria-hidden>
        {tone === "warn" ? "⏳" : "✅"}
      </p>
      <h1 className="vo-notice-title">{title}</h1>
      <p className="vo-notice-body">{body}</p>
    </section>
  );
}
