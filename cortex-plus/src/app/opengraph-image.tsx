import { ImageResponse } from "next/og";

export const alt = "Cortex Plus — AI destekli öğrenme";
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
            <svg width={44} height={44} viewBox="0 0 24 24" fill="none">
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
            AI destekli öğrenme
          </div>
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.35,
              color: "#c4c4c8",
              maxWidth: 820,
            }}
          >
            Sınav hazırlığı, AI öğretmen, quiz ve kişisel çalışma planı
          </div>
        </div>

        <div style={{ fontSize: 24, color: "#8a8a90" }}>cortexplus.app</div>
      </div>
    ),
    { ...size },
  );
}
