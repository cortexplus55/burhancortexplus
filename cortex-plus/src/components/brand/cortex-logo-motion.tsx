import type { CSSProperties } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import "@/styles/brand-motion.css";

/**
 * Hareketli Cortex Plus işareti (9 Kasım 2026: yeni 3B logo). Hareketin kuralı:
 * - `intro`: işaret hafif büyüyerek belirir (~0,7 sn), sonra yavaşça "nefes alır".
 * - `loop`: işaretin çevresinde logo renklerinde dönen halka. İçerik hazırlanırken yükleniyor işareti.
 * Küçük yerlerde (menü, sekme) hareket yok: orada `CortexMark`. Hareket azaltma açıksa durur.
 *
 * Yalnız CSS; sunucuda çizilir. Görsel `public/logo-mark.png` (şeffaf, 512 px).
 */
export function CortexLogoMotion({
  size = 120,
  mode = "intro",
  className,
}: {
  size?: number;
  mode?: "intro" | "loop";
  className?: string;
}) {
  const loop = mode === "loop";
  const mark = loop ? Math.round(size * 0.72) : size;
  return (
    <span
      className={cn("cxl", loop && "cxl--loop", className)}
      style={{ "--cxl-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {loop ? <span className="cxl-ring" /> : null}
      <Image
        src="/logo-mark.png"
        width={mark}
        height={mark}
        alt=""
        draggable={false}
        className="cxl-mark"
        style={{ width: mark, height: mark }}
      />
    </span>
  );
}
