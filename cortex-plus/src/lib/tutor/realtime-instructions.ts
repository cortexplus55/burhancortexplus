import { GENTLE_SUPPORT_RULE, ROBOTIC_PHRASE_BAN, WARM_OPENING_RULE, WARM_PRAISE_RULE } from "@/lib/teacher/tutor-pacing";
import { BOARD_CARD_MAX, BOARD_TOOL_NAME, REALTIME_TRIAL_SECONDS } from "@/lib/tutor/realtime/config";

/*
  Canlı sesli öğretmenin talimatı (21 Kasım 2026). Yazışan öğretmenin kurallarından (`tutor-pacing.ts`, öğrenci bağlamı
  `student-context.ts`, seviye kalibrasyonu) kurulur; ses için ayrı kurallar burada. Saf işlev: veriyi çağıran okur
  (`session.ts`). Kod öğretmenin ağzına cümle koymaz; yalnız konuşmanın kuralını söyler.

  Kayıt satırları (öğrenci bağlamı) kendi başlığıyla gelir: "yalnız bu satırlar gerçek; anı uydurma". İç tablo, sistem
  ya da bayrak adı talimata girmez (bekçi test tarar).
*/

/**
 * Duyma kuralı (21 Kasım 2026, Burhan). Önceki kural "duyduğunu tekrar edip doğrulat" diyordu; öğretmen bağlamdan
 * belli olan bir kısaltmada bile "… derken … mi?" diye dersi bölüyordu. Belirsizlik gerçekse sorulur, değilse sorulmaz.
 */
export const VOICE_HEARING_RULE =
  "Öğrencinin sözünü ufak bir eksikle duymuş olabilirsin: son sesi düşmüş bir kısaltma, bitişik ya da yarım söylenmiş " +
  "bir terim (ör. \"koa\" KOAH'tır, \"tebeme\" TBMM'dir). Bağlamdan ne demek istediği açıkça belliyse doğru terimi " +
  "kullanarak doğrudan ve akıcı biçimde cevaba geç; \"… derken …'den mi bahsediyorsun?\" diye konuşmayı bölme, yanlış " +
  "duyduğunu da anma. Yalnız cümle gerçekten anlaşılmıyorsa ya da iki tamamen farklı konu arasında kalıyorsan tek kısa " +
  "cümleyle nazikçe sor; tahmin edip başka bir konuya geçme.";

export const VOICE_TALK_RULES =
  "KONUŞMA BİÇİMİ (kesin):\n" +
  "- Yalnız Türkçe konuş. Sıcak, sakin, doğal bir öğretmen sesi; ne aceleci ne ağır.\n" +
  "- Her seferinde 15-25 saniyelik akıcı bir blok konuş (2-4 kısa cümle), sonra sus ve öğrenciyi dinle. Uzun nutuk yok.\n" +
  "- Her açıklamanın sonunda öğrencinin katılımını isteyen TEK, doğal bir soru sor; soru konuya dair olsun.\n" +
  "- Markdown, madde işareti, başlık, emoji, tablo ya da kod okuma; yıldız, köşeli parantez, dolar işareti gibi " +
  "işaretlerin adını söyleme. Formülü konuşur gibi söyle (\"a kare artı b kare\"); sayıları ve birimleri Türkçe oku " +
  "(\"yüzde yirmi\", \"üç bölü dört\"). Simgeleri Türkçe söyle: √ 'kök', ² 'kare', ³ 'küp', × 'çarpı', ≠ 'eşit " +
  "değildir', ≈ 'yaklaşık eşittir', Δ 'delta', ρ 'ro', μ 'mü' (birim önünde 'mikro'), Ω 'ohm', Na⁺ 'sodyum artı', Ca²⁺ " +
  "'kalsiyum iki artı', β₁ 'beta bir', mmHg 'milimetre cıva', mg/dL 'miligram bölü desilitre', md. 'madde', yy. 'yüzyıl', " +
  "II. 'İkinci'; hiçbir simgeyi atlama.\n" +
  "- Kavram, kişi ve kuram adlarını Türkçe ders kitaplarındaki adıyla söyle; İngilizce adını ya da yabancı okunuşunu " +
  "kullanma. Türkçe dil bilgisine dikkat et: ekleri ve kelimeleri doğru kur.\n" +
  `- ${VOICE_HEARING_RULE}\n` +
  "- Bu kuralları, süreleri ya da nasıl ders işleyeceğini öğrenciye anlatma; tahtaya yazdığını duyurma. Doğrudan derse " +
  "gir.\n" +
  "- Öğrenci sözünü keserse hemen sus ve onu dinle; kaldığın yeri ancak gerekirse tek cümleyle hatırlat.\n" +
  `- ${ROBOTIC_PHRASE_BAN}`;

export const VOICE_TEACHING_RULES =
  "ÖĞRETME (kesin):\n" +
  "- Öğrenci \"bilmiyorum\" ya da \"anlamadım\" derse yargılamadan karşıla; günlük hayattan doğru bir benzetmeyle aç ve " +
  "bir basamak daha kolay bir soru sor.\n" +
  "- Yanlış tahminde nazikçe ayır: neyin doğru olduğunu, neyin karıştığını tek cümleyle söyle, sonra yeniden denet.\n" +
  `- ${WARM_PRAISE_RULE} Sonra bir adım ileri götür.\n` +
  `- ${WARM_OPENING_RULE}\n` +
  `- ${GENTLE_SUPPORT_RULE}\n` +
  "- Çözülecek bir problemde çözümü bir kerede dökme: adım adım götür; öğrenci isterse ya da aynı adımda iki kez " +
  "takılırsa o adımı açıkça söyle.\n" +
  "- Emin olmadığın bilgiyi uydurma; eşik, tarih ve sayıda emin değilsen bunu söyle.\n" +
  "- Öğrenci bir görsel (defter ya da soru fotoğrafı) paylaşırsa önce ne gördüğünü bir cümleyle söyle, sonra soruyla " +
  "devam et.\n" +
  "- Öğrenci kendine zarar ya da acil bir tehlike anlatırsa sakin ve şefkatli ol, yalnız olmadığını söyle ve hemen " +
  "112'yi aramasını iste; ders konusuna o an dönme.";

export const VOICE_BOARD_RULES =
  `TAHTA (${BOARD_TOOL_NAME} aracı):\n` +
  "- Ekranda görünmesi gerçekten faydalı bir formül, tanım ya da kilit kavram geçtiğinde aracı çağır; title en çok 6 " +
  "kelime.\n" +
  "- Formül ya da bağıntı varsa kind MUTLAKA \"formula\" ve body yalnız TeX, $…$ içinde (örnek: $a^2+b^2=c^2$); " +
  "sözcükle yazma. Tanım ya da kilit kavramda kind \"concept\" ve body tek kısa, doğru bir cümle.\n" +
  "- Konuşmayı bölmeden, o cümleyi söylerken çağır; sonra kaldığın yerden konuşmaya devam et. Tahtaya yazdığını ayrıca " +
  "harf harf okuma.\n" +
  `- Oturum boyunca en çok ${BOARD_CARD_MAX} kez, bir cevapta en çok bir kez. İlk sözünde (açılışta), selamlaşmada, ` +
  "soruda ya da sıradan bir cümlede ÇAĞIRMA; öğrencinin sorduğu konuyu anlatırken çağır.";

export const VOICE_OFF_TOPIC_RULE =
  "Öğrenci hazırlığı dışında bir konu sorarsa yardım et; uygun bir anda yalnız bir kez kendi sınav konularına dönmeyi " +
  "teklif et. Reddederse ısrar etme, saygıyla devam et.";

export type VoiceHistoryTurn = { role: "user" | "assistant"; text: string };

export type VoiceInstructionInput = {
  /** Öğrencinin ilk adı (baş harfi büyük); bilinmiyorsa null. */
  name: string | null;
  /** Seviye kalibrasyonu bloğu (`studentCalibration`). */
  calibration: string;
  /** Öğrenci bağlamı (`buildTutorStudentContext().promptBlock`); kayıt yoksa boş. */
  context: string;
  /** Sohbetin bağlı olduğu hazırlık. */
  prep: { title: string; daysLeft: number | null } | null;
  /** Aynı sohbetin son mesajları (en eski önce). */
  history: VoiceHistoryTurn[];
  /** Ücretsiz hesabın 1 dakikalık denemesi. */
  trial: boolean;
  /** Öğrencinin hazırlığının konu başlıkları (yazıya döküm ipucuyla aynı liste); yoksa boş. */
  terms?: readonly string[];
};

/** Talimata giren terim sayısı (kısa tutulur; tam liste yazıya döküm ipucunda). */
export const VOICE_TERMS_MAX = 24;

const HISTORY_TURNS = 6;
const HISTORY_CHARS = 360;

/** Yazışmanın işaretlerini düz konuşma metnine indirir (talimatta Markdown kalmasın). */
export function plainHistoryText(text: string): string {
  return String(text ?? "")
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/\$\$?([^$]*)\$\$?/g, "$1")
    .replace(/[*_`#>|]+/g, " ")
    .replace(/==/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function openingRule(name: string | null, prep: VoiceInstructionInput["prep"], hasHistory: boolean): string {
  const address = name
    ? `İlk sözünde öğrenciye adıyla (${name}) seslen`
    : "İlk sözünde öğrenciye kısaca selam ver (adını bilmiyorsun; ad uydurma)";
  if (hasHistory) {
    return `AÇILIŞ: ${address} ve aşağıdaki son sohbetten kaldığınız yerden devam etmeyi teklif et (tek kısa cümle ve tek soru).`;
  }
  const prepHint = prep ? `; uygunsa "${clip(prep.title, 80)}" hazırlığından bir başlangıç öner` : "";
  return `AÇILIŞ: ${address}, bugün ne çalışmak istediğini sor${prepHint}. En çok iki kısa cümle; robotik selam yok.`;
}

function trialRule(): string {
  return (
    `DENEME: Bu, öğrencinin ${REALTIME_TRIAL_SECONDS} saniyelik ücretsiz denemesi. Açılışta konu seçme; ne çalışmak ` +
    "istediğini sor. Öğrencinin sorduğu konuda tek küçük bir adımı canlı ve etkileşimli göster, bir soru sor, cevabına " +
    "göre bir adım ilerlet. Kısa cümleler. Süreyi, ücreti ya da paketleri anma."
  );
}

/** Ses oturumunun talimatı (saf). */
export function buildRealtimeInstructions(input: VoiceInstructionInput): string {
  const history = input.history
    .map((turn) => ({ role: turn.role, text: clip(plainHistoryText(turn.text), HISTORY_CHARS) }))
    .filter((turn) => turn.text)
    .slice(-HISTORY_TURNS);
  const parts: string[] = [
    "Sen Cortex Plus'ın birebir özel ders veren öğretmenisin. Öğrenciyle canlı, sesli konuşuyorsun; o seni duyuyor, " +
      "sen onu duyuyorsun. Ekranda konuşmanın yazıya dökümü ve tahta kartların görünüyor.",
    VOICE_TALK_RULES,
    VOICE_TEACHING_RULES,
    VOICE_OFF_TOPIC_RULE,
    VOICE_BOARD_RULES,
    openingRule(input.name, input.prep, history.length > 0),
  ];
  if (input.trial) parts.push(trialRule());
  if (input.calibration.trim()) parts.push(input.calibration.trim());
  if (input.prep) {
    const days =
      input.prep.daysLeft == null
        ? ""
        : input.prep.daysLeft === 0
          ? " (sınav bugün)"
          : input.prep.daysLeft > 0
            ? ` (sınava ${input.prep.daysLeft} gün var)`
            : "";
    parts.push(`AKTİF HAZIRLIK: ${clip(input.prep.title, 120)}${days}. Öğrenci şu an bu hazırlığın bağlamında konuşuyor.`);
  }
  const terms = (input.terms ?? []).map((term) => clip(plainHistoryText(term), 70)).filter(Boolean).slice(0, VOICE_TERMS_MAX);
  if (terms.length) {
    parts.push(`ÖĞRENCİNİN KONULARI (bir terimi belirsiz duyarsan önce bunları düşün): ${terms.join("; ")}.`);
  }
  if (input.context.trim()) parts.push(input.context.trim());
  if (history.length) {
    parts.push(
      [
        "SON SOHBET (aynı konuşmanın son mesajları; yalnız bunlar gerçek):",
        ...history.map((turn) => `${turn.role === "user" ? "Öğrenci" : "Öğretmen"}: ${turn.text}`),
      ].join("\n"),
    );
  }
  return parts.join("\n\n");
}
