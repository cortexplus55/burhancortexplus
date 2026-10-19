import { ImageResponse } from "next/og";
import { CortexIconSvg } from "@/components/brand/cortex-icon-svg";

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
          background: "linear-gradient(145deg, #1c1c22 0%, #0b0b0e 100%)",
          borderRadius: 40,
        }}
      >
        <CortexIconSvg size={144} detailed />
      </div>
    ),
    { ...size },
  );
}
