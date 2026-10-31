/**
 * Yarım kalmış model JSON'unu onarır (31 Ekim 2026, Paket J2 #8).
 *
 * Model çıktısı jeton sınırına, zaman aşımına ya da akış kopmasına denk gelince JSON ortasında biter: açık bir dize,
 * kapanmamış dizi/nesne, sondaki virgül ya da değeri yazılmamış bir anahtar. `JSON.parse` bütün yanıtı atar, öğrenci
 * "bu sefer tamamlanamadı" görürdü; çoğu zaman yanıtın %95'i sağlamdı. Onarım yalnız SONA dokunur: açık dizeyi
 * kapatır, yarım kalan son öğeyi (değersiz anahtar, yarım sözcük, sondaki virgül) atar ve açık parantezleri sırayla
 * kapatır. Ortadaki bozukluğu tahmin etmez; çıktı yine ayrıştırılamazsa çağıran eski davranışına döner.
 *
 * Onarılmış metin her zaman son aday: sağlam JSON ve öteki onarımlar (çit, sondaki virgül, LaTeX) önce denenir
 * (`teaching-standards.ts` `parseModelJson`). Doğrulayıcılar (şema, kapılar) onarılmış nesneyi de denetler; yarım
 * kalan son soru ya da ekran şemadan geçemezse düşer, gerisi kalır.
 */
export function repairTruncatedJson(raw: string): string {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = text.search(/[[{]/);
  if (start < 0) return text;
  const body = text.slice(start);

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  /** Açık dize bir nesnenin anahtarı mı (anahtarın ardında değer yoksa kesim noktası olamaz). */
  let stringIsKey = false;
  let lastSignificant = "";
  /** Son "güvenli" kesim noktası: bir değerin ya da kapanışın hemen sonrası. */
  let safeEnd = 0;
  let safeStack: string[] = [];

  for (let index = 0; index < body.length; index += 1) {
    const ch = body[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') {
        inString = false;
        lastSignificant = '"';
        // Dize bitti: değerse güvenli kesim; anahtarsa değeri henüz yazılmadı.
        if (!stringIsKey) {
          safeEnd = index + 1;
          safeStack = [...stack];
        }
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      stringIsKey = stack[stack.length - 1] === "}" && (lastSignificant === "{" || lastSignificant === ",");
      continue;
    }
    if (!/\s/.test(ch)) lastSignificant = ch;
    if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
      continue;
    }
    if (ch === "}" || ch === "]") {
      if (stack.length && stack[stack.length - 1] === ch) stack.pop();
      safeEnd = index + 1;
      safeStack = [...stack];
      if (!stack.length) return body.slice(0, index + 1);
      continue;
    }
    // Sayı, true/false/null bitişi: ardından ayraç ya da kapanış gelen yalın değer.
    if (/[0-9el]/.test(ch)) {
      const next = body[index + 1];
      if (next === undefined || /[\s,}\]]/.test(next)) {
        const head = body.slice(0, index + 1).match(/(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)$/);
        if (head && /[:,[]\s*$/.test(body.slice(0, index + 1 - head[0].length))) {
          safeEnd = index + 1;
          safeStack = [...stack];
        }
      }
    }
  }

  if (!stack.length && !inString) return body;
  let repaired = body.slice(0, safeEnd).replace(/[\s,]+$/, "");
  // Kesim bir nesnenin anahtar-değer çiftinin ortasında kaldıysa ("…, "anahtar"" değil, değer yazıldı) sorun yok;
  // kalan açık parantezler sırayla kapanır.
  for (let index = safeStack.length - 1; index >= 0; index -= 1) repaired += safeStack[index];
  return repaired;
}

/**
 * Model çıktısını ayrıştırır (31 Ekim 2026, Paket J denetimi #8): önce sağlam `JSON.parse`; düşerse yarım kalmış sonu
 * `repairTruncatedJson` ile onarıp bir kez daha dener. İkisi de düşerse İLK hatayı fırlatır — çağıranın eski
 * `catch` yolu aynen işler. Yalnız model çıktısı için: kullanıcı ya da veritabanı JSON'u onarılmaz.
 */
export function parseModelOutput<T = unknown>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    let repaired: string;
    try {
      repaired = repairTruncatedJson(raw);
    } catch {
      throw error;
    }
    if (repaired === raw) throw error;
    try {
      return JSON.parse(repaired) as T;
    } catch {
      throw error;
    }
  }
}
