import type { MetadataRoute } from "next";
import { AI_SEARCH_CRAWLERS, ROBOTS_DISALLOW } from "@/lib/seo/crawl-rules";
import { SITE_URL } from "@/lib/seo/page-metadata";

/**
 * İki grup, aynı kurallar (27 Kasım 2026, GEO): adıyla anılan arama ve yapay zekâ tarayıcıları kendi gruplarında açık
 * izin ve kapalı yolları görür (adıyla anılan tarayıcı `*` grubunu okumaz); öbür tarayıcılar `*` grubunu.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [...ROBOTS_DISALLOW];
  return {
    rules: [
      { userAgent: [...AI_SEARCH_CRAWLERS], allow: "/", disallow },
      { userAgent: "*", allow: "/", disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
