import { ImageResponse } from "next/og";
import { CortexIconSvg } from "@/components/brand/cortex-icon-svg";

export const contentType = "image/png";

export function generateImageMetadata() {
  return [
    { contentType: "image/png", size: { width: 32, height: 32 }, id: "32" },
    { contentType: "image/png", size: { width: 192, height: 192 }, id: "192" },
    { contentType: "image/png", size: { width: 512, height: 512 }, id: "512" },
  ];
}

/**
 * Simge: koyu karo üstünde sinir ağı işareti (19 Ekim 2026). 32 pikselde küçük çizim (altı düğüm +
 * artı), 192 ve 512'de ağın tamamı. Çizim `cortex-icon-svg.tsx`, geometri `cortex-geometry.ts`.
 */
function CortexIcon({ px }: { px: number }) {
  const radius = Math.round(px * 0.22);
  const detailed = px >= 128;
  const mark = Math.round(px * (detailed ? 0.8 : 0.78));

  return (
    <div
      style={{
        width: px,
        height: px,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(145deg, #1c1c22 0%, #0b0b0e 100%)",
        borderRadius: radius,
      }}
    >
      <CortexIconSvg size={mark} detailed={detailed} />
    </div>
  );
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const iconId = await id;
  const px = iconId === "512" ? 512 : iconId === "192" ? 192 : 32;
  return new ImageResponse(<CortexIcon px={px} />, {
    width: px,
    height: px,
  });
}
