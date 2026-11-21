import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appendBoardCard, applyTranscriptUpdate, liveEntriesToMessages, type LiveEntry } from "@/lib/tutor/realtime/live-entries";
import { composeSavedTurns } from "@/lib/tutor/realtime/transcript";

/* Öğretmen v3 (21 Kasım 2026): sohbetin içindeki canlı sesli ders. Örnekler farklı derslerden. */

const turn = (id: string, role: "user" | "assistant", text: string, final = true) => ({ id, role, text, final });

describe("canlı sesli ders akışı", () => {
  it("aynı satır büyür, boş kesinleşen satır kalkar, kart bir kez eklenir", () => {
    let entries: LiveEntry[] = [];
    entries = applyTranscriptUpdate(entries, turn("a1", "assistant", "Merhaba", false));
    entries = applyTranscriptUpdate(entries, turn("a1", "assistant", "Merhaba, kuvveti konuşalım.", true));
    entries = applyTranscriptUpdate(entries, turn("u1", "user", "", false));
    entries = applyTranscriptUpdate(entries, turn("u1", "user", "", true));
    const card = { id: "c1", kind: "formula" as const, title: "Newton'un ikinci yasası", body: "$F = m \\cdot a$" };
    entries = appendBoardCard(entries, card);
    entries = appendBoardCard(entries, card);
    expect(entries).toEqual([
      { kind: "turn", turn: turn("a1", "assistant", "Merhaba, kuvveti konuşalım.") },
      { kind: "card", card },
    ]);
  });

  it("akış sohbete sunucunun kaydıyla aynı mesajlara dönüşür (kart, gösterdiği öğretmen satırının sonuna)", () => {
    const entries: LiveEntry[] = [
      { kind: "turn", turn: turn("u1", "user", "Hücre zarı ne işe yarar?") },
      { kind: "turn", turn: turn("a1", "assistant", "Hücreye giren çıkanı seçer.") },
      { kind: "card", card: { id: "c1", kind: "concept", title: "Seçici geçirgenlik", body: "Zar her maddeyi geçirmez." } },
      { kind: "turn", turn: turn("a2", "assistant", "Sence su nasıl geçer?") },
    ];
    const messages = liveEntriesToMessages(entries);
    expect(messages).toEqual(
      composeSavedTurns(
        [
          { role: "user", text: "Hücre zarı ne işe yarar?" },
          { role: "assistant", text: "Hücreye giren çıkanı seçer." },
          { role: "assistant", text: "Sence su nasıl geçer?" },
        ],
        [{ kind: "concept", title: "Seçici geçirgenlik", body: "Zar her maddeyi geçirmez.", afterTurn: 1 }],
      ),
    );
    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.content).toContain("Hücreye giren çıkanı seçer.");
    expect(messages[1]?.content).toContain("Seçici geçirgenlik");
  });

  it("söz yoksa mesaj yok", () => {
    expect(liveEntriesToMessages([])).toEqual([]);
  });
});

describe("sohbet ekranı bağlantısı", () => {
  const panel = readFileSync("src/components/chat/chat-panel.tsx", "utf8");

  it("'Konuş' v3 sohbetinde sesli ders çubuğunu açar; çubuk yazma kapsülünün yerine oturur", () => {
    expect(panel).toMatch(/onLiveTalk=\{onLiveTalk \?\? startLiveTalk\}/);
    expect(panel).toMatch(/liveOn \? \(\s*<RealtimeVoiceBar/);
    expect(panel).toMatch(/onEnded=\{endLiveTalk\}/);
  });

  it("bitince kaydedilen konuşma mesajlara eklenir ve sohbet kimliği alınır; çıkışta özet sesli dersi de sayar", () => {
    const end = panel.slice(panel.indexOf("function endLiveTalk"), panel.indexOf("function leaveThread"));
    expect(end).toMatch(/conversationId\.current = result\.conversationId/);
    expect(end).toMatch(/liveEntriesToMessages\(liveEntriesRef\.current\)/);
    const leave = panel.slice(panel.indexOf("function leaveThread"), panel.indexOf("function finishLeave"));
    expect(leave).toMatch(/\[\.\.\.messages, \.\.\.live\]/);
  });
});
