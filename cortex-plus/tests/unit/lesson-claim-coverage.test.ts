import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { conceptInText, scoreLessonChecks, titleConcepts } from "@/lib/learning/lesson-claims";
import { widenSourcePages } from "@/lib/learning/source-context";

const TOPIC = "İç Enerji, Entalpi ve Özgül Isılar";

describe("iç enerji lesson claims", () => {
  it("splits the live title and ignores the generic word kavramları", () => {
    expect(titleConcepts(TOPIC)).toEqual(["İç Enerji", "Entalpi", "Özgül Isılar"]);
    expect(titleConcepts("Basınç ve Sıcaklık Kavramları")).toEqual(["Basınç", "Sıcaklık"]);
    expect(conceptInText("Özgül Isılar", "özgül ısı c_p ile yazılır")).toBe(true);
  });
});

describe("lesson score and result layout", () => {
  it("counts every original check and keeps the retry out of the score", () => {
    const lesson = {
      sections: [{ check: { prompt: "a" } }, { check: { prompt: "b" } }, { check: { prompt: "c" } }, {}],
    };
    expect(scoreLessonChecks(lesson, { lessonMisses: [0] })).toEqual({ score: 2, total: 3, retried: 1 });
    expect(scoreLessonChecks(lesson, { lessonMisses: [0, 0, 2] })).toEqual({ score: 1, total: 3, retried: 2 });
    expect(scoreLessonChecks({ sections: [{}] }, {})).toEqual({
      score: 1,
      total: 1,
      retried: 0,
    });
  });

  it("centers the finished lesson card", () => {
    const css = readFileSync(resolve(__dirname, "../../src/styles/parity-shell.css"), "utf8");
    const block = css.slice(css.indexOf(".cp-exam-node-result {"), css.indexOf(".cp-exam-node-actions {"));
    expect(block).toMatch(/margin:\s*1\.5rem auto/);
    expect(block).toMatch(/text-align:\s*center/);
    expect(block).toMatch(/align-items:\s*center/);
    expect(css).toMatch(/justify-content:\s*safe center/);
    expect(css).toMatch(/@media \(max-width: 420px\) \{[\s\S]*\.cp-exam-node-result/);
  });
});

describe("widenSourcePages", () => {
  it("adds the page that contains the missing title concept", async () => {
    const pages = [
      { page_number: 4, text_content: "Kapalı sistemde ΔU = Q − W yazılır." },
      { page_number: 8, text_content: "Entalpi h = u + Pv bağıntısıyla yazılır. Özgül ısı c_p burada tanımlanır." },
    ];
    const service = {
      from: () => {
        const filters: { field?: string; value?: string } = {};
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.eq = chain;
        builder.in = () => Promise.resolve({ data: [pages[0]], error: null });
        builder.ilike = (_field: string, pattern: string) => {
          filters.value = pattern;
          return builder;
        };
        builder.limit = () => {
          const needle = (filters.value ?? "").replace(/%/g, "").toLocaleLowerCase("tr");
          const hits = pages.filter((page) => page.text_content.toLocaleLowerCase("tr").includes(needle));
          return Promise.resolve({ data: hits.slice(0, 2), error: null });
        };
        return builder;
      },
    };
    const widened = await widenSourcePages(
      service as never,
      "doc",
      TOPIC,
      [4],
      "Kapalı sistemde ΔU = Q − W yazılır.",
    );
    expect(widened).toEqual([4, 8]);
  });

  it("keeps the mapped pages when the page search is unavailable", async () => {
    const service = {
      from: () => {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.eq = chain;
        return builder;
      },
    };
    await expect(
      widenSourcePages(service as never, "doc", "Basınç ve Sıcaklık Kavramları", [3], "Basınç yüzeye uygulanır."),
    ).resolves.toEqual([3]);
  });
});
