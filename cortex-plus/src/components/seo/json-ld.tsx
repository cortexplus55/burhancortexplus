import { jsonLdString } from "@/lib/seo/structured-data";

/**
 * Yapılandırılmış veri betiği (20 Kasım 2026, Faz 3). Sunucuda çizilir, istemci kodu yok. Birden çok nesne tek betikte
 * dizi olarak gider. İçerik `jsonLdString` ile kaçışlıdır.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
