// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ExamPrepProgress } from "@/components/parity/exam-prep-progress";
import { buildPrepProgressView, type ProgressNode } from "@/lib/learning/prep-progress-view";
import { weakTopicRows } from "@/lib/learning/weak-topic-rows";

/*
  11 Kasım 2026, canlı: hazır müfredattan kurulan hazırlığın İlerleme sekmesinde konu adları kazanım koduyla
  görünüyordu ("T.O.5.5 Metinde geçen …"). Kural (8 Kasım 2026) yol başlıklarına uygulanmıştı, İlerleme'ye değil.
  Kod yalnız görünümde atılır; eşleştirme ve kayıt kodlu adla kalır.
*/

afterEach(() => cleanup());

const CODED = "T.O.5.5 Metinde geçen söz varlığını tahmin edebilme";
const PLAIN = "Metinde geçen söz varlığını tahmin edebilme";

describe("İlerleme'de kazanım kodu görünmez", () => {
  it("konu listesi, ders oluştur düğmesi ve haftalık tablo konunun adını kodsuz yazar", () => {
    const nodes: ProgressNode[] = [
      { id: "l1", kind: "lesson", title: `${CODED} · Ders`, status: "ready", sessionMeta: { topicTitle: CODED } },
    ];
    const view = buildPrepProgressView({
      nodes,
      attempts: [],
      topicLabels: [CODED, "9. Sınıf Tekrarı"],
      gaps: [],
      examDate: "2026-12-20",
      targetScore: 75,
      dailyMinutes: 45,
      measuredReadinessPct: null,
      now: new Date("2026-11-11T12:00:00+03:00"),
    });
    // Veri kodlu adla kalır (eşleştirme anahtarı).
    expect(view.topics[0]!.label).toBe(CODED);

    const onCreate = vi.fn();
    const { container } = render(
      <ExamPrepProgress view={view} daysLabel="39 gün" warnings={{}} reviewsHref={null} radar={null} mockHref={null} onCreate={onCreate} />,
    );
    expect(container.textContent).not.toContain("T.O.5.5");
    expect(screen.getAllByText(PLAIN).length).toBeGreaterThan(0);
    // Sınıf adı gibi kod olmayan başlangıçlar dokunulmaz.
    expect(screen.getAllByText("9. Sınıf Tekrarı").length).toBeGreaterThan(0);
    // Düğme adı kodsuz, ama ders konunun kayıtlı adıyla kurulur.
    const create = screen.getAllByRole("button").find((button) => button.textContent?.includes(`${PLAIN} için ders oluştur`));
    expect(create).toBeTruthy();
    create!.click();
    expect(onCreate).toHaveBeenCalledWith(CODED);
  });

  it("genel İlerleme'nin eksik konular satırı da kodsuz; aynı konu yine tek satır", () => {
    const rows = weakTopicRows([
      { topic_label: CODED, severity: 0.5, source: "quiz" },
      { topic_label: CODED, severity: 0.75, source: "quiz" },
      { topic_label: "T.C. Anayasası", severity: 0.4, source: "quiz" },
    ]);
    expect(rows.map((row) => row.label)).toEqual([PLAIN, "T.C. Anayasası"]);
    expect(rows[0]!.times).toBe(2);
  });
});
