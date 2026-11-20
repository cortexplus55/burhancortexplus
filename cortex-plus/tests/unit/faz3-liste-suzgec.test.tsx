// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dokumanlar",
}));
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) } }));

import { foldForSearch, matchesSearch } from "@/lib/text/search-fold";
import {
  documentKind,
  documentStatusBucket,
  filterDocuments,
  EMPTY_DOCUMENT_FILTER,
  type DocumentFilterItem,
} from "@/lib/documents/document-filter";
import { photoSetName } from "@/lib/documents/photo-set-pdf";
import { DocumentsBrowser } from "@/components/documents/documents-browser";
import { DocumentDeleteButton } from "@/components/documents/document-delete-button";
import { filterPrepCards, prepSubjects, EMPTY_PREP_FILTER } from "@/lib/learning/prep-card-filter";
import { toPrepCard } from "@/lib/learning/prep-cards";
import { MyPrepsView } from "@/components/parity/my-preps-view";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

/* Faz 3 (20 Kasım 2026): Belgelerim ve Sınav hazırlıklarım'da anlık arama ve süzgeç; silme onayı odak tuzaklı pencere. */

describe("Türkçe arama anahtarı", () => {
  it("büyük/küçük harf ve Türkçe harf farkı yok sayılır", () => {
    expect(foldForSearch("İSTATİSTİK Notu")).toBe("istatistik notu");
    expect(foldForSearch("Istatistik")).toBe("istatistik");
    expect(foldForSearch("ÖĞRENCİ_çalışma-3.pdf")).toBe("ogrenci calisma 3 pdf");
    expect(matchesSearch(["İŞLETME İKTİSADI.pdf"], "işletme iktisadı")).toBe(true);
    expect(matchesSearch(["İŞLETME İKTİSADI.pdf"], "isletme iktisadi")).toBe(true);
    expect(matchesSearch(["isletme_iktisadi.pdf"], "İşletme")).toBe(true);
  });

  it("her kelime aranır, sıra önemsiz; boş sorgu her şeyi bırakır", () => {
    expect(matchesSearch(["Ders notu — hücre bölünmesi"], "bölünme hücre")).toBe(true);
    expect(matchesSearch(["Ders notu — hücre bölünmesi"], "hücre mitoz")).toBe(false);
    expect(matchesSearch(["Ne olursa"], "   ")).toBe(true);
  });
});

describe("belge kovaları", () => {
  it("tür addan: PDF, fotoğraf (fotoğraf seti dahil), Word/sunu", () => {
    expect(documentKind("not.pdf")).toBe("pdf");
    expect(documentKind("tahta.JPG")).toBe("photo");
    expect(documentKind("IMG_0042.heic")).toBe("photo");
    expect(documentKind(photoSetName({ from: 1, to: 12, total: 12 }))).toBe("photo");
    expect(documentKind(photoSetName({ from: 11, to: 40, total: 90 }))).toBe("photo");
    expect(documentKind("sunum.pptx")).toBe("office");
    expect(documentKind("özet.docx")).toBe("office");
    expect(documentKind("notlar.txt")).toBe("other");
  });

  it("durum kartın hapıyla aynı: başarısız hata, durmuş harita ve okunan belge işleniyor", () => {
    expect(documentStatusBucket({ status: "failed", mapStopped: false })).toBe("error");
    expect(documentStatusBucket({ status: "processing", mapStopped: false })).toBe("processing");
    expect(documentStatusBucket({ status: "pending", mapStopped: false })).toBe("processing");
    expect(documentStatusBucket({ status: "completed", mapStopped: true })).toBe("processing");
    expect(documentStatusBucket({ status: "completed", mapStopped: false })).toBe("ready");
  });

  it("süzgeç arama, durum ve türü birlikte uygular", () => {
    const items: DocumentFilterItem[] = [
      { id: "a", fileName: "Biyoloji özet.pdf", status: "ready", kind: "pdf" },
      { id: "b", fileName: "BİYOLOJİ tahtası.jpg", status: "processing", kind: "photo" },
      { id: "c", fileName: "Kimya.pptx", status: "error", kind: "office" },
    ];
    const ids = (filter: Partial<typeof EMPTY_DOCUMENT_FILTER>) =>
      filterDocuments(items, { ...EMPTY_DOCUMENT_FILTER, ...filter }).map((item) => item.id);
    expect(ids({})).toEqual(["a", "b", "c"]);
    expect(ids({ query: "biyoloji" })).toEqual(["a", "b"]);
    expect(ids({ query: "biyoloji", kind: "photo" })).toEqual(["b"]);
    expect(ids({ status: "error" })).toEqual(["c"]);
    expect(ids({ query: "fizik" })).toEqual([]);
  });
});

function docItem(id: string, fileName: string, status: DocumentFilterItem["status"], kind: DocumentFilterItem["kind"]) {
  return {
    id,
    fileName,
    status,
    kind,
    card: (
      <li key={id} className="cp-docs-card">
        <p className="cp-docs-name">{fileName}</p>
      </li>
    ),
  };
}

describe("Belgelerim listesi", () => {
  const items = [
    docItem("a", "Biyoloji özet.pdf", "ready", "pdf"),
    docItem("b", "Tahta fotoğrafı.jpg", "processing", "photo"),
    docItem("c", "Kimya sunumu.pptx", "error", "office"),
  ];

  it("arama kutusu yazdıkça süzer; durum ve tür çipleri basılı hâlini söyler", () => {
    render(<DocumentsBrowser items={items} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.change(screen.getByRole("searchbox", { name: "Belgelerde ara" }), { target: { value: "KİMYA" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Kimya sunumu.pptx")).toBeTruthy();
    expect(screen.getByText("1 belge gösteriliyor")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aramayı temizle" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    const status = screen.getByRole("group", { name: "Duruma göre süz" });
    const errorChip = Array.from(status.querySelectorAll("button")).find((b) => b.textContent === "Hata")!;
    fireEvent.click(errorChip);
    expect(errorChip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);

    const kind = screen.getByRole("group", { name: "Türe göre süz" });
    fireEvent.click(Array.from(kind.querySelectorAll("button")).find((b) => b.textContent === "Fotoğraf")!);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("sonuç yoksa boş durum ve tek düğmeyle temizleme", () => {
    render(<DocumentsBrowser items={items} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Belgelerde ara" }), { target: { value: "tarih" } });
    expect(screen.getByText("Aramana uyan belge yok")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Süzgeçleri temizle" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect((screen.getByRole("searchbox", { name: "Belgelerde ara" }) as HTMLInputElement).value).toBe("");
  });

  it("Escape arama kutusunu boşaltır", () => {
    render(<DocumentsBrowser items={items} />);
    const box = screen.getByRole("searchbox", { name: "Belgelerde ara" });
    fireEvent.change(box, { target: { value: "biyo" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect((box as HTMLInputElement).value).toBe("");
  });

  it("sayfa kartları sunucuda çizer, hiç belge yoksa eski boş durum kalır", () => {
    const page = read("src/app/dokumanlar/page.tsx");
    expect(page).toContain("<DocumentsBrowser");
    expect(page).toContain("documentStatusBucket({ status: document.status, mapStopped })");
    expect(page).toContain("kind: documentKind(document.file_name)");
    expect(page).toContain('title="Henüz bir belgen yok."');
    expect(page).toContain(".limit(30)");
  });
});

describe("belge silme penceresi", () => {
  beforeEach(() => {
    refresh.mockReset();
  });

  it("odak tuzaklı pencere açılır; Escape kapatır ve odak Sil düğmesine döner", async () => {
    render(<DocumentDeleteButton documentId="doc-1" />);
    const trigger = screen.getByRole("button", { name: "Sil" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByText("Belge silinsin mi?")).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Vazgeç"));

    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("Vazgeç kapatır, silme isteği gitmez", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<DocumentDeleteButton documentId="doc-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    fireEvent.click(await screen.findByRole("button", { name: "Vazgeç" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("onay aynı sunucu yolunu çağırır, sayfayı yeniler", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ status: "deleted" }), { status: 200 }));
    render(<DocumentDeleteButton documentId="doc-9" />);
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Evet, sil" }));
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith("/api/documents/doc-9", { method: "DELETE" });
    expect(toastSuccess).toHaveBeenCalledWith("Belge ve bağlı çalışma içerikleri silindi.");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("sunucu reddederse hata söylenir, pencere kapanır", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Bu belge kullanılıyor." }), { status: 409 }));
    render(<DocumentDeleteButton documentId="doc-2" />);
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Evet, sil" }));
    });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Bu belge kullanılıyor."));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("satır içi onay yok; pencere uyarı penceresi (dışarıya dokunmak kapatmaz)", () => {
    const button = read("src/components/documents/document-delete-button.tsx");
    expect(button).toContain("<ConfirmDialog");
    expect(button).not.toContain('role="group" aria-label="Belge silme onayı"');
    expect(read("src/components/ui/confirm-dialog.tsx")).toContain('from "@base-ui/react/alert-dialog"');
  });
});

const prep = (id: string, title: string, examType: string, examDate: string | null) =>
  toPrepCard(
    { id, title, exam_type: examType, target_score: 75, exam_date: examDate, view_count: 0 },
    [],
    [{ status: "ready" }],
    "2026-10-02",
  );

describe("Sınav hazırlıklarım araması", () => {
  const cards = [
    prep("a", "TYT Matematik kampı", "Matematik", "2026-10-20"),
    prep("b", "Final haftası", "İŞLETME", "2026-10-25"),
    prep("c", "Vize tekrarı", "işletme", "2026-09-01"),
  ];

  it("saf süzgeç: ad ve sınav türünde arar; tür süzgeci yazım farkını tek sayar", () => {
    expect(prepSubjects(cards)).toEqual(["Matematik", "İŞLETME"]);
    expect(filterPrepCards(cards, { ...EMPTY_PREP_FILTER, query: "isletme" }).map((c) => c.id)).toEqual(["b", "c"]);
    expect(filterPrepCards(cards, { ...EMPTY_PREP_FILTER, query: "kamp" }).map((c) => c.id)).toEqual(["a"]);
    expect(filterPrepCards(cards, { query: "", subject: "İşletme" }).map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("ekranda arama ve sekme sayıları süzülmüş listeden; sonuç yoksa temizle", () => {
    render(<MyPrepsView cards={cards} userInitial="B" />);
    expect(screen.getByRole("tab", { name: "Yaklaşan (2)" })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Hazırlıklarda ara" }), { target: { value: "işletme" } });
    expect(screen.getByRole("tab", { name: "Yaklaşan (1)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Geçmiş (1)" })).toBeTruthy();
    expect(screen.getByText("Final haftası")).toBeTruthy();
    expect(screen.queryByText("TYT Matematik kampı")).toBeNull();

    fireEvent.change(screen.getByRole("searchbox", { name: "Hazırlıklarda ara" }), { target: { value: "fizik" } });
    expect(screen.getByText("Aramana uyan hazırlık yok")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Süzgeçleri temizle" }));
    expect(screen.getByText("TYT Matematik kampı")).toBeTruthy();
  });

  it("ders çipleri yalnız listede olan sınav türlerinden", () => {
    render(<MyPrepsView cards={cards} userInitial="B" />);
    const group = screen.getByRole("group", { name: "Sınav ya da derse göre süz" });
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Tümü", "Matematik", "İŞLETME"]);
    fireEvent.click(Array.from(group.querySelectorAll("button")).find((b) => b.textContent === "Matematik")!);
    expect(screen.getByText("TYT Matematik kampı")).toBeTruthy();
    expect(screen.queryByText("Final haftası")).toBeNull();
  });
});
