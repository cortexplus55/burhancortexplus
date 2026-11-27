import { FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import { RENEWAL_FAQ, type FaqItem } from "@/lib/marketing/landing-content";
import { PRODUCT_DEFINITION } from "@/lib/marketing/product-definition";
import { PARENT_LINK_TTL_HOURS } from "@/lib/payments/parent-link-ttl";
import { PARENT_WHATSAPP_BUTTON } from "@/lib/payments/parent-whatsapp-copy";

/*
  "Cevap önce" sık sorulanlar (27 Kasım 2026, GEO). Öğrencilerin ve velilerin yapay zekâ aramasına en sık sorduğu dört
  soru; `/ozellikler` ve `/fiyatlandirma` sayfasında görünür (açılır kapanır `<details>`, cevap ilk sunucu HTML'inde) ve
  aynı metin FAQPage yapılandırılmış verisine gider. Her cevap ilk cümlede doğrudan cevaplar, en çok üç cümledir ve tek
  başına alıntılandığında anlamlıdır (bekçi `geo-ai-search.test.ts`).

  Üçüncü soru canlı sesli öğretmeni anlatır (27 Kasım 2026, Burhan: yeni öğretmen ekranı herkese açıldı; canlı ses
  Sınav Haftası, Plus ve Sigma'da, ücretsiz hesapta "Konuş" Plus penceresini açar). Misafire gösterilen her söz bugün
  çalışır: kural değişirse (`resolveRealtimeAccess`, `REALTIME_FREE_TRIAL_ENABLED`) cevap da değişir.

  Sayılar sabitlerden: ücretsiz hak (`FREE_TIER_SENTENCE`), veli linkinin süresi (`PARENT_LINK_TTL_HOURS`), düğmenin adı
  (`PARENT_WHATSAPP_BUTTON`). Şık sayısı `resolveOptionCount` ile aynı (ortaokul ve LGS 4, lise ve sonrası 5).
*/

const lowerFirst = (text: string) => `${text.charAt(0).toLocaleLowerCase("tr")}${text.slice(1)}`;

/** Düğmenin adı, baştaki simge olmadan ("Velime WhatsApp'tan Ödeme Linki Gönder"). */
const PARENT_BUTTON_NAME = PARENT_WHATSAPP_BUTTON.replace(/^\S+\s/, "");

export const ANSWER_FAQ: readonly FaqItem[] = [
  {
    q: "Cortex Plus nedir ve kendi ders notlarımdan nasıl çalışma yolu çıkarır?",
    a: `${PRODUCT_DEFINITION} Notunu yükleyince içindeki konular çıkarılır ve sınav tarihine göre gün gün bir çalışma yolu kurulur. Her konunun dersi, kartları, doğru/yanlışı ve konu testi senin notundan yazılır.`,
  },
  {
    q: "Hangi sınavlar ve seviyeler için uygundur?",
    a: "Ortaokul ve LGS, lise ve YKS (TYT, AYT), üniversite vize ve finalleri ile KPSS, ALES, DGS, YDS, TUS ve DUS için uygundur. Kendi notunla her ders için yol kurulur; notun yoksa MEB ve ÖSYM belgelerinden çıkarılan resmî müfredattan başlarsın. Ortaokul ve LGS'de sorular 4 şıklı, lise ve sonrasında 5 şıklıdır.",
    link: { label: "Resmî müfredata göz at", href: "/mufredat" },
  },
  {
    q: "Canlı sesli öğretmen ve çift kontrollü soru üretimi nasıl çalışır?",
    a: "Canlı sesli öğretmen Sınav Haftası, Plus ve Sigma'da açık: “Konuş”a basınca öğretmen seni dinler, sesli cevap verir, gerektiğinde formülü tahtaya yazar ve konuşma sohbetine kaydedilir. Konu testinin soruları yazıldıktan hemen sonra ikinci bir yapay zekâ kontrolü soruları kendisi çözer, uydurma şıkkı ve yanlış cevap anahtarını düzeltir. Ardından kod, iki doğru cevabı olan ya da hesapla çelişen soruyu öğrenciye göstermeden eler.",
  },
  {
    q: "Kredi kartı olmadan nasıl denenir ve veli ödeme linki nasıl kullanılır?",
    a: `Ücretsiz hesap açman yeterli, kart bilgisi istenmez: ${lowerFirst(FREE_TIER_SENTENCE)} var. Paket kartındaki “${PARENT_BUTTON_NAME}” düğmesiyle planını veline gönderirsin; velin hesap açmadan linki açıp PayTR ile öder ve paket senin hesabına tanımlanır. Link ${PARENT_LINK_TTL_HOURS} saat geçerlidir.`,
  },
];

/** Fiyat sayfası: dört soru ve yenileme sorusu (ana sayfadakiyle aynı metin). */
export const PRICING_FAQ: readonly FaqItem[] = [...ANSWER_FAQ, RENEWAL_FAQ];
