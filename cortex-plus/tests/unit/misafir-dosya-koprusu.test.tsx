// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GuestDocumentOffer } from "@/components/parity/guest-document-offer";
import {
  GUEST_HANDOFF_MAX_BYTES,
  GUEST_HANDOFF_MAX_FILES,
  GUEST_HANDOFF_TTL_MS,
  clearGuestDocuments,
  formatFileSize,
  guestFileProblem,
  holdGuestDocuments,
  pickGuestFiles,
  purgeStaleGuestDocuments,
  readGuestMarker,
  takeGuestDocuments,
} from "@/lib/documents/guest-handoff";
import { LARGE_UPLOAD_MAX_BYTES, SMALL_UPLOAD_MAX_BYTES } from "@/lib/documents/upload-accept";

/*
  Misafirin ana sayfada bıraktığı dosyanın kurulumdaki karşılığı (11 Kasım 2026, kokpit).

  Canlı denetim: "tur başında 'hiçbir dosya yüklenmez' yazıyor ve gerçek bir sürükle-bırak kapısı yok." Artık misafir
  kendi notunu bırakabiliyor. Söz gerçek olsun diye dosya kayıttan sonra kaybolmaz: tarayıcıda bekler (sunucuya
  gitmez), kurulumun materyal adımında öğrencinin dokunuşuyla bildiğimiz yükleme yoluna verilir. Bu test köprünün
  kurallarını tutar: kabul edilen türler, sınırlar, süre, sekmeye bağlılık ve tek kullanım.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

/** Boyutu elle verilen dosya: büyük dosya sınırlarını bellek harcamadan denemek için. */
function fileOf(name: string, type: string, size = 1024): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

/** Testler için en küçük IndexedDB: tek veritabanı, anahtar yolu `id` olan depolar; istekler mikro görevde biter. */
function installFakeIndexedDb() {
  const stores = new Map<string, Map<string, unknown>>();
  const later = (work: () => void) => queueMicrotask(work);
  const request = <T,>(compute: () => T) => {
    const req: { result?: T; onsuccess?: () => void } = {};
    later(() => {
      req.result = compute();
      req.onsuccess?.();
    });
    return req;
  };
  const db = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string) => {
      stores.set(name, new Map());
    },
    close: () => undefined,
    transaction: (name: string) => {
      const data = stores.get(name)!;
      const tx: { oncomplete?: () => void; objectStore: () => unknown } = {
        objectStore: () => ({
          put: (value: { id: string }) => request(() => void data.set(value.id, value)),
          get: (id: string) => request(() => data.get(id)),
          getAll: () => request(() => [...data.values()]),
          delete: (id: string) => request(() => void data.delete(id)),
          clear: () => request(() => data.clear()),
        }),
      };
      // İşlem, içindeki istekler bittikten sonra tamamlanır.
      later(() => later(() => later(() => tx.oncomplete?.())));
      return tx;
    },
  };
  const fake = {
    open: () => {
      const req: { result: typeof db; onupgradeneeded?: () => void; onsuccess?: () => void } = { result: db };
      later(() => {
        if (!stores.size) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  vi.stubGlobal("indexedDB", fake);
  return stores;
}

beforeEach(async () => {
  await clearGuestDocuments();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("hangi dosya bekletilir", () => {
  it("ürünün okuduğu türler kabul edilir; öbürleri nedeniyle reddedilir", () => {
    for (const [name, type] of [
      ["not.pdf", "application/pdf"],
      ["slayt.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
      ["ozet.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["defter.jpg", "image/jpeg"],
      ["defter.HEIC", ""],
      ["konu.txt", "text/plain"],
      ["adsiz", "image/png"],
    ] as const) {
      expect(guestFileProblem(fileOf(name, type)), name).toBeNull();
    }
    expect(guestFileProblem(fileOf("oyun.exe", "application/octet-stream"))).toMatch(/oyun\.exe bu türde okunamıyor/);
    expect(guestFileProblem(fileOf("tablo.xlsx", ""))).toMatch(/bu türde okunamıyor/);
    expect(guestFileProblem(fileOf("bos.pdf", "application/pdf", 0))).toMatch(/boş görünüyor/);
  });

  it("boyut sınırı kurulumdakiyle aynı: PDF, Word ve sunu 50 MB, fotoğraf ve metin 15 MB", () => {
    expect(guestFileProblem(fileOf("kitap.pdf", "application/pdf", LARGE_UPLOAD_MAX_BYTES))).toBeNull();
    expect(guestFileProblem(fileOf("kitap.pdf", "application/pdf", LARGE_UPLOAD_MAX_BYTES + 1))).toMatch(/50 MB/);
    expect(guestFileProblem(fileOf("foto.png", "image/png", SMALL_UPLOAD_MAX_BYTES + 1))).toMatch(/15 MB/);
  });

  it("en çok on dosya ve toplam 100 MB bekletilir; fazlası için ne yapılacağı söylenir", () => {
    const many = Array.from({ length: GUEST_HANDOFF_MAX_FILES + 2 }, (_, at) => fileOf(`foto-${at}.jpg`, "image/jpeg"));
    const picked = pickGuestFiles(many);
    expect(picked.accepted).toHaveLength(GUEST_HANDOFF_MAX_FILES);
    expect(picked.problems.join(" ")).toMatch(/hesabını açınca eklersin/);
    const heavy = [fileOf("a.pdf", "application/pdf", 45 * 1024 * 1024), fileOf("b.pdf", "application/pdf", 45 * 1024 * 1024), fileOf("c.pdf", "application/pdf", 45 * 1024 * 1024)];
    const big = pickGuestFiles(heavy);
    expect(big.accepted.map((file) => file.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(big.accepted.reduce((sum, file) => sum + file.size, 0)).toBeLessThanOrEqual(GUEST_HANDOFF_MAX_BYTES);
    expect(big.problems[0]).toMatch(/c\.pdf sığmadı/);
    // Okunamayan dosya öbürlerini durdurmaz.
    expect(pickGuestFiles([fileOf("x.exe", ""), fileOf("not.pdf", "application/pdf")]).accepted).toHaveLength(1);
  });

  it("boyut okunur yazılır", () => {
    expect(formatFileSize(250_000)).toBe("244 KB");
    expect(formatFileSize(2_516_582)).toBe("2,4 MB");
    expect(formatFileSize(10)).toBe("1 KB");
  });
});

describe("dosya tarayıcıda bekler, sekmeye bağlıdır, süresi dolar", () => {
  it("tarayıcı saklayamıyorsa işaret yine yazılır ama dosya verilemez (ekran bunu söyler)", async () => {
    const marker = await holdGuestDocuments([fileOf("not.pdf", "application/pdf")]);
    expect(marker.stored).toBe(false);
    expect(readGuestMarker()?.names).toEqual(["not.pdf"]);
    expect(await takeGuestDocuments()).toBeNull();
  });

  it("saklanan dosya aynı sekmede geri alınır: ad, tür ve içerik aynı", async () => {
    installFakeIndexedDb();
    const marker = await holdGuestDocuments([new File(["merhaba"], "not.pdf", { type: "application/pdf", lastModified: 5 })]);
    expect(marker.stored).toBe(true);
    const files = await takeGuestDocuments();
    expect(files).toHaveLength(1);
    expect(files![0]!.name).toBe("not.pdf");
    expect(files![0]!.type).toBe("application/pdf");
    expect(files![0]!.size).toBe(7);
  });

  it("işareti olmayan sekme (başka kullanıcı, başka sekme) dosyayı göremez", async () => {
    const stores = installFakeIndexedDb();
    await holdGuestDocuments([fileOf("not.pdf", "application/pdf")]);
    expect(stores.get("held")?.size).toBe(1);
    // Yeni sekme: sekme oturumu boş. Kayıt tarayıcıda dursa da bu sekmeye sunulmaz.
    window.sessionStorage.clear();
    vi.resetModules();
    const fresh = await import("@/lib/documents/guest-handoff");
    expect(fresh.readGuestMarker()).toBeNull();
    expect(await fresh.takeGuestDocuments()).toBeNull();
    // Süresi dolmamış kayıt silinmez: öbür sekmedeki kayıt akışı dosyasını kaybetmez.
    await fresh.purgeStaleGuestDocuments();
    expect(stores.get("held")?.size).toBe(1);
  });

  it("iki saat sonra işaret geçersizdir ve kayıt ilk ziyarette silinir", async () => {
    const stores = installFakeIndexedDb();
    const now = Date.now();
    await holdGuestDocuments([fileOf("not.pdf", "application/pdf")], now);
    expect(readGuestMarker(now + GUEST_HANDOFF_TTL_MS - 1)).not.toBeNull();
    expect(readGuestMarker(now + GUEST_HANDOFF_TTL_MS + 1)).toBeNull();
    expect(await takeGuestDocuments(now + GUEST_HANDOFF_TTL_MS + 1)).toBeNull();
    await purgeStaleGuestDocuments(now + GUEST_HANDOFF_TTL_MS + 1);
    expect(stores.get("held")?.size).toBe(0);
  });

  it("yeni seçim bu sekmenin eskisinin yerini alır; kaldırınca kayıt ve işaret gider", async () => {
    const stores = installFakeIndexedDb();
    await holdGuestDocuments([fileOf("eski.pdf", "application/pdf")]);
    await holdGuestDocuments([fileOf("yeni.pdf", "application/pdf")]);
    expect(stores.get("held")?.size).toBe(1);
    expect((await takeGuestDocuments())![0]!.name).toBe("yeni.pdf");
    await clearGuestDocuments();
    expect(stores.get("held")?.size).toBe(0);
    expect(readGuestMarker()).toBeNull();
    expect(window.sessionStorage.getItem("cp:guest-doc")).toBeNull();
  });
});

describe("kurulumda: ana sayfada seçtiğin dosya", () => {
  it("bekleyen dosya yoksa hiçbir şey çizilmez", () => {
    const { container } = render(<GuestDocumentOffer variant="offer" onTake={() => undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("materyal adımından önce tek satır: dosya kaybolmadı", async () => {
    installFakeIndexedDb();
    await holdGuestDocuments([fileOf("Anatomi_vize_notu.pdf", "application/pdf")]);
    render(<GuestDocumentOffer variant="hint" />);
    expect((await screen.findByRole("status")).textContent).toMatch(/“Anatomi_vize_notu\.pdf” kaybolmadı: materyal adımında seni bekliyor/);
  });

  it("materyal adımında kart: öğrencinin dokunuşuyla sihirbazın yükleme yoluna verilir, sonra silinir", async () => {
    const stores = installFakeIndexedDb();
    await holdGuestDocuments([new File(["içerik"], "Anatomi_vize_notu.pdf", { type: "application/pdf" })]);
    const onTake = vi.fn();
    render(<GuestDocumentOffer variant="offer" onTake={onTake} />);
    const card = await screen.findByRole("group", { name: "Ana sayfada seçtiğin dosya" });
    expect(card.textContent).toContain("Ana sayfada seçtiğin “Anatomi_vize_notu.pdf” burada");
    // Dokunmadan hiçbir şey yüklenmez.
    expect(onTake).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bu dosyayı ekle" }));
    await waitFor(() => expect(onTake).toHaveBeenCalledTimes(1));
    const files = onTake.mock.calls[0]![0] as File[];
    expect(files.map((file) => file.name)).toEqual(["Anatomi_vize_notu.pdf"]);
    // Tek kullanımlık: tarayıcıdaki kopya ve işaret silinir, kart kapanır.
    await waitFor(() => expect(screen.queryByRole("group", { name: "Ana sayfada seçtiğin dosya" })).toBeNull());
    expect(stores.get("held")?.size).toBe(0);
    expect(readGuestMarker()).toBeNull();
  });

  it("vazgeçilince dosya silinir; saklanamayan dosyada ekleme düğmesi yok, yeniden seçmesi söylenir", async () => {
    const stores = installFakeIndexedDb();
    await holdGuestDocuments([fileOf("not.pdf", "application/pdf")]);
    const first = render(<GuestDocumentOffer variant="offer" onTake={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Vazgeç" }));
    await waitFor(() => expect(stores.get("held")?.size).toBe(0));
    expect(readGuestMarker()).toBeNull();
    first.unmount();
    // Saklanamayan dosya: tarayıcıda kopya yok.
    vi.unstubAllGlobals();
    await holdGuestDocuments([fileOf("foto.jpg", "image/jpeg")]);
    render(<GuestDocumentOffer variant="offer" onTake={() => undefined} />);
    expect((await screen.findByRole("status")).textContent).toMatch(/saklayamadı; aşağıdan bir kez daha seçmen yeterli/);
    expect(screen.queryByRole("button", { name: "Bu dosyayı ekle" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tamam" })).toBeTruthy();
  });
});

describe("bağlantılar: ana sayfa → kayıt → kurulum", () => {
  it("sihirbaz dosyayı bildiğimiz yükleme yoluna verir; önceki adımlarda hatırlatır", () => {
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain('<GuestDocumentOffer variant="offer" disabled={uploading} onTake={(files) => takeFiles(files)} />');
    expect(wizard).toContain('{step === "subject" || step === "date" || step === "target" ? <GuestDocumentOffer variant="hint" /> : null}');
    // Kart bırakma alanının üstünde: öğrenci dosyasını ilk bakışta görür.
    expect(wizard.indexOf('<GuestDocumentOffer variant="offer"')).toBeLessThan(wizard.indexOf('className={dragOver ? "apw-drop apw-drop--over" : "apw-drop"}'));
  });

  it("kayıt ekranı ?kaynak=belge ile gelen misafire dosyasının beklediğini söyler", () => {
    const signup = read("src/app/kayit/signup-wizard.tsx");
    expect(signup).toContain('searchParams.get("kaynak") === "belge"');
    expect(signup).toContain("readGuestMarker()");
    expect(signup).toContain("hesabın açılınca kurulumda");
    // Kayıt dönüş adresi kurulumdur ve güvenli yol denetiminden geçer.
    expect(read("src/lib/marketing/landing-journey.ts")).toContain('export const GUEST_DOCUMENT_NEXT = "/deneme-sinavlari/olustur";');
  });

  it("köprü dosyayı hiçbir yere göndermez", () => {
    const source = read("src/lib/documents/guest-handoff.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|\/api\/|supabase/i);
    const offer = read("src/components/parity/guest-document-offer.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(offer).not.toMatch(/\bfetch\(|\/api\//);
  });
});
