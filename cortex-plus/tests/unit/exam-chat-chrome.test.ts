import { describe, expect, it } from "vitest";
import {
  EXAM_CHAT_STARTERS,
  EXAM_QUICK_COMMANDS,
} from "@/lib/learning/exam-chat-chrome";
import {
  conversationBucket,
  conversationMeta,
  conversationWhen,
} from "@/lib/student/conversation-time";

describe("exam chat starters", () => {
  it("uses the four greeting chips", () => {
    expect(EXAM_CHAT_STARTERS.map((item) => item.label)).toEqual([
      "Anlamadığım bir şeyi açıkla",
      "Son testimi veya dersimi gözden geçir",
      "Zayıf noktalarımı bul",
      "Çalışma stratejilerini konuşalım",
    ]);
  });

  it("uses the six quick commands", () => {
    expect(EXAM_QUICK_COMMANDS.map((item) => item.label)).toEqual([
      "Bana özel ders ver",
      "5 yaşındaymışım gibi anlat",
      "Temel kavramları vurgula",
      "Kavramlar arasında bağlantı kur",
      "Eksik olduğum noktaları bul",
      "Konuyu ne kadar iyi anladığımı test et",
    ]);
  });
});

describe("conversation history time", () => {
  const now = new Date("2026-09-24T12:00:00").getTime();

  it("groups today, this month, and older chats", () => {
    expect(conversationBucket("2026-09-24T11:00:00", now)).toBe("BUGÜN");
    expect(conversationBucket("2026-09-19T12:00:00", now)).toBe("BU AY");
    expect(conversationBucket("2026-08-01T12:00:00", now)).toBe("DAHA ESKİ");
  });

  it("writes seconds, days, and weeks without inventing a subject", () => {
    expect(conversationWhen(new Date(now - 17_000).toISOString(), now)).toBe("17 saniye önce");
    expect(conversationWhen(new Date(now - 5 * 86_400_000).toISOString(), now)).toBe(
      "5 gün önce",
    );
    expect(conversationWhen(new Date(now - 14 * 86_400_000).toISOString(), now)).toBe(
      "2 hafta önce",
    );
    const seventeen = new Date(now - 17_000).toISOString();
    expect(conversationMeta(seventeen, null, now)).toBe("17 saniye önce");
    expect(conversationMeta("2026-09-19T12:00:00", "Matematik", now)).toBe(
      "Matematik • 5 gün önce",
    );
  });
});
