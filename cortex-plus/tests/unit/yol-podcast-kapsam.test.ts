import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prepTopicScopeLine, topicScopeLine } from "@/lib/documents/generation-context";

/*
  30 Ekim 2026, canlı: yoldaki "Miktar Teorisi ve Fisher'in Değişim Denklemi" podcast'i aynı sayfadaki tahvil işlemleri,
  reel faiz ve Phillips eğrisi bölümlerini de anlattı. İlk düzeltme Araçlar satırını aldı ("sayfadaki başka başlıklar
  bölüm olmaz"). Aynı gün Astra ile yan yana kurulan 4 sayfalık notta harita konuya yine bu adı verdi ama reel faiz ve
  Phillips eğrisi başka hiçbir konunun değildi: o satırla podcast'te hiç anlatılmayacaktı. Hazırlıkta yalnız ÖBÜR
  konuların kısımları dışarıda kalır.
*/

describe("belgeli podcast hazırlığın öbür konularını anlatmaz, kendi sayfasını eksiksiz anlatır", () => {
  const topic = "Miktar Teorisi ve Fisher'in Değişim Denklemi";

  it("satır öbür konuları adıyla sayar, sayfada kalan başlıkları konuya bırakır", () => {
    const line = prepTopicScopeLine(topic, [topic, "Para Politikasının Amacı ve Politika Duruşları", "Enflasyonun Tanımı"]);
    expect(line).toContain(`«${topic}»`);
    expect(line).toContain("«Para Politikasının Amacı ve Politika Duruşları», «Enflasyonun Tanımı»");
    expect(line).toContain("Sayfalarda kalan öbür bütün başlıklar bu konunun kapsamındadır");
    // Konunun kendisi öbür konular arasında sayılmaz (büyük/küçük harf farkı da).
    expect(line.match(/Miktar Teorisi/g)).toHaveLength(1);
    expect(prepTopicScopeLine(topic, [topic.toLocaleUpperCase("tr"), "Enflasyonun Tanımı"]).match(/Miktar|MİKTAR/g)).toHaveLength(1);
  });

  it("öbür konu yoksa satır yok (bütün sayfa bu konunun)", () => {
    expect(prepTopicScopeLine(topic, [])).toBe("");
    expect(prepTopicScopeLine(topic, [topic, "  "])).toBe("");
  });

  it("Araçlar satırı dar kalır: öğrenci konuyu kendisi yazdı", () => {
    const line = topicScopeLine({ wholeDocument: false, matched: true, topicTitle: topic }, topic);
    expect(line).toContain("onları bölüm yapma");
  });

  it("yol podcast'i ve hazırlık podcast sayfası öbür konuları yükleyip satırı yazara verir (belgeli olunca)", () => {
    const node = readFileSync("src/lib/learning/node/podcast.ts", "utf8");
    expect(node).toContain("core && input.prepId && input.topicLabel !== ALL_TOPICS_LABEL ? await prepTopicLabels(input.service, input.prepId) : []");
    expect(node).toContain("siblings.length ? prepTopicScopeLine(input.topicLabel, siblings) : \"\"");
    const prep = readFileSync("src/app/api/learning/exam-prep/podcast/route.ts", "utf8");
    expect(prep).toContain("topicDocumentId ? prepTopicScopeLine(topic.label, await prepTopicLabels(service, prepId)) : \"\"");
  });
});
