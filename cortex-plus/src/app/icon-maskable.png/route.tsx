import { ImageResponse } from "next/og";
import { CortexIconSvg } from "@/components/brand/cortex-icon-svg";

/**
 * Maskeli PWA simgesi (6 Kasım 2026). Android simgeyi daireye, kareye ya da damlaya kırpar; güvenli bölge
 * kenardan %10 içeride biten daire. Eski girdi köşeleri yuvarlatılmış `/icon/512`'yi kullanıyordu: maske
 * köşelerdeki boşluğu siyah bırakıyor, işaretin ucu kesiliyordu. Bu sürümde zemin tam karo (köşe yok) ve
 * işaret tuvalin %60'ı. `icon.tsx`'in kimliklerine eklenmedi: oradaki her kimlik sayfaya ayrı bir
 * `<link rel="icon">` olarak düşer, sekme simgesi bu tam karoya dönebilirdi.
 */
const MASKABLE_ICON_PX = 512;
/** İşaretin tuvaldeki payı: güvenli bölgenin (%80 daire) içinde. */
const MASKABLE_MARK_RATIO = 0.6;

export const dynamic = "force-static";

export function GET() {
  const px = MASKABLE_ICON_PX;
  const mark = Math.round(px * MASKABLE_MARK_RATIO);
  return new ImageResponse(
    (
      <div
        style={{
          width: px,
          height: px,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d0d0d",
        }}
      >
        <CortexIconSvg size={mark} detailed />
      </div>
    ),
    { width: px, height: px },
  );
}
