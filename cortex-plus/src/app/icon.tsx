import { ImageResponse } from "next/og";

export const contentType = "image/png";

export function generateImageMetadata() {
  return [
    { contentType: "image/png", size: { width: 32, height: 32 }, id: "32" },
    { contentType: "image/png", size: { width: 192, height: 192 }, id: "192" },
    { contentType: "image/png", size: { width: 512, height: 512 }, id: "512" },
  ];
}

/**
 * Simge, `components/brand/cortex-mark.tsx` ile aynı çizim.
 *
 * İki fark bilinçli: burada gradyan yerine düz renk var (satori'nin SVG
 * desteği sınırlı ve 32 pikselde gradyan zaten görünmüyor), zemin de mor
 * değil markanın koyusu — eski "C+" simgesi amber–siyah dünyaya hiç
 * uymuyordu.
 */
function CortexIcon({ px }: { px: number }) {
  const radius = Math.round(px * 0.22);
  const mark = Math.round(px * 0.62);

  return (
    <div
      style={{
        width: px,
        height: px,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(145deg, #1b1b1e 0%, #0b0b0c 100%)",
        borderRadius: radius,
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 24 24" fill="none">
        <path
          d="M18.4 5.4A8.9 8.9 0 1 0 18.4 18.6"
          stroke="#d99a17"
          strokeWidth="3.1"
          strokeLinecap="round"
        />
        <path
          d="M15.7 7.5 16.93 10.3 19.98 10.61 17.7 12.65 18.35 15.64 15.7 14.1 13.06 15.64 13.7 12.65 11.42 10.61 14.47 10.3Z"
          fill="#f4ae0b"
        />
      </svg>
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
