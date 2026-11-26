import type { MetadataRoute } from "next";
import { ROBOTS_DISALLOW } from "@/lib/seo/crawl-rules";
import { SITE_URL } from "@/lib/seo/page-metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...ROBOTS_DISALLOW],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
