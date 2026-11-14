import Link from "next/link";
import type { ReactNode } from "react";
import "@/styles/status-screen.css";

/**
 * 404 ve hata ekranlarının ortak kabuğu (Faz 12A). Gerçek logo dosyası (`/logo-mark-trim.png`, üst çubukla aynı),
 * başlık, tek cümle, tek brand eylem ve isteğe bağlı zayıf ikinci eylem. Teknik ayrıntı gösterilmez; varsa yalnız kısa
 * hata kodu (`digest`). Altın yok (yalnız Plus kimliği).
 */
export function StatusScreen({
  title,
  text,
  primary,
  secondary,
  digest,
}: {
  title: string;
  text: string;
  primary: ReactNode;
  secondary?: ReactNode;
  digest?: string;
}) {
  return (
    <main className="cx-status">
      <Link href="/" className="cx-status-logo" aria-label="Cortex Plus">
        {/* eslint-disable-next-line @next/next/no-img-element -- üst çubuktaki logo dosyasının aynısı */}
        <img src="/logo-mark-trim.png" alt="" width={76} height={49} />
        <span className="cx-status-word">
          Cortex <span>Plus</span>
        </span>
      </Link>
      <h1 className="cx-status-title">{title}</h1>
      <p className="cx-status-text">{text}</p>
      <div className="cx-status-actions">
        {primary}
        {secondary}
      </div>
      {digest ? <p className="cx-status-code">Hata kodu: {digest}</p> : null}
    </main>
  );
}
