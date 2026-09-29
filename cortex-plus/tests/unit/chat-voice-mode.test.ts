import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { voiceModeLabel } from "@/components/chat/chat-panel";

const panel = readFileSync("src/components/chat/chat-panel.tsx", "utf8");

describe("sohbette Konuş = sesli sohbet (Astra, 29 Eylül 2026)", () => {
  it("etiket ne olduğunu ve nasıl kapanacağını söylüyor", () => {
    const base = { talking: false, listening: false, loading: false, idle: "Konuş" };
    expect(voiceModeLabel(false, base)).toBe("Konuş");
    expect(voiceModeLabel(true, { ...base, listening: true })).toBe("Dinliyor · Bitir");
    expect(voiceModeLabel(true, { ...base, loading: true })).toBe("Düşünüyor · Bitir");
    expect(voiceModeLabel(true, { ...base, talking: true })).toBe("Konuşuyor · Bitir");
  });

  it("Konuş ilk cevabı beklemeden görünüyor ve sesli sohbeti açıyor", () => {
    expect(panel).toContain("const showExamTalk = examChrome && (!hasComposerPayload || voiceMode);");
    expect(panel).not.toContain("talkLastAnswer");
    expect(panel.match(/onClick=\{toggleVoiceMode\}/g)?.length).toBe(2);
  });

  it("sesli sohbette söylenen gönderiliyor, cevap okununca yeniden dinleniyor", () => {
    expect(panel).toContain("if (voiceModeRef.current) void send(text);");
    expect(panel).toContain("if (voiceModeRef.current) startVoiceInput();");
  });
});
