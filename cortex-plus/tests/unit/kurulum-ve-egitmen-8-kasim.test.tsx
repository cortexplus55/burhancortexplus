// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DifficultyPicker, DIFFICULTY_OPTIONS } from "@/components/parity/difficulty-picker";
import { pickByDifficulty, type ItemRow } from "@/lib/content-pool/serve";
import { COACH_TEACHING_RULE } from "@/lib/learning/coach-sources";

/*
  8 Kasım 2026, ürün sahibinin dört bulgusu:
  1) Test içi eğitmen gösterişsiz, sonraki soruda eski konuşma duruyor, cevaplar kısa ve öğretici değil.
  2) Zorluk sürgüsünün tutamağı sona ulaşmıyor; "İleri" seçilse de sorular kolay (hazır müfredat testi zorluğu
     hiç kullanmıyordu: havuzdan kazanım dengesine göre karışık seçiyordu).
  3) Resmî müfredat paneli basit ve karışık.
  4) Tarih adımında günlük süre ile tarih seçenekleri aynı ızgarada karışık; tarihi kendi seçememe hissi.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => cleanup());

function rows(): ItemRow[] {
  const out: ItemRow[] = [];
  for (const difficulty of ["easy", "medium", "hard"]) {
    for (let i = 0; i < 6; i += 1) {
      out.push({
        id: `${difficulty}-${i}`,
        outcome_id: `o${i % 3}`,
        difficulty,
        stem: "s",
        choices: ["a", "b", "c", "d"],
        answer: 0,
        explanation: null,
      });
    }
  }
  return out;
}

describe("havuz testi seçilen zorluğu kullanır", () => {
  it("İleri → önce zor sorular; yetmezse orta, sonra kolay", () => {
    const picked = pickByDifficulty(rows(), 8, "ileri");
    expect(picked).toHaveLength(8);
    expect(picked.slice(0, 6).every((row) => row.difficulty === "hard")).toBe(true);
    expect(picked.slice(6).every((row) => row.difficulty === "medium")).toBe(true);
  });

  it("Kolay → önce kolay; Orta → önce orta", () => {
    expect(pickByDifficulty(rows(), 5, "kolay").every((row) => row.difficulty === "easy")).toBe(true);
    expect(pickByDifficulty(rows(), 5, "orta").every((row) => row.difficulty === "medium")).toBe(true);
  });

  it("kazanım dengesi katman içinde korunur; zorluk yoksa eski davranış", () => {
    const picked = pickByDifficulty(rows(), 3, "ileri");
    expect(new Set(picked.map((row) => row.outcome_id)).size).toBe(3);
    expect(pickByDifficulty(rows(), 6, null)).toHaveLength(6);
  });

  it("açılış zorluğu havuza iletir", () => {
    const start = read("src/lib/learning/node/pool-start.ts");
    expect(start).toContain("difficulty: level");
    const serve = read("src/lib/content-pool/serve.ts");
    expect(serve).toContain("readPoolQuiz(service, slice, input.userId, quizCount, input.prepId, input.difficulty)");
  });
});

describe("zorluk seçimi: sürgü yerine üç anlamlı seçenek", () => {
  it("üç radyo, seçili olan işaretli, anlamı yazılı; tıklama seçer", () => {
    const onChange = vi.fn();
    render(<DifficultyPicker value="ileri" onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /İleri/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Sınav ayarında zor, çok adımlı sorular")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Kolay/ }));
    expect(onChange).toHaveBeenCalledWith("kolay");
    expect(DIFFICULTY_OPTIONS.map((option) => option.label)).toEqual(["Kolay", "Orta", "İleri"]);
  });

  it("kurulum ekranında range yok", () => {
    const open = read("src/components/parity/exam-node/open-screens.tsx");
    expect(open).toContain("<DifficultyPicker value={difficulty} onChange={setDifficulty} />");
    expect(open).not.toMatch(/type="range"/);
  });
});

describe("eğitmen öğretir", () => {
  it("öğretim kuralı adım adım anlatır, cevabı söylemez; cevap sınırı uzadı", () => {
    expect(COACH_TEACHING_RULE).toContain("adım adım öğret");
    expect(COACH_TEACHING_RULE).toContain("FARKLI küçük bir örnek");
    expect(COACH_TEACHING_RULE).toContain("TEK ipucu");
    expect(COACH_TEACHING_RULE).toContain("Doğru şıkkı harfiyle ya da metniyle söyleme");
    const route = read("src/app/api/learning/exam-prep/coach/route.ts");
    expect(route).toContain("${COACH_TEACHING_RULE}");
    expect(route).toContain("reply: z.string().min(8).max(2200)");
    expect(route).not.toContain("Kısa Türkçe, 3-6 cümle");
  });

  it("kutu yeniden tasarlandı: başlık, hızlı istekler, Markdown cevap", () => {
    const coach = read("src/components/parity/exam-node-coach.tsx");
    expect(coach).toContain("<Markdown content={msg.content} variant=\"parity\" />");
    expect(coach).toContain("COACH_ASKS.map");
    expect(read("src/styles/node-coach.css")).toContain(".cp-coach-bubble");
    // Eski stil bloğu parity-shell.css'ten kalktı (çakışma olmasın).
    expect(read("src/styles/parity-shell.css")).not.toMatch(/^\.cp-exam-coach-form \{/m);
  });
});

describe("tarih adımı: kartlara ayrıldı", () => {
  const wizard = read("src/components/parity/exam-create-wizard.tsx");

  it("tarih kartı, günlük süre kartı ve saat/yer kartı ayrı; seçili tarih ve kalan gün üstte", () => {
    expect(wizard).toContain('<h2 className="apw-card-title">Sınav tarihi</h2>');
    expect(wizard).toContain('<h2 className="apw-card-title">Günlük çalışma süresi</h2>');
    expect(wizard).toContain('data-testid="exam-date-summary"');
    expect(wizard).toContain("gün kaldı");
    // Günlük süre artık tarih düğmeleriyle aynı ızgarada değil.
    expect(wizard).not.toMatch(/apw-quick-btn--on" : "apw-quick-btn"\}\s*aria-pressed=\{dailyMinutes/);
  });

  it("takvim her zaman açık; resmî tarihler ayrı ve sınav türü yoksa kapalı başlar", () => {
    expect(wizard).toContain('<details className="apw-official-dates" open={Boolean(examTrack)}>');
    expect(wizard).toContain('data-testid="official-exam-dates"');
    expect(wizard).toContain("apw-cal-day--official");
  });
});

describe("resmî müfredat paneli: numaralı adımlar ve konu haritası kartı", () => {
  const panel = read("src/components/parity/official-curriculum-panel.tsx");

  it("adımlar numaralı; sayılar kutuda; birincil düğme", () => {
    expect(panel).toContain('className="ocp-steps"');
    expect(panel).toContain('className="ocp-stats"');
    expect(panel).toContain('className="apw-cta ocp-submit"');
    // Testlerin dayandığı adlar değişmedi.
    expect(panel).toContain('data-testid="official-summary"');
    expect(panel).toContain('data-testid="official-unit-single"');
    expect(panel).toContain('data-testid="official-other-levels"');
    expect(read("src/styles/official-curriculum.css")).toContain(".ocp-map-card");
  });
});
