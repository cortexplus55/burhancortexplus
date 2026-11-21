/**
 * Öğretmen v3 sunucu (teacher.v2 ana sohbeti, 21 Kasım 2026): canlı özel ders hocası kimliği, "bilmiyorum" ve tahmin
 * turları, aktif hazırlık önerisi (bir kez, red sonrası yok), dinamik takip soruları, "Kaynaklar:" bloğunun kalkması,
 * "Daha fazla" komutları, karşılama cevabı ve not yazımının zorlanması, kapsam raporunun yalnız yöneticiye gösterilmesi.
 * Bayrak kapalıyken istem ve yanıt bugünkü (kaynak sözleşmeleri). Örnekler sentetik (zeltron, varnik, morvala): kurallar
 * ders bağımsız. Canlı model çağrısı yok (sahte istemci).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ONE_MOVE_MARKUP } from "@/lib/ai/teacher-v2";
import { isAnswerTo, readTutorSession, teacherV2SessionLines, testRunLine, type TutorSession } from "@/lib/ai/teacher-v2-session";
import { SIMPLIFY_LINE, simplifyLine } from "@/lib/ai/simplify-request";
import type { ChatMaterialIndex } from "@/lib/ai/chat-material-link";
import { CHAT_TEACHING_MARKUP } from "@/lib/ai/teacher-tutor";
import { planTurn } from "@/lib/learning/tutor-turn";
import { TEACH_MODE_SUMMARY, TEACH_MODE_TUTOR } from "@/lib/learning/tutor-style";
import {
  DONT_KNOW_LINE,
  PRIVATE_TUTOR_PACING,
  ROBOTIC_PHRASE_BAN,
  guessLine,
  hedgedGuess,
  saysDontKnow,
  tutorLadderLine,
} from "@/lib/teacher/tutor-pacing";
import {
  activePrepFromIndex,
  activePrepTurnLines,
  inviteAnswer,
  isSubjectTurn,
  PREP_INVITE_DECLINED_LINE,
  readPrepInvite,
} from "@/lib/teacher/active-prep";
import {
  CHECK_UNDERSTANDING_LINE,
  CONNECT_CONCEPTS_LINE,
  EXPLAIN_SIMPLE_LINE,
  FOLLOW_UP_RULE,
  KEY_CONCEPTS_LINE,
  LIVE_TUTOR_HEAD,
  LIVE_TUTOR_MARKUP,
  PRIVATE_LESSON_LINE,
  WELCOME_ANSWER_LINE,
  activeTestRun,
  findGapsLine,
  firstContactLine,
  liveTutorTurn,
  settleFollowUps,
  tutorFirstName,
} from "@/lib/teacher/live-tutor";
import { extractFollowUps, followUpMarker } from "@/lib/teacher/follow-ups";
import { MORE_COMMANDS } from "@/lib/teacher/more-commands";
import { maybeWriteTutorNotes, notesTrigger, notesUserPrompt, WELCOME_NOTES_PREFACE } from "@/lib/tutor/memory-notes";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const route = read("src/app/api/ai/chat/route.ts");
const USER = "11111111-1111-4111-8111-111111111111";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PREP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

const user = (content: string) => ({ role: "user", content });
const tutor = (content: string) => ({ role: "assistant", content });
const emptySession: TutorSession = { asked: [], lastQuestion: null, answering: false, attempt: 0 };
const plan = (message: string, history: { role: string; content: string }[] = []) => planTurn({ message, style: "hints_first", history });

const INDEX: ChatMaterialIndex = {
  preps: [
    {
      id: PREP,
      title: "Zeltron Bilimi",
      subject: null,
      daysLeft: 12,
      topics: [
        { id: "t1", label: "Zeltron Dalgaları", documentTopicNodeId: null },
        { id: "t2", label: "Varnik Döngüsü", documentTopicNodeId: null },
        { id: "t3", label: "T.O.5.5 Kestar Ölçümü", documentTopicNodeId: null },
      ],
    },
  ],
  documents: [],
};

/* ------------------------------------------------------------------------------------------------------------------ */

describe("bayrak kapalıyken istem ve yanıt bugünkü (kaynak sözleşmeleri)", () => {
  it("tek hamle dili bayt bayt aynı; bayrak kapalı yol hâlâ CHAT_TEACHING_MARKUP okur", () => {
    expect(
      ONE_MOVE_MARKUP.startsWith(
        "TEK HAMLE (kesin; bu kural öbür biçim kurallarından önce gelir):\n" +
          "- Bu turun cevabı en çok 90 kelime (asla 110'u geçme). Bir şey öğret ya da bir şey sor; ikisini birden uzatma.\n" +
          "- En çok BİR soru sor ve mesajı o soruyla bitir.",
      ),
    ).toBe(true);
    expect(route).toContain("${teacherV2 ? (v2Chat ? LIVE_TUTOR_MARKUP : ONE_MOVE_MARKUP) : CHAT_TEACHING_MARKUP}");
    expect(CHAT_TEACHING_MARKUP).toContain("SOHBET ÖĞRETİM DİLİ");
  });

  it("yeni işler yalnız v2 ana sohbette: takip sorusu ayrımı, kaynak işareti, başlık, karşılama, öğrenci bağlamı", () => {
    expect(route).toContain("const v2Chat = teacherV2 && !rest.prepId;\n      v2MainChat = v2Chat;");
    expect(route).toContain("welcomeTurn = v2Chat && rest.welcomeAnswer === true;");
    expect(route).toContain("const followSplit = v2MainChat ? extractFollowUps(drafted.text) : null;");
    expect(route).toContain("const rawDraft = followSplit ? followSplit.body : drafted.text;");
    expect(route).toContain("const titleAnswer = v2MainChat ? extractFollowUps(content).body : content;");
    expect(route).toContain("const followUpTail = v2MainChat && charge && followUpsAllowed ?");
    // Öğretmen v3 satırları seans bloğunun içinde (kriz ve yalnız duygu turunda yok).
    const block = route.indexOf("if (v2Session && !turn.crisis && !turn.feelingOnly) {");
    const live = route.indexOf("const liveTurn = liveTutorTurn({");
    expect(block).toBeGreaterThan(0);
    expect(live).toBeGreaterThan(block);
    expect(live).toBeLessThan(route.indexOf("const moodLine ="));
    // "Kaynaklar:" bloğu bayrak kapalıyken aynen; v2 dalı önce.
    const v2Sources = route.indexOf("} else if (citations.length && v2MainChat) {");
    expect(v2Sources).toBeGreaterThan(0);
    expect(v2Sources).toBeLessThan(route.indexOf('content += "\\n\\nKaynaklar:\\n"'));
  });

  it("model çağrısı sayısı artmaz (takip soruları ana yanıtın içinde)", () => {
    expect(route.match(/chat\.completions\.create\(/g)).toHaveLength(2);
    expect(read("src/lib/teacher/live-tutor.ts")).not.toMatch(/openai|chat\.completions|\.from\(|\.rpc\(/);
    expect(read("src/lib/teacher/active-prep.ts")).not.toMatch(/openai|chat\.completions|\.from\(|\.rpc\(/);
  });

  it("istek şemasında karşılama alanı var; materyal dizini bir kez okunur ve eşleştiriciyle paylaşılır", () => {
    expect(route).toContain("welcomeAnswer: z.boolean().optional(),");
    expect(route).toContain("? quiet(loadChatMaterialIndex(service, userId))");
    expect(route).toContain("index: materialIndexEarly }");
    expect(route.match(/loadChatMaterialIndex\(/g)).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe("canlı özel ders hocası kimliği (istem)", () => {
  it("ana sohbet dili: 2-3 kısa paragraf, hoca kimliği, takip soruları; tek hamlenin öbür kuralları aynen", () => {
    expect(LIVE_TUTOR_MARKUP.startsWith(LIVE_TUTOR_HEAD)).toBe(true);
    expect(LIVE_TUTOR_MARKUP).toContain("2-3 kısa paragraf (paragraf başına 2-3 kısa cümle");
    expect(LIVE_TUTOR_MARKUP).toContain("canlı özel ders hocasısın");
    expect(LIVE_TUTOR_MARKUP).toContain("yalnız sana söylendiği turda (ilk temas)");
    expect(LIVE_TUTOR_MARKUP).not.toContain("en çok 90 kelime");
    expect(LIVE_TUTOR_MARKUP).toContain("En çok BİR soru sor");
    expect(LIVE_TUTOR_MARKUP).toContain("Bu konu notunda yok; ders kitabı bilgisiyle anlatıyorum.");
    expect(LIVE_TUTOR_MARKUP).toContain("Uzlaşıma bağlı konularda");
    expect(LIVE_TUTOR_MARKUP.endsWith(FOLLOW_UP_RULE)).toBe(true);
    expect(FOLLOW_UP_RULE).toContain("[[sorular:Soru bir?|Soru iki?|Soru üç?]]");
    expect(FOLLOW_UP_RULE).toContain("en çok 80 karakter");
    expect(FOLLOW_UP_RULE).toContain("cevabı ele vermez");
  });

  it("Adım Adım Öğret: örnek alanı, Sokratik sabır, 'bilmiyorum'da yargı yok; robotik kalıp yasağı genişledi", () => {
    expect(PRIVATE_TUTOR_PACING).toContain("Örneklerini öğrencinin çalıştığı alandan seç");
    expect(PRIVATE_TUTOR_PACING).toContain("TEK, doğal ve sıcak bir soruyla bitir");
    expect(PRIVATE_TUTOR_PACING).toContain("asla yargılama");
    expect(PRIVATE_TUTOR_PACING).toContain("tam çözümü tek seferde dökme");
    for (const phrase of ["Elbette! İşte cevabınız:", "Belgenize göre", "Notlarınıza göre", "Aşağıda …"]) {
      expect(ROBOTIC_PHRASE_BAN).toContain(phrase);
    }
    // Belge denetiminin iç işaretleri yasak değil.
    expect(ROBOTIC_PHRASE_BAN).toContain("\"Belgeden:\" bölüm başlığı ve [1]/[2] atıfları kalıp değildir");
    expect(ROBOTIC_PHRASE_BAN).not.toMatch(/zeltron|morvala/i);
  });

  it("ad: ilk sözcük, baş harf Türkçe kuralla büyük; e-posta, rakam ya da işaret ad değil", () => {
    expect(tutorFirstName("burhan önder")).toBe("Burhan");
    expect(tutorFirstName("ilayda")).toBe("İlayda");
    expect(tutorFirstName("ali@site.com")).toBeNull();
    expect(tutorFirstName("Ali123")).toBeNull();
    expect(tutorFirstName("")).toBeNull();
    expect(tutorFirstName(null)).toBeNull();
  });

  it("ad yalnız ilk temasta (ilk öğretmen yanıtı ya da karşılama cevabı); sonraki turlarda yok; ad yoksa satır yok", () => {
    const base = { message: "Zeltron dalgası nedir?", welcomeAnswer: false, activePrep: null, gaps: null, suggestTopic: null };
    expect(liveTutorTurn({ ...base, history: [], studentName: "Elif" }).lines).toContain(firstContactLine("Elif"));
    expect(firstContactLine("Elif")).toContain("(«Elif»)");
    expect(liveTutorTurn({ ...base, history: [user("Selam"), tutor("Merhaba!")], studentName: "Elif" }).lines.join("\n")).not.toContain("İLK TEMAS");
    expect(liveTutorTurn({ ...base, history: [], studentName: null }).lines.join("\n")).not.toContain("İLK TEMAS");
    const welcome = liveTutorTurn({ ...base, history: [user("Selam"), tutor("Merhaba!")], studentName: "Elif", welcomeAnswer: true });
    expect(welcome.lines).toContain(firstContactLine("Elif"));
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe("'bilmiyorum', tahmin ve doğru cevap turları (modelsiz tanıyıcı)", () => {
  it("'bilmiyorum' yalnız mesajın tamamıysa (dolgu hariç); istek ya da cevap isteği değil", () => {
    for (const message of ["bilmiyorum", "Hocam hiç bilmiyorum 😅", "hatırlamıyorum", "aklıma gelmiyor", "valla fikrim yok", "Bunu unuttum.", "emin değilim"]) {
      expect(saysDontKnow(message), message).toBe(true);
    }
    for (const message of ["Nereden başlamalıyım bilmiyorum", "bilmiyorum, cevabı göster", "zeltron dalgası nedir bilmiyorum ama", "bence 7"]) {
      expect(saysDontKnow(message), message).toBe(false);
    }
  });

  it("emin olmayan tahmin: 'sanırım', 'galiba', 'acaba'; düz cevap ve 'bilmiyorum' tahmin değil", () => {
    expect(hedgedGuess("Sanırım varnik döngüsü yavaşlar")).toBe(true);
    expect(hedgedGuess("galiba 12")).toBe(true);
    expect(hedgedGuess("morvala katsayısı olabilir mi?")).toBe(true);
    expect(hedgedGuess("bence 7")).toBe(false);
    expect(hedgedGuess("bilmiyorum")).toBe(false);
  });

  const session = (attempt = 1): TutorSession => ({ asked: ["Varnik döngüsünün ilk evresi ne?"], lastQuestion: "Varnik döngüsünün ilk evresi ne?", answering: true, attempt });

  it("Adım Adım Öğret: 'bilmiyorum' merdivenin yerine yargısız benzetme + daha kolay basamak", () => {
    const lines = teacherV2SessionLines({ session: session(), style: TEACH_MODE_TUTOR, plan: plan("bilmiyorum"), message: "bilmiyorum" });
    expect(lines).toContain(DONT_KNOW_LINE);
    expect(lines.join("\n")).not.toContain("CEVAP MERDİVENİ");
    expect(DONT_KNOW_LINE).toContain("asla yargılama");
    expect(DONT_KNOW_LINE).toContain("günlük hayattan doğru bir benzetmeyle");
    expect(DONT_KNOW_LINE).toContain("daha kolay, daha erişilebilir bir basamakta TEK soru");
    // Önceki öğretmen sorusu yoksa satır yok (bağlamsız "bilmiyorum").
    expect(teacherV2SessionLines({ session: emptySession, style: TEACH_MODE_TUTOR, plan: plan("bilmiyorum"), message: "bilmiyorum" })).not.toContain(DONT_KNOW_LINE);
  });

  it("tahmin: doğruysa içten onay, yanlışsa doğrusunu nazikçe ayırıp öğret; hesap sonucunu söylemez", () => {
    const message = "Sanırım varnik döngüsü yavaşlar";
    const lines = teacherV2SessionLines({ session: session(), style: TEACH_MODE_TUTOR, plan: plan(message), message });
    expect(lines).toContain(guessLine("Varnik döngüsünün ilk evresi ne?"));
    const line = guessLine(null);
    expect(line).toContain("içten ve sıcak bir");
    expect(line).toContain("yanlış kısmı doğrusundan nazikçe ayır ve doğru olanı 2-3 kısa cümleyle öğret");
    expect(line).toContain("bir hesabın sonucuysa sonucu söyleme");
    // Hızlı Özet'te de aynı tur satırları.
    expect(teacherV2SessionLines({ session: session(), style: TEACH_MODE_SUMMARY, plan: plan(message), message })).toContain(guessLine("Varnik döngüsünün ilk evresi ne?"));
    expect(teacherV2SessionLines({ session: session(), style: TEACH_MODE_SUMMARY, plan: plan("bilmiyorum"), message: "bilmiyorum" })).toContain(DONT_KNOW_LINE);
  });

  it("düz cevap denemesi: merdiven aynen, doğru cevapta içtenlikle onay", () => {
    const lines = teacherV2SessionLines({ session: session(), style: TEACH_MODE_TUTOR, plan: plan("bence 7"), message: "bence 7" });
    expect(lines).toContain(tutorLadderLine(1, "Varnik döngüsünün ilk evresi ne?"));
    expect(tutorLadderLine(1, null)).toContain("zorluğa orantılı, içten ve çeşitli bir takdirle");
    expect(tutorLadderLine(2, null)).toContain("içtenlikle ve sıcak bir sevinçle onayla");
  });

  it("'bilmiyorum' turundan sonra deneme zinciri baştan başlar", () => {
    const history = [tutor("Varnik döngüsünün ilk evresi ne?"), user("bilmiyorum"), tutor("Bir saat gibi düşün. Peki saat kaçta başlar?")];
    expect(readTutorSession(history, "sabah").attempt).toBe(1);
  });

  it("takip sorusu dokunuşu ve 'Daha fazla' komutu cevap denemesi sayılmaz", () => {
    const reply = "Zeltron dalgası titreşimdir. Sence nereden gelir?\n\n[[sorular:Bu neden önemli?|Başka örnek var mı?|Sınavda nasıl çıkar?]]";
    expect(isAnswerTo("Bu neden önemli?", reply)).toBe(false);
    expect(readTutorSession([user("Zeltron dalgası nedir?"), tutor(reply)], "Bu neden önemli?").answering).toBe(false);
    expect(isAnswerTo(MORE_COMMANDS[5]!.prompt, reply)).toBe(false);
    expect(isAnswerTo("güneşten", reply)).toBe(true);
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe("aktif hazırlık hafızası: öneri bir kez, red sonrası yok", () => {
  const prep = activePrepFromIndex(INDEX, PREP)!;

  it("aktif hazırlık yalnız öğrencinin kendi listesindeki seçili hazırlık; kazanım kodu konudan atılır; Genel'de yok", () => {
    expect(prep.title).toBe("Zeltron Bilimi");
    expect(prep.topics).toEqual(["Zeltron Dalgaları", "Varnik Döngüsü", "Kestar Ölçümü"]);
    expect(activePrepFromIndex(INDEX, null)).toBeNull();
    expect(activePrepFromIndex(INDEX, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toBeNull();
    expect(activePrepTurnLines({ prep: null, history: [], message: "Morvala yasası nedir?", suggestTopic: null }).lines).toEqual([]);
  });

  it("konu sorusu tanıyıcısı: soru/istek ve içerik sözcüğü; selam, takip, komut ve 'bilmiyorum' değil", () => {
    expect(isSubjectTurn("Morvala yasası nedir?")).toBe(true);
    expect(isSubjectTurn("Bana kestar ölçümünü anlat")).toBe(true);
    for (const message of ["Merhaba nasılsın?", "devam et", "bilmiyorum", MORE_COMMANDS[0]!.prompt, "Bugün ne çalışalım?"]) {
      expect(isSubjectTurn(message), message).toBe(false);
    }
  });

  const offTopic = [user("Morvala yasası nedir?"), tutor("Morvala yasası iki kuvvetin dengesidir. Sence hangisi baskın?")];

  it("hazırlık dışı konuda bir tur geçince öneri; bilgi satırı her turda; ilk turda öneri yok", () => {
    const first = activePrepTurnLines({ prep, history: [], message: "Morvala yasası nedir?", suggestTopic: "Varnik Döngüsü" });
    expect(first.invite).toBe("none");
    expect(first.lines).toHaveLength(1);
    expect(first.lines[0]).toContain("AKTİF HAZIRLIK (bilgi)");
    expect(first.lines[0]).toContain("«Zeltron Bilimi» (sınava 12 gün; konuları: Zeltron Dalgaları, Varnik Döngüsü, Kestar Ölçümü)");
    const second = activePrepTurnLines({ prep, history: offTopic, message: "Peki morvala yasasının istisnaları neler?", suggestTopic: "Varnik Döngüsü" });
    expect(second.invite).toBe("invite");
    const invite = second.lines[1]!;
    expect(invite).toContain("yalnız bir kez");
    expect(invite).toContain("Önce bu turun sorusuna tam ve gönülden yardım et");
    expect(invite).toContain("önerebileceğin konu: «Varnik Döngüsü»");
    expect(invite).toContain("Konu aslında bu hazırlığın konularındansa bu satırı yok say");
  });

  it("hazırlığın konusu anılınca öneri yok", () => {
    const history = [user("Zeltron dalgaları nedir?"), tutor("Titreşimdir. Sence?")];
    expect(readPrepInvite(history, "Peki varnik döngüsü nasıl işler?", prep).kind).toBe("none");
    expect(readPrepInvite([], "Kestar ölçümü nedir?", prep).kind).toBe("none");
  });

  const invited = [...offTopic, user("Peki morvala yasasının istisnaları neler?"), tutor("İki istisnası var. Bunu bitirince istersen «Zeltron Bilimi» konularına dönebiliriz. Hangisini merak ediyorsun?")];

  it("red: saygıyla devam, öneri tekrar edilmez; sonraki turlarda da yok", () => {
    const reply = activePrepTurnLines({ prep, history: invited, message: "yok, buradan devam edelim", suggestTopic: null });
    expect(reply.lines).toContain(PREP_INVITE_DECLINED_LINE);
    expect(PREP_INVITE_DECLINED_LINE).toContain("yeniden davet etme");
    const later = [...invited, user("yok, buradan devam edelim"), tutor("Tamam. Birinci istisna şudur. Sence neden?")];
    const after = activePrepTurnLines({ prep, history: later, message: "Morvala katsayısı kaçtır?", suggestTopic: null });
    expect(after.invite).toBe("done");
    expect(after.lines).toHaveLength(1);
  });

  it("kabul: önerilen konudan başla; belirsiz cevap satır açmaz", () => {
    expect(inviteAnswer("olur, geçelim", prep)).toBe("accepted");
    expect(inviteAnswer("Varnik döngüsüne bakalım", prep)).toBe("accepted");
    expect(inviteAnswer("şimdi değil", prep)).toBe("declined");
    expect(inviteAnswer("ikinci istisna ne?", prep)).toBe("other");
    const accepted = activePrepTurnLines({ prep, history: invited, message: "olur, geçelim", suggestTopic: "Varnik Döngüsü" });
    expect(accepted.lines[1]).toContain("önerdiğin «Varnik Döngüsü» konusundan");
    expect(activePrepTurnLines({ prep, history: invited, message: "ikinci istisna ne?", suggestTopic: null }).lines).toHaveLength(1);
  });

  it("karşılama, komut ve test turunda öneri yapılmaz (öğrenci yön verdi)", () => {
    const turn = liveTutorTurn({
      message: MORE_COMMANDS[1]!.prompt,
      history: offTopic,
      welcomeAnswer: false,
      studentName: null,
      activePrep: prep,
      gaps: null,
      suggestTopic: null,
    });
    expect(turn.invite).toBe("none");
    expect(turn.lines.join("\n")).not.toContain("AKTİF HAZIRLIK DAVETİ");
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe("dinamik takip soruları", () => {
  it("işaret ayrılır, normalleşir; yanıtın kendi sorusuyla aynı olan düşer; tek işaret", () => {
    const draft = "Zeltron dalgası titreşimdir.\n\nSence bu neden önemli?\n\n[[sorular:↳ Bu neden önemli|Sence bu neden önemli?|Bu neden önemli?|Başka örnek var mı?]]";
    const split = extractFollowUps(draft);
    expect(split.body).toBe("Zeltron dalgası titreşimdir.\n\nSence bu neden önemli?");
    const settled = settleFollowUps(split.questions, split.body);
    // Yanıtın sorusunu tekrar eden düşer, aynısı bir kez kalır; düşenin yerine sıradaki gelir.
    expect(settled).toEqual(["Bu neden önemli?", "Başka örnek var mı?"]);
    expect(followUpMarker(settled)).toBe("[[sorular:Bu neden önemli?|Başka örnek var mı?]]");
  });

  it("model yazmadıysa soru uydurulmaz", () => {
    const split = extractFollowUps("Kısa bir anlatım. Sence?");
    expect(split.questions).toEqual([]);
    expect(followUpMarker(settleFollowUps(split.questions, split.body))).toBe("");
  });

  it("işaret denetimden ÖNCE ayrılır, kayıttan önce en sona tek işaret olarak eklenir; çip işareti yok", () => {
    const split = route.indexOf("const followSplit = v2MainChat ? extractFollowUps(drafted.text) : null;");
    expect(split).toBeGreaterThan(0);
    expect(split).toBeLessThan(route.indexOf("const verified = await verifyEducationalContent({ client,"));
    expect(split).toBeLessThan(route.indexOf("const local = localDocumentCheck({"));
    expect(split).toBeLessThan(route.indexOf("const settled = settleOneMove(content);"));
    const tail = route.indexOf("if (followUpTail) content += `\\n\\n${followUpTail}`;");
    expect(tail).toBeGreaterThan(route.indexOf("content += `\\n\\n${chatActions.map(actionMarker).join(\"\\n\")}`"));
    expect(tail).toBeLessThan(route.indexOf('service.rpc("complete_chat_operation"'));
    expect(route).toContain('extractFollowUps(content.replace(/\\[\\[chip:[^\\]]*\\]\\]/g, ""))');
    // Kabul edilen taslak yoksa (yedek mesaj) takip sorusu yok.
    expect(route).toContain("if (!accepted) {\n        followUps = [];");
  });

  it("kriz, yalnız duygu, karşılama ve test turunda takip soruları eklenmez", () => {
    expect(route.indexOf("followUpsAllowed = !liveTurn.noFollowUps;")).toBeGreaterThan(
      route.indexOf("if (v2Session && !turn.crisis && !turn.feelingOnly) {"),
    );
    const base = { history: [], studentName: null, activePrep: null, gaps: null, suggestTopic: null };
    expect(liveTutorTurn({ ...base, message: "Selam", welcomeAnswer: true }).noFollowUps).toBe(true);
    expect(liveTutorTurn({ ...base, message: MORE_COMMANDS[5]!.prompt, welcomeAnswer: false }).noFollowUps).toBe(true);
    expect(liveTutorTurn({ ...base, message: "Zeltron dalgası nedir?", welcomeAnswer: false }).noFollowUps).toBe(false);
  });

  it("v2 ana sohbette 'Kaynaklar:' metni yerine kaynak işareti; denetim etkilenmez", () => {
    const at = route.indexOf("} else if (citations.length && v2MainChat) {");
    const block = route.slice(at, route.indexOf('content += "\\n\\nKaynaklar:\\n"'));
    expect(block).toContain("citationMarker({");
    expect(block).not.toContain('"\\n\\nKaynaklar:');
    expect(at).toBeGreaterThan(route.indexOf("const local = localDocumentCheck({"));
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe("'Daha fazla' komutları", () => {
  const turnFor = (message: string, gaps: Parameters<typeof findGapsLine>[0] = null) =>
    liveTutorTurn({ message, history: [], welcomeAnswer: false, studentName: null, activePrep: null, gaps, suggestTopic: null });

  it("her komut tanınır ve kendi tur satırını alır", () => {
    const expected: Record<string, string> = {
      private_lesson: PRIVATE_LESSON_LINE,
      key_concepts: KEY_CONCEPTS_LINE,
      connect_concepts: CONNECT_CONCEPTS_LINE,
      check_understanding: CHECK_UNDERSTANDING_LINE,
    };
    for (const command of MORE_COMMANDS) {
      const turn = turnFor(command.prompt);
      expect(turn.command, command.id).toBe(command.id);
      if (expected[command.id]) expect(turn.lines, command.id).toContain(expected[command.id]);
    }
    expect(PRIVATE_LESSON_LINE).toContain("yalnız ilk parçayı");
    expect(CHECK_UNDERSTANDING_LINE).toContain("❓ Yoklama:");
    expect(CHECK_UNDERSTANDING_LINE).toContain("TEK soru sor ve cevabını bekle");
  });

  it("'5 yaşındaymışım gibi' var olan sadeleştirme kuralıyla birleşir (kural iki kez yazılmaz)", () => {
    const prompt = MORE_COMMANDS.find((command) => command.id === "explain_simple")!.prompt;
    expect(simplifyLine(prompt)).toBe(SIMPLIFY_LINE);
    const turn = turnFor(prompt);
    expect(turn.lines).toContain(EXPLAIN_SIMPLE_LINE);
    expect(turn.lines.join("\n")).not.toContain(SIMPLIFY_LINE);
    expect(EXPLAIN_SIMPLE_LINE).toContain("SADELEŞTİR kuralıyla birlikte");
  });

  it("eksik noktalar: kayıt varsa yalnız kayıttan; yoksa dürüst teşhis sorusu", () => {
    const prompt = MORE_COMMANDS.find((command) => command.id === "find_gaps")!.prompt;
    const withGaps = turnFor(prompt, { topics: ["Varnik Döngüsü"], mistakes: [{ question: "Kestar katsayısı kaçtır?", topic: "Kestar Ölçümü" }] });
    const line = withGaps.lines.join("\n");
    expect(line).toContain("zayıf konular: Varnik Döngüsü");
    expect(line).toContain("«Kestar katsayısı kaçtır?» (Kestar Ölçümü)");
    expect(line).toContain("Kayıtta olmayan eksik uydurma");
    const without = findGapsLine(null);
    expect(without).toContain("henüz zayıf konu ya da çözülmemiş yanlış yok");
    expect(without).toContain("TEK teşhis sorusuyla başla");
  });

  it("'anladığını test et' sürüyor: cevap merdiveninin yerine değerlendir + sıradaki tek soru", () => {
    const command = MORE_COMMANDS.find((item) => item.id === "check_understanding")!.prompt;
    const history = [user(command), tutor("İlk soru: zeltron dalgası mı varnik döngüsü mü daha hızlı?")];
    expect(activeTestRun(history, "zeltron")).toEqual({ answered: 1 });
    const later = [...history, user("zeltron"), tutor("Doğru! İkinci soru: kestar neyi ölçer?")];
    expect(activeTestRun(later, "uzunluğu")).toEqual({ answered: 2 });
    // Araya yeni bir soru girerse test bitmiştir.
    expect(activeTestRun([...later, user("Morvala yasası nedir?"), tutor("Bir denge. Sence?")], "bence ağır")).toBeNull();
    const session = readTutorSession(later, "uzunluğu");
    const lines = teacherV2SessionLines({ session, style: TEACH_MODE_TUTOR, plan: plan("uzunluğu"), message: "uzunluğu", testRun: { answered: 2 } });
    expect(lines).toContain(testRunLine(2));
    expect(lines.join("\n")).not.toContain("CEVAP MERDİVENİ");
    expect(testRunLine(2)).toContain("bu, 2. cevabı");
    expect(liveTutorTurn({ message: "uzunluğu", history: later, welcomeAnswer: false, studentName: null, activePrep: null, gaps: null, suggestTopic: null }).testRun).toEqual({ answered: 2 });
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe("karşılama cevabı ve öğretmen notunun zorlanması", () => {
  it("karşılama turu: teşekkür, hatırlayacağını söyle, nasıl ilerleyeceğinizi öner, tek soru; merdiven yok", () => {
    const turn = liveTutorTurn({ message: "Kısa adımlarla öğreniyorum, varnik döngüsünde zorlanıyorum", history: [], welcomeAnswer: true, studentName: "Elif", activePrep: null, gaps: null, suggestTopic: null });
    expect(turn.lines).toContain(WELCOME_ANSWER_LINE);
    expect(turn.command).toBeNull();
    expect(WELCOME_ANSWER_LINE).toContain("Kısa ve sıcak bir teşekkürle başla");
    expect(WELCOME_ANSWER_LINE).toContain("aklında tutacağını");
    expect(WELCOME_ANSWER_LINE).toContain("nereden başlamak istediğini soran tek soruyla bitir");
    expect(route).toContain("if (!welcomeTurn) {\n          turnLines.push(...teacherV2SessionLines({ session: v2Session, style: teachStyle, plan: turn.plan, message, testRun: liveTurn.testRun }));");
  });

  it("tetik: karşılamada iki mesaj yeter (30 dk / 8 mesaj beklenmez); öğrenci mesajı yoksa yok", () => {
    const rows = [
      { role: "assistant", content: "Teşekkürler!", createdAt: "2026-11-21T10:00:00Z" },
      { role: "user", content: "Kısa adımları seviyorum", createdAt: "2026-11-21T10:00:00Z" },
    ];
    expect(notesTrigger({ newestFirst: rows, assistantCount: 1 })).toBeNull();
    const trigger = notesTrigger({ newestFirst: rows, assistantCount: 1, force: "welcome" })!;
    expect(trigger.reason).toBe("welcome_answer");
    expect(trigger.anchor).toBeNull();
    expect(trigger.window.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(notesTrigger({ newestFirst: [rows[0]!], assistantCount: 1, force: "welcome" })).toBeNull();
    expect(notesUserPrompt(trigger.window, { welcome: true }).startsWith(WELCOME_NOTES_PREFACE)).toBe(true);
    expect(notesUserPrompt(trigger.window)).not.toContain(WELCOME_NOTES_PREFACE);
  });

  type Call = { table: string; ops: string[]; insert?: unknown };
  function notesService(prior: { id: string }[]) {
    const calls: Call[] = [];
    const service = {
      calls,
      from(table: string) {
        const call: Call = { table, ops: [] };
        calls.push(call);
        const respond = () => {
          if (table === "messages") {
            if (call.ops.some((op) => op.includes('"head":true'))) return { data: null, error: null, count: 1 };
            return {
              data: [
                { role: "assistant", content: "Teşekkürler, kısa adımlarla gideriz. Nereden başlayalım?", created_at: "2026-11-21T10:00:00Z" },
                { role: "user", content: "Kısa adımlarla öğreniyorum; varnik döngüsünde zorlanıyorum", created_at: "2026-11-21T10:00:00Z" },
              ],
              error: null,
            };
          }
          if (table === "tutor_memory_notes") return call.insert ? { data: null, error: null } : { data: prior, error: null };
          return { data: [], error: null };
        };
        const proxy: Record<string, unknown> = new Proxy(
          {},
          {
            get(_t, prop: string) {
              if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(respond()).then(resolve);
              return (...args: unknown[]) => {
                if (prop === "insert") call.insert = args[0];
                call.ops.push(`${prop}:${JSON.stringify(args[0] ?? null)}${args[1] !== undefined ? JSON.stringify(args[1]) : ""}`);
                return proxy;
              };
            },
          },
        );
        return proxy;
      },
      rpc: vi.fn(async () => ({ data: null, error: null })),
    };
    return service;
  }
  const reply = JSON.stringify({ notes: [{ note: "Kısa adımlarla öğrenmeyi tercih ediyor", kind: "preference" }, { note: "Varnik döngüsünde zorlanıyor", kind: "stuck" }] });

  it("zorlanan yazım: tek küçük çağrı, kredisiz; bu konuşmada not varsa yazılmaz (eşik yok, bir kez)", async () => {
    const service = notesService([]);
    const create = vi.fn(async () => ({ choices: [{ message: { content: reply } }], usage: { prompt_tokens: 50, completion_tokens: 20 } }));
    const result = await maybeWriteTutorNotes(service as never, { userId: USER, conversationId: CONV, client: { chat: { completions: { create } } } as never, model: "test-model", force: "welcome" });
    expect(result).toEqual({ written: 2, reason: "welcome_answer" });
    expect(create).toHaveBeenCalledTimes(1);
    const prompt = (create.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0].messages[1]!.content;
    expect(prompt).toContain(WELCOME_NOTES_PREFACE);
    const check = service.calls.find((call) => call.table === "tutor_memory_notes" && !call.insert)!;
    expect(check.ops.join(" ")).toContain(`eq:"conversation_id""${CONV}"`);
    expect(check.ops.join(" ")).not.toContain("gte:");
    expect(service.calls.some((call) => call.table.startsWith("credit"))).toBe(false);

    const noted = vi.fn();
    const again = await maybeWriteTutorNotes(notesService([{ id: "n1" }]) as never, { userId: USER, conversationId: CONV, client: { chat: { completions: { create: noted } } } as never, model: "test-model", force: "welcome" });
    expect(again.reason).toBe("already_noted");
    expect(noted).not.toHaveBeenCalled();
  });

  it("sohbet ucu: karşılama turunda not yazımı yanıttan sonra zorlanır; olağan tetik o turda koşmaz", () => {
    const at = route.indexOf('maybeWriteTutorNotes(service, { userId, conversationId: welcomeConversationId, force: "welcome" })');
    expect(at).toBeGreaterThan(route.indexOf('service.rpc("complete_chat_operation"'));
    expect(route.slice(at - 200, at)).toContain("after(() =>");
    expect(route).toContain("if (welcomeTurn && charge && welcomeConversationId) {");
    expect(route).toContain("const welcomeConversationId = rest.conversationId ?? savedConversationId ?? null;");
    expect(route).toContain("if (teacherV2 && !rest.prepId && rest.conversationId && charge && !welcomeTurn) {");
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe("belge sayfasının kapsam raporu yalnız yönetici ve kurucuya", () => {
  it("rapor öğrenciye gönderilmez (bileşen raporu yalnız veri varsa çizer); yetki var olan yardımcıdan", () => {
    const page = read("src/app/dokumanlar/[documentId]/page.tsx");
    expect(page).toContain("const admin = await isAdminUser(service, user.id);");
    expect(page).toContain("admin && snapshot.coverage");
    const editor = read("src/components/documents/topic-map-editor.tsx");
    expect(editor).toContain("{coverage ? (");
  });
});
