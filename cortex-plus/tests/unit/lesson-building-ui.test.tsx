// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import { buildingPayload, isStaleBuild, truncatedPayload, BUILD_STALE_MS } from "@/lib/learning/lesson-build";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

afterEach(cleanup);

/*
  Parça parça açılan ders (18 Ekim 2026, ürün sahibinin kararı: "ders ~10 sn'de açılsın").
  İlk denetlenmiş kavram gelince ders açılır; sonrakiler öğrenci okurken eklenir. Öğrenci
  yetişirse bekleme kartı görür; ders yarıda "bitirilemez", yeni kavram gelince kaldığı yerden sürer.
*/

const check = (prompt: string) => ({
  type: "check" as const,
  check: {
    type: "mcq" as const,
    prompt,
    options: ["Yokluk", "Mutlak butlan", "Nispi butlan", "Bağlamazlık"],
    answerIndex: 0,
    explanation: "Kurucu unsur yoksa işlem doğmaz.",
    optionWhy: ["Kurucu unsur yok.", "Emredici kurala aykırı.", "İrade sakatlığı.", "Onay eksik."],
    review: { prompt: "Hangi tür?" },
  },
});

const full: LessonV3 = {
  format: 3,
  title: "Hukukun Yaptırımları",
  overview: "Devlet bir kurala uyulmasını zorla sağlayabiliyorsa o kural hukuktur.",
  screens: [
    {
      heading: "Maddi Yaptırım",
      concept: "Maddi Yaptırım",
      blocks: [
        {
          type: "check",
          check: { type: "trueFalse", prompt: "Hukuku ayıran yalnızca hapis cezasıdır.", options: ["Doğru", "Yanlış"], answerIndex: 1, explanation: "Maddi yaptırımdır." },
        },
        { type: "text", text: "Hukuku diğer kurallardan ayıran şey **maddi yaptırım**dır." },
      ],
    },
    { heading: "Yokluk", concept: "Yokluk", blocks: [{ type: "text", text: "Kurucu unsuru hiç olmayan işlem yokluktur." }, check("Nikâhsız evlilik?")] },
    { heading: "Mutlak Butlan", concept: "Mutlak Butlan", blocks: [{ type: "text", text: "Emredici kurala aykırı işlem mutlak butlandır." }, check("Amca-yeğen evliliği?")] },
  ],
  summary: ["Hukuku ayıran maddi yaptırımdır.", "Kurucu unsur yoksa yokluk.", "Emredici kurala aykırılık mutlak butlan."],
} as LessonV3;

const partial: LessonV3 = { ...full, screens: [full.screens[0]!], summary: undefined };

describe("parça parça açılan ders ekranı", () => {
  it("giriş kartı gelecek kavramları adıyla gösterir; yetişen öğrenci bekleme kartı görür, ders bitirilemez", () => {
    const { container, rerender } = render(
      <ExamLessonSteps lesson={sealLessonV3ForPlay(partial)} building upcoming={["Yokluk", "Mutlak Butlan"]} closeHref="/deneme-sinavlari/p" />,
    );
    const plan = container.querySelector(".als-intro-plan")!;
    expect(plan.querySelectorAll("li")).toHaveLength(3);
    expect(plan.querySelectorAll("li.als-intro-pending")).toHaveLength(2);
    expect(container.querySelector(".als-intro-meta")!.textContent).not.toContain("adım");

    fireEvent.click(screen.getByRole("button", { name: /Devam et/ }));
    fireEvent.click(screen.getByRole("button", { name: /Yanlış/ }));
    fireEvent.click(screen.getByRole("button", { name: /Devam et/ }));
    // Sıradaki kavram henüz denetimden çıkmadı.
    expect(screen.getByText("HAZIRLANIYOR")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Yokluk" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Dersi bitir|Devam et/ })).toBeNull();

    // Kavram geldi: aynı adımda ekranın kendisi açılır; yazım bitince sonunda özet ve bitir.
    rerender(<ExamLessonSteps lesson={sealLessonV3ForPlay(full)} closeHref="/deneme-sinavlari/p" />);
    expect(screen.queryByText("HAZIRLANIYOR")).toBeNull();
    expect(container.innerHTML).toContain("Kurucu unsuru hiç olmayan işlem yokluktur.");
  });

  it("ekran yazım sürerken kaydı sorar; açılış isteği parça parça okuyabildiğini söyler", () => {
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    expect(session).toContain('...(kind === "lesson" ? { lessonStream: true } : {})');
    expect(session).toContain('action: "progress"');
    expect(session).toContain("building={lessonBuilding}");
    // Windows çalışma kopyası CRLF olabilir; satır atlamalı arama satır sonundan bağımsız olsun.
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8").replace(/\r\n/g, "\n");
    expect(route).toContain('if (action === "progress") {');
    expect(route).toContain("parsed.data.lessonStream === true");
    // Kalan kavramlar yanıttan sonra aynı fonksiyonda; ilk kavramla kayıt "active".
    expect(route).toContain("after(() =>\n        settleOnce()");
    expect(route).toContain('.in("status", shownFirst ? ["creating", "active"] : ["creating"])');
  });
});

describe("yazım kaydı bayrakları", () => {
  it("yazım sürüyor; ilerlemeyen yazım takılı sayılır ve ders olduğu kadarıyla kapanır", () => {
    const now = Date.parse("2026-10-18T10:00:00Z");
    const building = buildingPayload({ type: "lesson", lesson: partial, upcoming: ["Yokluk"] }, now);
    expect(building).toMatchObject({ building: true, builtAt: "2026-10-18T10:00:00.000Z" });
    expect(isStaleBuild(building, now + BUILD_STALE_MS - 1)).toBe(false);
    expect(isStaleBuild(building, now + BUILD_STALE_MS + 1)).toBe(true);
    const closed = truncatedPayload(building);
    expect(closed).toMatchObject({ type: "lesson", truncated: true });
    expect(closed).not.toHaveProperty("building");
    expect(closed).not.toHaveProperty("upcoming");
    expect(isStaleBuild(closed, now + 10 * BUILD_STALE_MS)).toBe(false);
  });
});
