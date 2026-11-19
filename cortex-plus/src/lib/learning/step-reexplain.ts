import { EXAMPLE_CLASSIFICATION_RULE } from "@/lib/learning/teaching-rubric";

/**
 * Ders adımını "farklı anlat" (10 Kasım 2026).
 *
 * "Farklı anlat" yalnız ders sonunda vardı ve bütün dersi yeniden yazdırıyordu (yeni ders hakkı). Öğrenci tek bir
 * adımı anlamadığında o adımı başka bir yoldan duymak ister: gündelik bir benzetme ya da daha sade bir anlatım.
 * Bu, ders içi yardımdır (eğitmenle aynı sayaç: ücretsizde derse dahil). Yeni bilgi yazılmaz: adımın söylediği
 * aynı bilgi başka bir yoldan anlatılır; sayı, eşik ve terim adımdaki gibi kalır.
 */

/** Adımdan modele giden metnin tavanı (karakter). */
export const REEXPLAIN_TEXT_MAX = 2400;
/** Cevabın tavanı (karakter). */
export const REEXPLAIN_REPLY_MAX = 1800;

export const REEXPLAIN_RULE =
  "GÖREV: Aşağıdaki ders adımını öğrenci ilk anlatımla anlamadı. AYNI bilgiyi FARKLI bir yoldan anlat: ya gündelik " +
  "hayattan bir benzetmeyle ya da daha sade, daha kısa cümlelerle ve adım adım. İlk anlatımın cümlelerini yeniden " +
  "yazma; başka bir giriş, başka bir örnek kullan.\n" +
  "SINIR: Yeni olgu, sayı, eşik, tarih, sınıflandırma ya da formül EKLEME. Adımda geçen sayı, birim, terim ve " +
  "formül aynen kalır; benzetme yalnız anlamayı kolaylaştırır, kuralı değiştirmez. Adımda olmayan bir şeyi " +
  "bilgi diye sunma.\n" +
  "BİÇİM: 4-8 cümle. Terimi ilk geçtiği yerde tek cümleyle açıkla, anahtar terim **kalın**. Varsa formülü olduğu " +
  "gibi bir kez yaz. Son satır 'Kısaca:' ile başlayan tek cümlelik özet. Soru sorma, test yazma, selam verme.\n" +
  // Faz 4 (19 Kasım 2026): ikinci denetçi çağrısı kalktı; denetçinin kuralları bu tek isteme gömülü. Ardından kod
  // deterministik olarak yeni sayı arar (`introducedNumbers`): adımda olmayan sayı gelen taslak reddedilir.
  "ÖZ DENETİM (göndermeden önce): (1) Yazdığın her sayı, birim, yüzde, eşik ve formül DEĞİŞMEZ OLGULAR listesinde ya " +
  "da adımın ilk anlatımında AYNEN geçiyor mu? Geçmiyorsa sil. (2) Benzetme kuralı, tanımı ya da sınıflandırmayı " +
  "değiştiriyor mu? Değiştiriyorsa benzetmeyi değiştir. (3) Adımda olmayan bir olguyu bilgi diye sundun mu? Sunduysan " +
  "çıkar. (4) Kaynak sayısı ile genel bilgin çelişirse kaynağın sayısı geçerlidir; düzeltme yapma.";

/**
 * Faz 4: adımın önbellek anahtarı (adım başına). Başlık + ilk anlatımın düz metni; aynı adımın aynı sıradaki farklı
 * anlatımı yeniden istendiğinde kayıttan döner (kredi ve model çağrısı yok).
 */
export function reexplainStepKey(heading: string, text: string): string {
  const source = `${heading.trim()}\n${plainStepText(text)}`;
  let a = 2166136261;
  let b = 5381;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    a ^= code;
    a = Math.imul(a, 16777619);
    b = (Math.imul(b, 33) + code) | 0;
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

/** Aynı adım için en çok kaç farklı anlatım saklanır (istemcinin gönderdiği önceki anlatım tavanı + 1). */
export const REEXPLAIN_VARIANTS_MAX = 5;

/** Ders metnindeki biçim işaretlerini düz yazıya indirir (modele giden adım metni). */
export function plainStepText(text: string): string {
  return text
    .replace(/==([^=\n]+)==/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, REEXPLAIN_TEXT_MAX);
}

/** Kilitli olgu listesinin tavanı (madde). */
export const IMMUTABLE_FACTS_MAX = 24;
/** Önceki farklı anlatımdan modele giden kısım: yalnız açılışı (tekrar etmesin diye), olgu kaynağı değil. */
export const PREVIOUS_OPENING_MAX = 220;

/**
 * Faz 2 (madde 7.1): adımın DEĞİŞMEZ olguları. Kök neden: 2. ve 3. "Farklı anlat" çağrısında önceki farklı anlatımlar
 * modele olduğu gibi gidiyordu; bir anlatımda kayan sayı/eşik bir sonrakine "bilgi" olarak taşınıyordu. Kilit her
 * zaman ADIMIN İLK ANLATIMINDAN çıkarılır (önceki cevaplardan asla): sayı + birim, yüzde, formül/eşitlik ve adımın
 * vurguladığı terimler. Sırası korunur, tekrarlar düşer.
 */
export function extractImmutableFacts(text: string): string[] {
  const facts: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const fact = raw.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
    const key = fact.toLocaleLowerCase("tr-TR");
    if (fact.length < 1 || fact.length > 160 || seen.has(key)) return;
    seen.add(key);
    facts.push(fact);
  };
  // Vurgulanan terimler (ders biçimi: **kalın**, ==işaret==).
  for (const match of text.matchAll(/\*\*([^*\n]{1,80})\*\*|==([^=\n]{1,80})==/g)) push(match[1] ?? match[2] ?? "");
  const plain = plainStepText(text);
  // LaTeX ve eşitlik/eşitsizlik içeren ifadeler (formül olduğu gibi).
  for (const match of plain.matchAll(/\$[^$\n]{1,140}\$/g)) push(match[0]);
  for (const line of plain.split(/\n|(?<=[.!?])\s+/)) {
    if (/[=≈≤≥<>→⇌]/.test(line) && /[0-9A-Za-zÇĞİÖŞÜçğıöşü]/.test(line)) push(line);
  }
  // Sayılar, varsa hemen ardından gelen birim/sözcükle (yüzde, ondalık, aralık, tarih).
  for (const match of plain.matchAll(
    /(?:%\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)*(?:\s?[-–]\s?\d+(?:[.,]\d+)*)?(?:\s?(?:%|[A-Za-zÇĞİÖŞÜçğıöşü°µ/²³]{1,12}))?)/g,
  )) {
    if (/\d/.test(match[0])) push(match[0]);
  }
  return facts.slice(0, IMMUTABLE_FACTS_MAX);
}

/** Metindeki sayılar, karşılaştırılabilir biçimde (virgül ondalık = nokta; binlik ayırıcı düşer). */
export function numberTokens(text: string): string[] {
  const out: string[] = [];
  for (const match of plainStepText(text).matchAll(/\d+(?:[.,]\d+)*/g)) {
    const raw = match[0];
    // "1.250.000" binlik; "3,5" / "3.5" ondalık.
    const normalized = /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw.replace(",", ".");
    out.push(String(Number(normalized)));
  }
  return out;
}

/**
 * Cevapta adımda OLMAYAN sayılar (yeni olgu). Küçük sayma sayıları (0–10: "iki adımda", "1." madde) benzetmenin
 * doğal parçasıdır, sayılmaz.
 */
export function introducedNumbers(reply: string, stepText: string): string[] {
  const allowed = new Set(numberTokens(stepText));
  const introduced = new Set<string>();
  for (const token of numberTokens(reply)) {
    const value = Number(token);
    if (Number.isInteger(value) && value >= 0 && value <= 10) continue;
    if (!allowed.has(token)) introduced.add(token);
  }
  return [...introduced];
}

export function reexplainUserPrompt(input: {
  prepTitle: string;
  topicLabel: string;
  heading: string;
  text: string;
  /** Aynı adım için daha önce verilen farklı anlatımlar: yenisi onları tekrar etmesin. */
  previous?: readonly string[];
}): string {
  const previous = (input.previous ?? []).map((item) => item.trim()).filter(Boolean).slice(-2);
  const facts = extractImmutableFacts(input.text);
  return [
    REEXPLAIN_RULE,
    EXAMPLE_CLASSIFICATION_RULE,
    `Sınav: ${input.prepTitle}. Konu: ${input.topicLabel}.`,
    `ADIMIN BAŞLIĞI: ${input.heading.trim()}`,
    `ADIMIN İLK ANLATIMI:\n${plainStepText(input.text)}`,
    facts.length
      ? `DEĞİŞMEZ OLGULAR (kilitli; ilk anlatımdan çıkarıldı. Aynen kullan, değiştirme, yuvarlama, yenisini ekleme):\n${facts.map((fact) => `- ${fact}`).join("\n")}`
      : "",
    previous.length
      ? `Bu, aynı adımın ${previous.length + 1}. farklı anlatımı. Aşağıdaki önceki anlatımların yalnız AÇILIŞLARI ` +
        "verildi; yalnız TEKRAR ETMEMEN içindir ve OLGU KAYNAĞI DEĞİLDİR. Olgular yalnız ilk anlatımdan ve kilitli " +
        `listeden gelir.\nÖNCEKİ AÇILIŞLAR (bunlarla başlama, başka bir yol bul):\n${previous
          .map((item) => `- ${item.slice(0, PREVIOUS_OPENING_MAX)}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
