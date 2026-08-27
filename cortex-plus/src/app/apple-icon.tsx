import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #1a1028 0%, #2d1b4e 55%, #1a1028 100%)",
          borderRadius: 40,
        }}
      >
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            color: "#e8a838",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          C+
        </div>
      </div>
    ),
    { ...size },
  );
}
