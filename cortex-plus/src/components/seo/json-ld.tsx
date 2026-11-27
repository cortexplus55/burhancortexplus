import { jsonLdGraph, jsonLdString } from "@/lib/seo/structured-data";

/**
 * Yapılandırılmış veri betiği (20 Kasım 2026, Faz 3). Sunucuda çizilir, istemci kodu yok. 27 Kasım 2026 (GEO): sayfanın
 * bütün düğümleri tek `@graph` içinde gider (`@context` bir kez). İçerik `jsonLdString` ile kaçışlıdır.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const graph = jsonLdGraph(Array.isArray(data) ? data : [data]);
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(graph) }} />;
}
