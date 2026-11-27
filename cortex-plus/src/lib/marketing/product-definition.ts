/**
 * Cortex Plus'ın tek tanımı (27 Kasım 2026, GEO). "Cortex Plus nedir, kimler içindir, hangi sorunu çözer?" sorusunu iki
 * cümlede ve tek başına alıntılandığında anlamlı biçimde cevaplar. Sunucu HTML'inin ilk satırlarında görünür:
 * ana sayfa kahramanı, `/ozellikler`, `/fiyatlandirma`, `/mufredat` ve `/ornek` girişleri; aynı cümleler yapılandırılmış
 * veriye (`SoftwareApplication.description`) ve `/llms.txt`'ye gider.
 *
 * Bağımlılıksız (istemci bileşeni de okur). Sınav adları `CURRICULUM_LEVELS` ile aynı (bekçi `geo-ai-search.test.ts`);
 * yeni bir sınav eklenirse cümle de değişir. Abartı ve vaat yok: yalnız bugün çalışan iş.
 */
export const PRODUCT_DEFINITION =
  "Cortex Plus, öğrencinin kendi ders notundan (PDF, slayt, Word ya da defter fotoğrafı) konu anlatımı, test, kartlar ve sınav tarihine göre bir çalışma yolu hazırlayan yapay zekâ öğretmenidir.";

export const PRODUCT_AUDIENCE =
  "LGS ve YKS'ye hazırlanan ortaokul ve lise öğrencileri, vize ve finale çalışan üniversite öğrencileri ve KPSS, ALES, DGS, YDS, TUS, DUS adayları içindir; notu olmayan öğrenci resmî müfredattan başlar.";

/** İki cümle birlikte. */
export const PRODUCT_SUMMARY = `${PRODUCT_DEFINITION} ${PRODUCT_AUDIENCE}`;
