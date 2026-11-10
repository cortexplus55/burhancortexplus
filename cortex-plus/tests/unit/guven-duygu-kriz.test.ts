import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { recentSupportVerdict, SUPPORT_SCOPE } from "@/lib/ai/chat-safety-context";
import {
  chatTurnLines,
  CRISIS_TURN_LINE,
  emotionTurnLine,
  GENERAL_FEELING_TURN_LINE,
  readChatTurn,
} from "@/lib/ai/chat-turn-lines";
import { classify } from "@/lib/ai/moderation";
import { runTeacherTutor } from "@/lib/ai/teacher-tutor-run";
import {
  carriesLessonQuestion,
  detectMessageEmotion,
  emotionMood,
  explicitCrisisSignal,
  generalFeelingStatement,
} from "@/lib/learning/message-feelings";
import { moodPrompt } from "@/lib/learning/session-signals";

/*
  Güven paketi (10 Kasım 2026), Görev 7: duygu uyarlaması.
  a) Mesajda ders sorusu + duygu varsa İLK yanıtın ilk cümlesi duyguya göre açılır.
  b) Güvenlik (kriz) sorusu yalnız açık kendine zarar verme / intihar / akut tehlike ifadesinde.
  Örnekler nötr ve farklı derslerden; üretim kodu yalnız genel Türkçe duygu sözcükleri taşır.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const turnOf = (message: string, history: { role: string; content: string }[] = [], baseMood: "neutral" | "stressed" = "neutral") =>
  readChatTurn({ message, style: "direct_solve", history, baseMood });

describe("7a: mesajdaki duygu modelsiz tanınır", () => {
  it("sıkılma / kolay bulma", () => {
    for (const message of [
      "Çok sıkıldım, 4 kalem 60 lira ise 7 kalem kaç lira?",
      "Bunlar çok kolay, daha zoru yok mu?",
      "Bu bana kolay geldi. Fotosentez hangi organelde olur?",
      "Zaten biliyorum bunları",
      "SIKILDIM",
    ]) {
      expect(detectMessageEmotion(message), message).toBe("bored");
    }
  });

  it("sinir / öfke", () => {
    for (const message of [
      "Sinir oldum artık, 3x + 5 = 26 ise x kaçtır?",
      "Bıktım bu konudan, paragrafın ana fikri nasıl bulunur?",
      "Çıldıracağım, yine yanlış yaptım",
      "Sinirim bozuldu",
      "SİNİRLENDİM",
    ]) {
      expect(detectMessageEmotion(message), message).toBe("frustrated");
    }
  });

  it("kaygı / panik", () => {
    for (const message of [
      "Panik oldum, yarın sınav var. Hücre zarından geçiş çeşitleri nelerdir?",
      "Çok stresliyim, yetişmeyecek",
      "Korkuyorum, yapamayacağım",
      "Kaygılıyım",
      "ENDİŞELİYİM",
    ]) {
      expect(detectMessageEmotion(message), message).toBe("anxious");
    }
  });

  it("ders terimi duygu sayılmaz; yalın soru duygu taşımaz", () => {
    for (const message of [
      "Sinir sistemi nasıl çalışır?",
      "Sinirden gelen uyarı kasa nasıl iletilir?",
      "Stres hormonu hangisidir?",
      "Sıkıştırılan gazın basıncı neden artar?",
      "Yay sıkıldığında potansiyel enerji ne olur?",
      "Romanda korku teması nasıl işlenmiş?",
      "Çok kolay bir soru sor",
      "Bunu çok basit anlat",
      "Çok daha basit anlatır mısın?",
      "3x + 5 = 26 ise x kaçtır?",
      "Merhaba",
    ]) {
      expect(detectMessageEmotion(message), message).toBeNull();
    }
  });

  it("duygunun yanında ders sorusu var mı", () => {
    expect(carriesLessonQuestion("Çok sıkıldım, 4 kalem 60 lira ise 7 kalem kaç lira?")).toBe(true);
    expect(carriesLessonQuestion("Sinir oldum artık, 3x + 5 = 26 ise x kaçtır?")).toBe(true);
    expect(carriesLessonQuestion("Panik oldum. Hücre zarından geçiş çeşitleri nelerdir?")).toBe(true);
    expect(carriesLessonQuestion("Bıktım, paragrafın ana fikri nasıl bulunur?")).toBe(true);
    // Yalnız duygu, ya da duyguya dair soru.
    expect(carriesLessonQuestion("Çok sıkıldım ya")).toBe(false);
    expect(carriesLessonQuestion("Çok stresliyim, ne yapmalıyım?")).toBe(false);
    expect(carriesLessonQuestion("Hâlâ aynı şekilde hissediyorum")).toBe(false);
    expect(carriesLessonQuestion("Panik oldum, nasıl sakinleşirim?")).toBe(false);
  });

  it("duygu var olan ruh hali altyapısına eşlenir (ayrı sistem yok)", () => {
    expect(emotionMood("bored")).toBe("ready");
    expect(emotionMood("frustrated")).toBe("stressed");
    expect(emotionMood("anxious")).toBe("stressed");
    // Hap işaretlenmemiş olsa da turun ruh hali mesajdan gelir; mesajda duygu yoksa günün kaydı geçerlidir.
    expect(turnOf("Çok sıkıldım, 4 kalem 60 lira ise 7 kalem kaç lira?").mood).toBe("ready");
    expect(turnOf("Panik oldum. Hücre zarından geçiş çeşitleri nelerdir?").mood).toBe("stressed");
    expect(turnOf("Hücre zarından geçiş çeşitleri nelerdir?", [], "stressed").mood).toBe("stressed");
    expect(turnOf("Hücre zarından geçiş çeşitleri nelerdir?").mood).toBe("neutral");
    expect(moodPrompt("ready")).toMatch(/zorlayıcı bir soruyla meydan oku/);
    expect(moodPrompt("stressed")).toMatch(/önce sakinleştir/);
  });
});

describe("7a: soru + duygu varsa ilk cümle duyguya göre açılır (ilk turda)", () => {
  it("sıkılma: kolay geldiğini kabul et, cevabı hızla doğrula, daha zorunu teklif et", () => {
    const turn = turnOf("Çok sıkıldım, bunlar kolay. 4 kalem 60 lira ise 7 kalem kaç lira?");
    expect(turn).toMatchObject({ emotion: "bored", feelingWithQuestion: true, feelingOnly: false, crisis: false });
    const lines = chatTurnLines(turn, "direct_solve");
    expect(lines).toEqual([emotionTurnLine("bored")]);
    expect(lines[0]).toMatch(/İlk cümlede bunun ona kolay geldiğini kabul et/);
    expect(lines[0]).toMatch(/uzatmadan karşıla/);
    expect(lines[0]).toMatch(/daha zor bir soru teklif et \(çok adımlı ya da sınav tuzağı içeren\)/);
    // Aktif soru kilidiyle çelişmez: soru ancak öğrenci kabul ederse sorulur.
    expect(lines[0]).toMatch(/soruyu ancak öğrenci kabul ederse sor/);
  });

  it("sinir: gerginliği anladığını söyle, tempoyu yavaşlat, en sade tek adım", () => {
    const line = chatTurnLines(turnOf("Sinir oldum artık, 3x + 5 = 26 ise x kaçtır?"), "direct_solve")[0] ?? "";
    expect(line).toBe(emotionTurnLine("frustrated"));
    expect(line).toMatch(/İlk cümlede gerginliğini anladığını söyle/);
    expect(line).toMatch(/Tempoyu yavaşlat: çözümün yalnız tek adımını, en sade hâliyle/);
  });

  it("kaygı: sakinleştirici güvence, en kolay parçadan başla", () => {
    const line = chatTurnLines(turnOf("Panik oldum, yarın sınav var. Hücre zarından geçiş çeşitleri nelerdir?"), "direct_solve")[0] ?? "";
    expect(line).toBe(emotionTurnLine("anxious"));
    expect(line).toMatch(/İlk cümlede sakinleştirici bir güvence ver/);
    expect(line).toMatch(/en kolay parçasından başla/);
    expect(line).toMatch(/tutulamayacak söz yok/);
  });

  it("satır 'ilk cümle tam cevap' ve 'duygu cümlesiyle başlama' kurallarını bu tur için öteler", () => {
    for (const emotion of ["bored", "frustrated", "anxious"] as const) {
      expect(emotionTurnLine(emotion)).toMatch(
        /'duygu cümlesiyle başlama' ve 'ilk cümle tam cevap' kuralları bu turda ikinci cümleden başlar/,
      );
    }
  });

  it("kök neden: duygu satırı modele İLK turda, sistem isteminin sonunda gider (sahte modelle)", async () => {
    const create = vi.fn<(request: unknown) => Promise<unknown>>(async () => ({
      choices: [{ message: { content: "Bu sana kolay gelmiş, güzel. Cevap doğru. Daha zor bir soru ister misin?" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }));
    const message = "Çok sıkıldım, bunlar kolay. 4 kalem 60 lira ise 7 kalem kaç lira?";
    const turn = turnOf(message);
    const turnLines = chatTurnLines(turn, "direct_solve");
    await runTeacherTutor({
      client: { chat: { completions: { create } } } as never,
      model: "gpt-6-luna",
      context: { passages: [], learnerLines: [moodPrompt(turn.mood)], mode: "general" },
      history: [],
      message,
      style: "direct_solve",
      turnLines,
      verify: false,
      onUsage: async () => undefined,
    });
    const system = (create.mock.calls[0]![0] as { messages: { content: string }[] }).messages[0]!.content;
    // Eski davranışın kaynağı olan iki kural hâlâ istemde; duygu satırı onlardan SONRA gelir ve bu tur için öteler.
    expect(system).toContain("Duygu cümlesiyle ya da soruyu tekrar ederek başlama");
    expect(system).toContain("İLK CÜMLE TAM CEVAP");
    expect(system.endsWith(emotionTurnLine("bored"))).toBe(true);
    expect(system.indexOf(emotionTurnLine("bored"))).toBeGreaterThan(system.indexOf("İLK CÜMLE TAM CEVAP"));
    expect(system).toContain(moodPrompt("ready"));
  });

  it("sohbet ucu turun ruh halini mesajdan okur", () => {
    const route = read("src/app/api/ai/chat/route.ts");
    expect(route).toContain('const moodLine = turn.mood === "neutral" ? "" : ` ${moodPrompt(turn.mood)}`;');
    expect(route).not.toContain('chatMood === "neutral" ? ""');
  });
});

describe("7b: kriz yanıtı yalnız açık ifadede", () => {
  const GENERAL = [
    "Hâlâ aynı şekilde hissediyorum",
    "Aynı hissediyorum",
    "Moralim bozuk",
    "Bugün çok yorgunum",
    "Çok sıkıldım ya",
    "Kendimi kötü hissediyorum",
    "Çalışmak istemiyorum",
    "İçimden gelmiyor",
    "Çok stresliyim",
  ];

  it("nötr sohbette genel duygu ifadesi kriz sinyali değildir", () => {
    for (const message of GENERAL) {
      expect(explicitCrisisSignal(message), message).toBe(false);
      expect(generalFeelingStatement(message), message).toBe(true);
    }
  });

  it("genel ifade doğal öğretmen karşılığı ister; kriz sorusu ve yardım hattı yok", () => {
    const history = [
      { role: "user", content: "Bugün kesirleri çalışalım" },
      { role: "assistant", content: "Olur. Hangi kısmından başlayalım?" },
    ];
    for (const message of GENERAL) {
      const turn = turnOf(message, history);
      expect(turn, message).toMatchObject({ crisis: false, feelingOnly: true });
      expect(chatTurnLines(turn, "direct_solve", { priorSupport: false }), message).toEqual([GENERAL_FEELING_TURN_LINE]);
    }
    expect(GENERAL_FEELING_TURN_LINE).toMatch(/Güvenlik ya da kriz sorusu sorma, yardım hattı önerme/);
    expect(GENERAL_FEELING_TURN_LINE).toMatch(/nasıl hissettiğini biraz açmak isteyip istemediğini sor/);
    expect(GENERAL_FEELING_TURN_LINE).toMatch(/konunun mu yorucu geldiğini yoksa anlatım hızını mı değiştirmek gerektiğini sor/);
    // Daraltma kendi sınırını da söyler: açık ifade gelirse geçmez.
    expect(GENERAL_FEELING_TURN_LINE).toMatch(/açıkça kendine zarar vermekten ya da bir tehlikeden söz ederse bu satır geçmez/);
  });

  const CRISIS = [
    "Kendime zarar vermek istiyorum",
    "kendime zarar veriyorum",
    "İntihar etmek istiyorum",
    "İNTİHARI DÜŞÜNÜYORUM",
    "intihar edeceğim",
    "Ölmek istiyorum",
    "Artık yaşamak istemiyorum",
    "Keşke ölsem",
    "Kendimi öldüreceğim",
    "Hayatıma son vereceğim",
    "Canıma kıyacağım",
    "Evde şiddet görüyorum, hayatım tehlikede",
    "Babam beni dövüyor",
  ];

  it("gerçek kriz ifadesi yakalanır (zayıflatılmadı)", () => {
    for (const message of CRISIS) {
      expect(explicitCrisisSignal(message), message).toBe(true);
      const turn = turnOf(message);
      expect(turn.crisis, message).toBe(true);
      // Kriz satırı tek başına gider: ne daraltma ne ders satırı.
      expect(chatTurnLines(turn, "direct_solve", { priorSupport: false }), message).toEqual([CRISIS_TURN_LINE]);
    }
    expect(CRISIS_TURN_LINE).toMatch(/öbür bütün kurallardan önce gelir/);
    expect(CRISIS_TURN_LINE).toMatch(/şu an güvende olup olmadığını sor/);
    expect(CRISIS_TURN_LINE).toMatch(/ALO 183/);
    expect(CRISIS_TURN_LINE).toMatch(/112/);
    expect(CRISIS_TURN_LINE).toMatch(/Dersi bir kenara bırak/);
  });

  it("ders cümlesi kriz değildir (üçüncü kişi, konu anlatımı)", () => {
    for (const message of [
      "Romanda kahraman neden intihar ediyor?",
      "Şair bu şiiri intihar etmeden önce mi yazmış?",
      "Hücre intiharı (apoptoz) nedir?",
      "Sigara vücuda nasıl zarar verir?",
      "Asit yağmurları ormanlara zarar verir mi?",
      "Savaşta kaç kişi öldü?",
      "Doktor olmak istiyorum",
    ]) {
      expect(explicitCrisisSignal(message), message).toBe(false);
    }
  });

  it("geçmişte açık kriz ifadesi varsa genel cümle hafife alınmaz", () => {
    const history = [
      { role: "user", content: "Artık yaşamak istemiyorum" },
      { role: "assistant", content: "Seni önemsiyorum…" },
    ];
    const turn = turnOf("Hâlâ aynı şekilde hissediyorum", history);
    expect(turn.crisis).toBe(true);
    expect(chatTurnLines(turn, "direct_solve", { priorSupport: false })).toEqual([CRISIS_TURN_LINE]);
  });

  it("yakın zamanda destek yanıtı verildiyse (ya da okunamadıysa) daraltma yazılmaz", () => {
    const turn = turnOf("Hâlâ aynı şekilde hissediyorum");
    expect(turn).toMatchObject({ crisis: false, feelingOnly: true });
    expect(chatTurnLines(turn, "direct_solve", { priorSupport: true })).toEqual([CRISIS_TURN_LINE]);
    expect(chatTurnLines(turn, "direct_solve", { priorSupport: false })).toEqual([GENERAL_FEELING_TURN_LINE]);
  });

  it("destek kaydı okuması: var → true, yok → false, hata → true (koruyucu taraf)", async () => {
    const service = (result: { data: unknown[] | null; error: unknown }) => {
      const calls: [string, unknown][] = [];
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "gte"]) {
        query[method] = (...args: unknown[]) => {
          calls.push([method, args]);
          return query;
        };
      }
      query.limit = async () => result;
      return { client: { from: (table: string) => (calls.push(["from", table]), query) } as never, calls };
    };
    const found = service({ data: [{ id: "1" }], error: null });
    expect(await recentSupportVerdict(found.client, "u1", Date.UTC(2026, 10, 10, 12))).toBe(true);
    expect(found.calls).toContainEqual(["from", "abuse_events"]);
    expect(found.calls).toContainEqual(["eq", ["scope", SUPPORT_SCOPE]]);
    expect(found.calls).toContainEqual(["eq", ["user_id", "u1"]]);
    expect(found.calls).toContainEqual(["gte", ["created_at", "2026-11-09T12:00:00.000Z"]]);
    expect(await recentSupportVerdict(service({ data: [], error: null }).client, "u1")).toBe(false);
    expect(await recentSupportVerdict(service({ data: null, error: { message: "x" } }).client, "u1")).toBe(true);
    expect(await recentSupportVerdict({ from: () => { throw new Error("down"); } } as never, "u1")).toBe(true);
  });

  it("içerik denetimi kapısı değişmedi: kendine zarar sinyali destek yanıtı verir", () => {
    expect(classify(["self-harm"]).action).toBe("support");
    expect(classify(["self-harm/intent"]).action).toBe("support");
    expect(classify(["self-harm/instructions"]).action).toBe("block");
    expect(classify([]).action).toBe("allow");
    const moderation = read("src/lib/ai/moderation.ts");
    expect(moderation).toContain('const SUPPORT_CATEGORIES = new Set(["self-harm", "self-harm/intent"]);');
    expect(moderation).toContain("ALO 183");
  });

  it("sohbet ucu: destek kararı izlenir, daraltmadan önce okunur", () => {
    const route = read("src/app/api/ai/chat/route.ts");
    expect(route).toContain('if (v.action === "support") void recordAbuse({ signal: "moderation", severity: "high", scope: SUPPORT_SCOPE');
    expect(route).toContain("const priorSupport = turn.feelingOnly && !turn.crisis ? await recentSupportVerdict(service, userId) : false;");
    // Kriz turunda çözüm sağlaması çalışmaz.
    expect(route).toContain("if (charge && !turn.crisis && chatSolveNeedsGuard(");
  });

  it("duygu sözlüğü ders ya da konu sözcüğü taşımaz", () => {
    const source = read("src/lib/learning/message-feelings.ts");
    const patterns = source.slice(source.indexOf("const ANXIOUS"), source.indexOf("export function detectMessageEmotion"));
    expect(patterns).not.toMatch(/matematik|fizik|kimya|biyoloji|tarih|cografya|sinav|ders|konu/);
  });
});
