import { ImageResponse } from "next/og";

export const contentType = "image/png";

export function generateImageMetadata() {
  return [
    { contentType: "image/png", size: { width: 32, height: 32 }, id: "32" },
    { contentType: "image/png", size: { width: 192, height: 192 }, id: "192" },
    { contentType: "image/png", size: { width: 512, height: 512 }, id: "512" },
  ];
}

function CortexIcon({ px }: { px: number }) {
  const radius = Math.round(px * 0.22);
  const fontSize = Math.round(px * 0.38);
  return (
    <div
      style={{
        width: px,
        height: px,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(145deg, #1a1028 0%, #2d1b4e 55%, #1a1028 100%)",
        borderRadius: radius,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize,
          fontWeight: 800,
          letterSpacing: -px * 0.02,
          color: "#e8a838",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        C+
      </div>
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
