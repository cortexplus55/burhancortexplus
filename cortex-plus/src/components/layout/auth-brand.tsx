import Link from "next/link";

/**
 * Giriş ve kayıt ekranlarının logosu ve sol panel süsü (15 Kasım 2026, `ui.v2.giris`). Logo üst çubuktakiyle aynı dosya
 * (`/logo-mark-trim.png`) ve aynı yazı ("Cortex" + gradyan "Plus"). Varsayılan CSS'te gizli; yalnız yeni görünümde
 * (`[data-ui~="giris"]`) çizilir, bayrak kapalıyken eski görünüm aynen kalır.
 */
export function AuthLogo({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  const cls = ["cx-auth-logo", className].filter(Boolean).join(" ");
  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- üst çubuktaki logo dosyasının aynısı; boyut CSS'te */}
      <img src="/logo-mark-trim.png" alt="" width={76} height={49} draggable={false} />
      <span className="cx-auth-logo-word">
        Cortex <span>Plus</span>
      </span>
    </>
  );
  // Ekran okuyucudan gizli panelde (giriş) odaklanabilir bağlantı olmaz.
  if (decorative) return <span className={cls}>{body}</span>;
  return (
    <Link href="/" className={cls} aria-label="Cortex Plus ana sayfa">
      {body}
    </Link>
  );
}

const ARCS = 10;
const DONE = 6;
const GAP_DEG = 2.5;
const R = 200;
const C = 240;

function arc(index: number): string {
  const span = 360 / ARCS;
  const from = ((index * span + GAP_DEG / 2 - 90) * Math.PI) / 180;
  const to = (((index + 1) * span - GAP_DEG / 2 - 90) * Math.PI) / 180;
  const x1 = C + R * Math.cos(from);
  const y1 = C + R * Math.sin(from);
  const x2 = C + R * Math.cos(to);
  const y2 = C + R * Math.sin(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * Ana ekrandaki konu halkasının süs hâli: yaylar konular, ilk altısı bitmiş (imza gradyanı), kalanı basamak rengi.
 * Yazı ve sayı yok, ekran okuyucudan gizli.
 */
export function AuthHeroRing() {
  return (
    <svg className="cx-auth-ring" viewBox="0 0 480 480" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="cx-auth-ring-sig" gradientUnits="userSpaceOnUse" x1="40" y1="40" x2="440" y2="440">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {Array.from({ length: ARCS }, (_, i) => (
        <path key={i} d={arc(i)} className={i < DONE ? "cx-auth-ring-done" : "cx-auth-ring-rest"} />
      ))}
    </svg>
  );
}
