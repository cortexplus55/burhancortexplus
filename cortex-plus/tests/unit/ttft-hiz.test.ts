import { describe, expect, it } from "vitest";
import { createLiveChannel, splitLiveBody } from "@/lib/ai/chat-live";
import { TUTOR_PASSAGE_CHARS, capPassages } from "@/lib/ai/teacher-tutor";
import { leadOnlyPayload, parseRewriteLead, prefixLeadScreen, rewriteBasisFrom, REWRITE_SUMMARY_CHARS } from "@/lib/learning/rewrite-lead";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("canlı sohbet denetim kapısı", () => {
  it("denetim sürerken tamponlar, geçince akıtır", async () => {
    const live = createLiveChannel(Date.now());
    live.enable(false);
    let pass!: (ok: boolean) => void;
    live.gate(new Promise<boolean>((r) => (pass = r)));
    live.write("Mer");
    live.write("haba");
    expect(live.started).toBe(false);
    pass(true);
    await tick();
    expect(live.started).toBe(true);
    const response = await live.response;
    expect(response.headers.get("Server-Timing")).toMatch(/ttft;dur=\d+/);
    live.finish({ content: "Merhaba" });
    const { draft, trailer } = splitLiveBody(await response.text());
    expect(draft).toBe("Merhaba");
    expect(trailer?.content).toBe("Merhaba");
  });

  it("ret gelirse hiçbir token öğrenciye gitmez", async () => {
    const live = createLiveChannel(Date.now());
    live.enable(false);
    live.gate(Promise.resolve(false));
    live.write("zararlı");
    await tick();
    live.write("devam");
    expect(live.blocked).toBe(true);
    expect(live.started).toBe(false);
  });

  it("denetim hatası da kapıyı kapatır", async () => {
    const live = createLiveChannel(Date.now());
    live.enable(false);
    live.gate(Promise.reject(new Error("x")));
    live.write("a");
    await tick();
    expect(live.blocked).toBe(true);
    expect(live.started).toBe(false);
  });
});

describe("sohbet bağlamı", () => {
  it("pasajları sınırlar", () => {
    const out = capPassages([{ label: "a", text: "x".repeat(TUTOR_PASSAGE_CHARS) }, { label: "b", text: "y".repeat(TUTOR_PASSAGE_CHARS) }]);
    expect(out.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(TUTOR_PASSAGE_CHARS + 40);
  });
});

describe("Farklı anlat ilk ekranı", () => {
  const lead = parseRewriteLead(JSON.stringify({ heading: "Başka açıdan", concept: "Kuvvet", paragraphs: ["Giriş cümlesi.", "İlk fikir."] }))!;

  it("geçerli ekran üretir, bozuk cevapta null", () => {
    expect(lead.blocks).toHaveLength(2);
    expect(parseRewriteLead("bozuk")).toBeNull();
    expect(parseRewriteLead(JSON.stringify({ heading: "a b", paragraphs: [] }))).toBeNull();
  });

  it("asıl dersin başına bir kez eklenir", () => {
    const main = { type: "lesson", plannedScreens: 7, lesson: { format: 3, title: "T", screens: [{ heading: "Bir", blocks: [] }] } };
    const once = prefixLeadScreen(main, lead);
    const twice = prefixLeadScreen(once, lead);
    expect((twice.lesson as { screens: unknown[] }).screens).toHaveLength(2);
    expect(twice.plannedScreens).toBe(8);
    expect((leadOnlyPayload(lead, "T").lesson as { screens: unknown[] }).screens).toEqual([lead]);
  });

  it("kaynak: kazanımlar + tarz + kısa özet", () => {
    const basis = rewriteBasisFrom({ outcomes: ["- K1: hız"], style: "Örnekle anlat", summary: "y".repeat(5_000) });
    expect(basis).toContain("KAZANIMLAR");
    expect(basis).toContain("ANLATIM TARZI: Örnekle anlat");
    expect(basis.length).toBeLessThan(REWRITE_SUMMARY_CHARS + 120);
  });
});
