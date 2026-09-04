import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Ana ekran simgesi — `icon.tsx` ile aynı çizim, iOS'un istediği boyutta. */
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
          background: "linear-gradient(145deg, #1b1b1e 0%, #0b0b0c 100%)",
          borderRadius: 40,
        }}
      >
        <svg width={112} height={112} viewBox="0 0 24 24" fill="none">
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
    ),
    { ...size },
  );
}
