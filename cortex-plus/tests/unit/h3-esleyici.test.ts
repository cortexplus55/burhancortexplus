/**
 * H3 (15 Kasım 2026, #662 regresyonu): ana sohbetin materyal eşleştiricisi tek bir beş harflik ortak öneki eşleşme
 * sayıyordu. Canlıda "karıştırıyorum" sözcüğü bir kimya hazırlığının "Karışımlar" konusuna bağlandı; ilgisiz bir matematik
 * sorusuna "«… · Karışımlar» notunda eşleşen parça bulunamadı" satırı gitti ve "Genel" sohbette hazırlık adı sızdı.
 * Kural: tek sözcüklük eşleşme ancak güçlüyse; kanıt yoksa ve öğrenci notunu anmadıysa bağlantı satırı yok.
 */
import { describe, expect, it } from "vitest";
import {
  matchChatMaterial,
  materialTurnLines,
  phraseScore,
  type ChatMaterialIndex,
} from "@/lib/ai/chat-material-link";

const index: ChatMaterialIndex = {
  preps: [
    {
      id: "p-kimya",
      title: "Kimya hazırlık",
      subject: null,
      daysLeft: 12,
      topics: [{ id: "t-1", label: "Karışımlar", documentTopicNodeId: null }],
    },
    {
      id: "p-bio",
      title: "Biyoloji vize",
      subject: null,
      daysLeft: 5,
      topics: [
        { id: "t-2", label: "Mayoz", documentTopicNodeId: null },
        { id: "t-3", label: "Hücre Zarı ve Osmoz", documentTopicNodeId: null },
      ],
    },
    {
      id: "p-fizik",
      title: "Fizik",
      subject: null,
      daysLeft: null,
      topics: [{ id: "t-4", label: "Kuvvet ve Hareket", documentTopicNodeId: null }],
    },
  ],
  documents: [],
};

const tone = { confused: false, wantsWhy: false };
const noIntent = { summary: false, tool: null };

describe("tek sözcüklük eşleşme yalnız güçlüyse", () => {
  it("ortak beş harflik önek (fiil ile konu adı) eşleşme değildir", () => {
    const match = matchChatMaterial("Üslü sayılarda negatif üssü hep karıştırıyorum. 2^-3 neden 1/8 oluyor?", index);
    expect(match.reason).toBe("none");
    expect(match.preps).toEqual([]);
  });

  it("sözcüğün tamamı (ekli biçimi) ya da altı harf ortak eşleşmedir", () => {
    expect(matchChatMaterial("mayozun evrelerini karıştırdım", index).preps[0]?.prep.id).toBe("p-bio");
    expect(matchChatMaterial("osmozu anlatır mısın", index).preps[0]?.topic?.id).toBe("t-3");
    expect(matchChatMaterial("kuvveti hiç anlamadım", index).preps[0]?.prep.id).toBe("p-fizik");
  });

  it("iki ortak kök eşleşmeyi tek başına sağlar (değişmedi)", () => {
    expect(phraseScore("Hücre Zarı ve Osmoz", ["hücre", "zarı"])).toBeGreaterThan(0);
  });
});

describe("bağlantı satırı yalnız kanıt varsa ya da öğrenci notunu andıysa", () => {
  const named = matchChatMaterial("mayozun evrelerini karıştırdım", index);

  it("kanıt yok, not anılmadı → hazırlık adı ve 'bulunamadı' isteme gitmez", () => {
    const lines = materialTurnLines({ match: named, intent: noIntent, hasEvidence: false, optionCount: 5, tone, linkLine: true });
    expect(lines.join("\n")).not.toContain("ÖĞRENCİNİN KENDİ MATERYALİ");
    expect(lines.join("\n")).not.toContain("Biyoloji vize");
  });

  it("kanıt varsa satır gider (parçalar onun notundan)", () => {
    const lines = materialTurnLines({ match: named, intent: noIntent, hasEvidence: true, optionCount: 5, tone, linkLine: true });
    expect(lines.join("\n")).toContain("ÖĞRENCİNİN KENDİ MATERYALİ");
  });

  it("öğrenci notunu açıkça andıysa kanıt olmasa da satır gider", () => {
    const cued = matchChatMaterial("notumdaki mayoz kısmını özetle", index);
    expect(cued.materialCue).toBe(true);
    const lines = materialTurnLines({ match: cued, intent: noIntent, hasEvidence: false, optionCount: 5, tone, linkLine: true });
    expect(lines.join("\n")).toContain("ÖĞRENCİNİN KENDİ MATERYALİ");
  });
});
