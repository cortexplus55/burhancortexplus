import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/ogretmen-paneli", "/api/", "/auth/"],
    },
    sitemap: "https://cortexplus.app/sitemap.xml",
  };
}
