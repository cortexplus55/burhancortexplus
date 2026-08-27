import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cortex Plus",
    short_name: "Cortex+",
    description: "AI destekli öğrenme platformu",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#e8a838",
    lang: "tr",
    icons: [
      {
        src: "/icon/192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon/512",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
