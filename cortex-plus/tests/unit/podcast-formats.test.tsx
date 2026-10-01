// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { coercePodcastDraft } from "@/lib/learning/podcast-episode";
import {
  DEFAULT_PODCAST_LENGTH,
  PODCAST_FORMAT_OPTIONS,
  parsePodcastLength,
  podcastLengthSpec,
} from "@/lib/learning/podcast-formats";
import { examPrepPodcastHref } from "@/lib/learning/exam-prep-hrefs";
import { PodcastFormatPicker } from "@/components/parity/podcast-format-picker";

afterEach(cleanup);

/*
  Astra'daki beş podcast türü (1 Ekim 2026): Diyalog (önerilen), Özet,
  Soru-Cevap, Basit anlatım, Derinlemesine.
*/
const duoDraft = {
  title: "Birim çember",
  chapters: [
    { title: "Birim çember", lines: [
      { speaker: "Ada", text: "Birim çemberin yarıçapı bir birimdir." },
      { speaker: "Kerem", text: "Merkezi her zaman orijinde mi olur?" },
      { speaker: "ada", text: "Evet, merkez orijindedir." },
    ] },
    { title: "Kosinüs", lines: [
      { speaker: "kerem", text: "Kosinüs hangi koordinata karşılık gelir?" },
      { speaker: "ada", text: "Kosinüs noktanın x koordinatıdır." },
    ] },
    { title: "Sinüs", lines: [
      { speaker: "kerem", text: "Peki sinüs hangi koordinat?" },
      { speaker: "ada", text: "Sinüs noktanın y koordinatıdır." },
    ] },
    { title: "Tekrar", lines: [
      { speaker: "ada", text: "Yarıçap bir birimdir." },
      { speaker: "ada", text: "Kosinüs x, sinüs y koordinatıdır." },
      { speaker: "ada", text: "Merkez orijindedir." },
    ] },
  ],
};

describe("podcast türleri", () => {
  it("beş tür, Astra sırasıyla; varsayılan Diyalog; eski standart okunur", () => {
    expect(PODCAST_FORMAT_OPTIONS.map((option) => option.id)).toEqual(["diyalog", "ozet", "soru_cevap", "basit", "derin"]);
    expect(DEFAULT_PODCAST_LENGTH).toBe("diyalog");
    expect(parsePodcastLength(undefined)).toBe("diyalog");
    expect(parsePodcastLength("standart")).toBe("standart");
    expect(parsePodcastLength("soru_cevap")).toBe("soru_cevap");
    expect(parsePodcastLength("uydurma")).toBe("diyalog");
    expect(podcastLengthSpec("diyalog").speakers).toBe("duo");
    expect(podcastLengthSpec("soru_cevap").speakers).toBe("duo");
    expect(podcastLengthSpec("basit").speakers).toBe("single");
    expect(podcastLengthSpec("soru_cevap").minutes).toBe(7);
  });

  it("iki sunuculu türde Kerem satırları korunur", () => {
    const episode = coercePodcastDraft(duoDraft, { length: "diyalog", topicLabel: "Birim çember" });
    expect(episode).not.toBeNull();
    const speakers = new Set(episode?.chapters.flatMap((chapter) => chapter.lines.map((line) => line.speaker)));
    expect([...speakers].sort()).toEqual(["ada", "kerem"]);
  });

  it("tek öğretmenli türde ikinci konuşmacı yine Ada'ya iner", () => {
    const episode = coercePodcastDraft(duoDraft, { length: "basit", topicLabel: "Birim çember" });
    expect(episode).not.toBeNull();
    expect(episode?.chapters.every((chapter) => chapter.lines.every((line) => line.speaker === "ada"))).toBe(true);
  });

  it("bağlantı varsayılanı yazmaz, diğer türü yazar", () => {
    expect(examPrepPodcastHref("p", "t", "diyalog")).toBe("/deneme-sinavlari/p/podcast?topicId=t");
    expect(examPrepPodcastHref("p", "t", "soru_cevap")).toContain("length=soru_cevap");
  });

  it("seçici beş türü gösterir, Diyalog önerilen", () => {
    let picked = "diyalog";
    render(<PodcastFormatPicker value="diyalog" onChange={(value) => (picked = value)} />);
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByText("Önerilen").closest("label")?.textContent).toContain("Diyalog");
    fireEvent.click(screen.getByRole("radio", { name: /Soru-Cevap/ }));
    expect(picked).toBe("soru_cevap");
  });

  it("göç önbellek kolonuna yeni türleri açar", () => {
    const sql = readFileSync("supabase/migrations/20261001200000_podcast_formats.sql", "utf8");
    for (const id of ["diyalog", "soru_cevap", "basit", "ozet", "standart", "derin"]) expect(sql).toContain(`'${id}'`);
  });
});
