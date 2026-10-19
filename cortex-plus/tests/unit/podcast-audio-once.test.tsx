// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ExamPodcastPlayer } from "@/components/parity/exam-podcast-player";

/*
  19 Ekim 2026, canlı: üst bileşen podcast kaydını tazeleyince aynı bölümler yeni bir diziyle
  geldi; oynatıcının ses etkisi yeniden koştu, ilk isteği iptal edip ikinciyi attı. Sunucuda
  ilk istek sesi üretip krediyi düştü, ikincisi "işlem sürüyor" alıp "ses üretilemedi" dedi.
  Ses isteği içeriğe bağlıdır: aynı içerik → tek istek; kaldığı yer anahtarı da yenilemez.
*/
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const chapters = () => [
  {
    title: "Giriş",
    lines: [
      { speaker: "ada", text: "Merhaba, bugün devletin unsurlarını konuşuyoruz." },
      { speaker: "kerem", text: "Üç unsur vardı, değil mi?" },
    ],
  },
];

describe("podcast sesi bir kez istenir", () => {
  it("aynı bölümler yeni diziyle ya da yeni kaldığı-yer anahtarıyla gelince istek yenilenmez; içerik değişince yenilenir", () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const props = { title: "Podcast", onFinish: () => undefined };
    const view = render(<ExamPodcastPlayer {...props} chapters={chapters()} resumeKey="p:n:5" />);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    view.rerender(<ExamPodcastPlayer {...props} chapters={chapters()} resumeKey="p:n:5" />);
    view.rerender(<ExamPodcastPlayer {...props} chapters={chapters()} resumeKey="p:n:7" />);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const other = chapters();
    other[0].lines[0].text = "Günaydın, bugün devlet şekillerini konuşuyoruz.";
    view.rerender(<ExamPodcastPlayer {...props} chapters={other} resumeKey="p:n:7" />);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
