import { ImageResponse } from "next/og";
import { CortexIconSvg } from "@/components/brand/cortex-icon-svg";

export const alt = "Cortex Plus — Ders notundan sınav hazırlığı";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Paylaşım kartı: koyu zemin + marka amber vurgusu.
 * icon.tsx ile aynı marka çizgisi; sosyal önizleme için 1200×630.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(145deg, #1b1b1e 0%, #0b0b0c 70%, #1a1408 100%)",
          color: "#fafafa",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(145deg, #2a2a2e 0%, #121214 100%)",
              borderRadius: 16,
            }}
          >
            <CortexIconSvg size={60} detailed />
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#f4ae0b",
            }}
          >
            Cortex Plus
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              maxWidth: 900,
            }}
          >
            Notunu yükle, sınava hazır bir yol çıksın.
          </div>
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.35,
              color: "#c4c4c8",
              maxWidth: 820,
            }}
          >
            Ders, podcast, test ve sözlü pratik; hepsi senin notundan.
          </div>
        </div>

        <div style={{ fontSize: 24, color: "#8a8a90" }}>cortexplus.app</div>
      </div>
    ),
    { ...size },
  );
}
