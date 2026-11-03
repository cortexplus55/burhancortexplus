import { describe, expect, it } from "vitest";
import { disputedIssues, v14CodeIssue } from "@/lib/content-pool/gate-v14";
import { nearestStem } from "@/lib/content-pool/near-duplicate";

describe("Katman 1b: tartışmalı bilgi", () => {
  it("Sebük Tigin'i tek kurucu veren soruyu reddeder", () => {
    const item = {
      stem: "Sebük Tigin tarafından kurulan ve başkenti Gazne olan Türk-İslam devleti aşağıdakilerden hangisidir?",
      choices: ["Karahanlılar", "Gazneliler", "Büyük Selçuklular", "Tolunoğulları", "Harzemşahlar"],
      answer: 1,
      explanation: "Sebük Tigin, Gaznelilerin kurucusu kabul edilir; devletin merkezi Gazne’dir.\nDoğru cevap: Gazneliler",
    };
    expect(v14CodeIssue(item)).toMatch(/gazneliler_kurucu/);
    expect(disputedIssues("II. Gaznelilerin kurucusu Sebük Tigin’dir.")).toHaveLength(1);
  });
  it("Alp Tigin'li dengeli anlatımı ve ilgisiz metni geçirir", () => {
    expect(disputedIssues("Gazneli Devleti 963’te Alp Tigin tarafından kuruldu; Sebük Tigin hanedanı kurdu.")).toEqual([]);
    expect(disputedIssues("Gazneli Mahmud Sebük Tigin’in oğludur.")).toEqual([]);
  });
});

describe("yakın kopya", () => {
  it("aynı kalıplı, yargıları az değişen kökü yakalar; farklı kökü geçirir", () => {
    const a = "Karahanlılar ve Gaznelilerle ilgili aşağıdaki yargılardan hangileri doğrudur? I. Karahanlılar, Gaznelilerden önce ortaya çıkmıştır. II. Karahanlılar İslamiyet’i kabul eden ilk Türk devletidir.";
    const b = "Karahanlılar ve Gaznelilerle ilgili aşağıdaki yargılardan hangileri doğrudur? I. Karahanlılar, Gaznelilerden önce ortaya çıkmıştır. II. Karahanlılar İslamiyet’i kabul eden ilk Türk devleti sayılır.";
    expect(nearestStem(b, [a]).duplicate).toBe(true);
    expect(nearestStem("1040 Dandanakan Savaşı hangi iki devlet arasında yapılmıştır?", [a]).duplicate).toBe(false);
  });
});
