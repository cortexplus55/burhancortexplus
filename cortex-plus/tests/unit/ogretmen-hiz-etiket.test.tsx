// @vitest-environment jsdom
/**
 * /ogretmen hız ve etiket düzeltmeleri (15 Kasım 2026, ürün sahibi). Canlı kayıt: tipik cevapta yazım ~16 sn, eğitim
 * denetimi ~6 sn, kaynak denetimi 16-27 sn (toplam 45-58 sn, öğrenci hiçbir şey görmeden). Yönlendirme ve empati cümlesi
 * "Materyal dışı / Bu, belgede yok" damgası alıyor, kaynak denetimi düşünce metinde sahipsiz [2] kalıyordu.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type OpenAI from "openai";
import { localDocumentCheck } from "@/lib/ai/document-answer-verification";
import { pedagogicalOnly, settlePedagogicalLabels, stripOrphanCitations } from "@/lib/ai/chat-answer-settle";
import { createChatDraft } from "@/lib/ai/chat-draft";
import { chatSourceBlock } from "@/lib/learning/chat-source-block";
import { TutorReplyView } from "@/components/chat/tutor-reply-view";
import type { ChatEvidence } from "@/lib/ai/chat-citations";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const evidence: ChatEvidence[] = [
  { reference: 1, documentId: "d1", documentName: "not.pdf", pageNumber: 2, chunkId: "c1",
    content: "Sıvı basıncı derinlikle doğru orantılıdır: P = h · d · g. Yoğunluğu 1000 kg/m³ olan suda her 10 m'de basınç yaklaşık 1 atm artar." },
  { reference: 2, documentId: "d1", documentName: "not.pdf", pageNumber: 5, chunkId: "c2",
    content: "Kaldırma kuvveti cismin batan hacmi kadar sıvının ağırlığına eşittir; yüzen cisimde kaldırma kuvveti ağırlığa eşittir." },
];

describe("kodla kaynak kontrolü (model çağrısı yok)", () => {
  it("sayıları kaynakta geçen cevap şüphesiz geçer; atıf gerçek kaynağı gösterir", () => {
    const answer = "Belgeden:\nBasınç derinlikle artar [1]; suyun yoğunluğu 1.000 kg/m³ alınır ve her 10 m'de yaklaşık 1 atm eklenir.";
    const check = localDocumentCheck({ question: "Basınç neden derinlikle artar?", answer, evidence });
    expect(check).toMatchObject({ ok: true, suspicious: false });
    expect(check.citations.map((item) => item.reference)).toEqual([1]);
  });

  it("atıf yoksa en çok örtüşen kaynak seçilir", () => {
    const answer = "Belgeden:\nYüzen cisimde kaldırma kuvveti ağırlığa eşittir; batan hacim kadar sıvının ağırlığı kadardır.";
    const check = localDocumentCheck({ question: "Yüzen cisim", answer, evidence });
    expect(check.ok).toBe(true);
    expect(check.citations.map((item) => item.reference)).toEqual([2]);
  });

  it("kaynakta ve soruda olmayan sayı şüphe doğurur (yalnız o zaman hızlı model denetimi)", () => {
    const answer = "Belgeden:\nHer 25 m'de basınç 3 atm artar [1].";
    const check = localDocumentCheck({ question: "Basınç kaç artar?", answer, evidence });
    expect(check.ok).toBe(true);
    expect(check.suspicious).toBe(true);
  });

  it("sorudaki sayı ve satır başı liste numarası şüphe sayılmaz", () => {
    const answer = "Belgeden:\n1. 35 m derinlikte basınç artar.\n2. Formül P = h · d · g [1].";
    expect(localDocumentCheck({ question: "35 m derinlikte basınç ne olur?", answer, evidence }).suspicious).toBe(false);
  });

  it("genel bilgi bölümünde atıf varsa biçim hatası", () => {
    const answer = "Belgeden:\nBasınç derinlikle artar [1].\n\nMateryal dışı:\nDeniz altında da böyledir [2].";
    const check = localDocumentCheck({ question: "Basınç", answer, evidence });
    expect(check.ok).toBe(false);
    expect(check.reasons).toContain("citation_in_general_part");
  });
});

describe("pedagojik bölüm etiketi", () => {
  it("yalnız benzetme ve sorudan oluşan bölüm etiketsiz kalır, 'kaynakta yok' satırı düşer", () => {
    const answer = [
      "Bu, yüklediğin kaynakta yok — genel bilgiyle anlatıyorum:",
      "Belgeden:",
      "Sıvı basıncı derinlikle artar [1].",
      "",
      "Materyal dışı:",
      "> 💡 Benzetme: Bir yığın kitabın en alttakini düşün; üstündeki her kitap onu biraz daha bastırır.",
      "",
      "Sence bu yüzden mi baraj duvarları aşağıda kalındır?",
    ].join("\n");
    const settled = settlePedagogicalLabels(answer);
    expect(settled).not.toMatch(/Materyal dışı|kaynakta yok/);
    expect(settled).toContain("Belgeden:");
    expect(settled).toContain("> 💡 Benzetme: Bir yığın kitabın");
    expect(settled).toContain("Sence bu yüzden mi baraj duvarları aşağıda kalındır?");
  });

  it("bilgi taşıyan genel bölümün etiketi kalır", () => {
    const answer = "Belgeden:\nBasınç derinlikle artar [1].\n\nMateryal dışı: Atmosfer basıncı deniz seviyesinde yaklaşık 101 kPa'dır.";
    expect(settlePedagogicalLabels(answer)).toBe(answer);
  });

  it("model bütün cevabı genel bilgi diye açıkladıysa satır ve etiket kalır", () => {
    const answer = "Bu, yüklediğin kaynakta yok — genel bilgiyle anlatıyorum:\nMateryal dışı:\nFotosentez klorofil taşıyan hücrelerde ışık enerjisiyle besin üretimidir.";
    expect(settlePedagogicalLabels(answer)).toBe(answer);
  });

  it("stüdyo yönlendirmesi turunda rakamsız bölümün etiketi ve 'kaynakta yok' satırı kalkar", () => {
    const answer = "Bu, yüklediğin kaynakta yok — genel bilgiyle anlatıyorum:\nMateryal dışı:\nSenin için bu konudan bir test hazırladım; aşağıdaki düğmeden başlatabilirsin.";
    const settled = settlePedagogicalLabels(answer, { redirect: true });
    expect(settled).toBe("Senin için bu konudan bir test hazırladım; aşağıdaki düğmeden başlatabilirsin.");
  });

  it("etiketsiz cevaba dokunulmaz", () => {
    const answer = "Çok iyi bir soru. Basınç derinlikle artar.";
    expect(settlePedagogicalLabels(answer)).toBe(answer);
  });

  it("pedagojik bölüm ölçüsü: rakam ya da eşitlik bilgi sayılır", () => {
    expect(pedagogicalOnly("> 💡 Benzetme: kitap yığını gibi.\nHazır mısın?")).toBe(true);
    expect(pedagogicalOnly("Su 100 °C'de kaynar.")).toBe(false);
    expect(pedagogicalOnly("F = m · a")).toBe(false);
  });
});

describe("sahipsiz atıf", () => {
  it("listede olmayan numara silinir, olan kalır; bağlantı ve kod bloğu dokunulmaz", () => {
    const text = "Basınç artar [1] ve kuvvet değişir [2]. Bkz [3](/x).\n```\na = b[2]\n```";
    expect(stripOrphanCitations(text, [1])).toBe("Basınç artar [1] ve kuvvet değişir. Bkz [3](/x).\n```\na = b[2]\n```");
    expect(stripOrphanCitations("Tek kaynak [2].")).toBe("Tek kaynak.");
  });

  it("ekranda kaynak listesi yoksa çıplak [n] görünmez, varsa kalır", () => {
    const { rerender } = render(<TutorReplyView content={"Basınç derinlikle artar [2]."} />);
    expect(screen.queryByText(/\[2\]/)).toBeNull();
    rerender(<TutorReplyView content={"Basınç derinlikle artar [2].\n\nKaynaklar:\n- [2] [not.pdf · s.5](/dokumanlar/d1?page=5#belge-onizleme)"} />);
    expect(screen.getAllByText(/\[2\]/).length).toBeGreaterThan(0);
  });
});

describe("akışlı taslak", () => {
  it("parçalar geldiği anda ekrana gider; kullanım akışın sonundan okunur", async () => {
    async function* chunks() {
      yield { choices: [{ delta: { content: "  Basınç" } }] };
      yield { choices: [{ delta: { content: " artar." } }] };
      yield { choices: [], usage: { prompt_tokens: 120, completion_tokens: 30 } };
    }
    const create = vi.fn(async (_body: unknown) => chunks());
    const client = { chat: { completions: { create } } } as unknown as OpenAI;
    const pieces: string[] = [];
    const draft = await createChatDraft(client, { model: "gpt-6-luna", messages: [] }, { timeout: 1000, onDelta: (text) => pieces.push(text) });
    expect(pieces).toEqual(["Basınç", " artar."]);
    expect(draft).toEqual({ text: "  Basınç artar.", tokensIn: 120, tokensOut: 30 });
    expect(create.mock.calls[0][0]).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });
});

describe("istem ve sohbet ucu sözleşmesi", () => {
  it("kaynak bloğu etiketi yalnız bilgiye ayırır", () => {
    const block = chatSourceBlock([{ content: "Basınç derinlikle artar.", documentName: "not.pdf", pageNumber: 1 }]);
    expect(block).toContain("Etiket yalnız BİLGİ içindir");
    expect(block).toContain("Sorulan BİLGİ alıntılarda hiç geçmiyorsa");
  });

  it("sohbet ucu: düşük düşünmeyle akışlı yazım, tek hızlı denetim, kodla kaynak kontrolü, paralel sağlama", () => {
    const route = read("src/app/api/ai/chat/route.ts");
    expect(route).toContain('const effort = isReasoningModel(generationModel) ? { reasoning_effort: "low" as const } : {};');
    expect(route).toContain("const streamThis = attempt === 0 && !strict && !prepJsonMode;");
    expect(route).toContain("const drafted = await createChatDraft(client, {");
    expect(route).toMatch(/model: reviewModel,\s+\/\/ 15 Kasım 2026: tek hızlı geçiş \(öğrenci bekliyor\)\.\s+reasoningEffort: "low",/);
    expect(route).toContain("const local = localDocumentCheck({ question: message, answer: content, evidence });");
    expect(route).toContain("if (strict) checked = await runModelCheck(true);");
    expect(route).toContain("const stampOutside = !strict && !linkedEvidence && !chatActions.length");
    expect(route).toContain("if (!strict && charge) content = settlePedagogicalLabels(content, { redirect: studioRedirect });");
    expect(route).toContain("content = stripOrphanCitations(content, citations.map((item) => item.reference));");
    // Bağımsız sağlama yazımdan önce başlar, sonda beklenir.
    expect(route.indexOf("const independentEarly")).toBeLessThan(route.indexOf("const drafted = await createChatDraft"));
    expect(route).toContain("const parsed = independentEarly ? await independentEarly : null;");
  });

  it("denetçiler düşünme düzeyini yalnız akıl yürüten modele geçirir", () => {
    expect(read("src/lib/ai/quality-gate.ts")).toContain("input.reasoningEffort && isReasoningModel(input.model ?? env.OPENAI_ADVANCED_MODEL)");
    expect(read("src/lib/ai/document-answer-verification.ts")).toContain("input.reasoningEffort && isReasoningModel(reviewModel)");
  });
});
