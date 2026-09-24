// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamPodcastPlayer } from "@/components/parity/exam-podcast-player";

/*
  Sınav hazırlığı podcast kabuğu Astra envanterindeki etiketleri taşır.
  Görsel ölçü tarayıcıda bakılır; bu dosya etiketlerin ve 15 sn atlamasının
  kaybolmamasını tutar. Özellik kilidi eklenmez — kapı kredi/oturumdur.
*/

afterEach(cleanup);

const player = readFileSync("src/components/parity/exam-podcast-player.tsx", "utf8");
const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
const generating = readFileSync("src/components/parity/node-generation-progress.tsx", "utf8");
const topics = readFileSync("src/components/parity/exam-topic-pick.tsx", "utf8");
const home = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");

describe("podcast oynatıcı kabuğu", () => {
  it("üst başlık, transkript ve 15 saniyelik atlama duruyor", () => {
    expect(player).toContain(">Podcast<");
    expect(player).toContain("Tam transkript");
    expect(player).toContain('aria-label="15 saniye geri"');
    expect(player).toContain('aria-label="15 saniye ileri"');
    expect(player).toContain("const SKIP_MS = 15_000");
    expect(player).toContain("const SPEEDS = [1, 1.25, 1.5, 2]");
    expect(player).toContain("cycleSpeed");
  });

  it("oynatma bitmeden de devam edilebiliyor", () => {
    expect(player).toContain("Devam et");
    expect(player).toContain("Dinledim, devam");
  });

  it("bölüm yokken kapatma hazırlığa döndürüyor", () => {
    const onClose = vi.fn();
    render(
      <ExamPodcastPlayer
        title="Podcast"
        chapters={[]}
        onFinish={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(screen.getByText("Bu podcast henüz üretilemedi.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("satırı olmayan bölüm de kapatılabiliyor", () => {
    const onClose = vi.fn();
    render(
      <ExamPodcastPlayer
        title="Podcast"
        chapters={[{ title: "Boş", lines: [] }]}
        onFinish={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("çalışma çubuğu yalnızca bölümü olan podcast'te gizleniyor", () => {
    expect(session).toContain("normalizeChapters(chapters).length > 0");
  });
});

describe("üretim ekranı", () => {
  it("bekleme başlığı ve dakika uyarısı duruyor", () => {
    expect(generating).toContain("Dersin hazırlanıyor…");
    expect(generating).toContain("Bu işlem birkaç dakika sürebilir.");
    expect(generating).toContain("LESSON_PREP_STEPS");
  });
});

describe("konu seç ve yol", () => {
  it("konu satırı numaralı ve kapatılabilir", () => {
    expect(topics).toContain("Konu seç");
    expect(topics).toContain('aria-label="Kapat"');
    expect(topics).toContain("is-hot");
  });

  it("sıradaki podcast düğümü öneri kartı ve mikrofon", () => {
    expect(home).toContain("ÖNERİLEN DERS");
    expect(home).toContain('ready?.kind === "podcast"');
    expect(home).toContain("cp-exam-trail-node--podcast");
    expect(home).not.toContain("Materyaller");
  });
});
