// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/*
  Fotoğraf küçültme ve sayfa tepsisi (20 Kasım 2026, ürün sahibi: öğrencilerin çoğu telefonla 5-15 defter sayfası
  çekiyor; 6-12 MB fotoğraf mobilde yavaş yükleniyor ya da 4,5 MB istek gövdesi sınırına takılıyor).

  1. Tek küçültücü (`@/lib/upload/compress-image`): uzun kenar 1600, JPEG %82, yön bilgisi uygulanır, saydamlık beyaza;
     belge yüklemesi, fotoğraf seti, soru çözücü ve kâğıtta çöz aynı koddan geçer.
  2. Soru çözücü fotoğrafı küçültülmüş gönderir (HEIC çözülebiliyorsa JPEG'e; çözücü HEIC almıyor).
  3. Kurulumun materyal adımında yalnız fotoğraftan oluşan seçim önce tepsiye girer: önizleme, sıra, silme, "Bir sayfa
     daha ekle"; "Sayfaları yükle" tepsiyi sırasıyla bugünkü motora verir. Belge ve karışık seçim hemen yüklenir.
*/

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/deneme-sinavlari/olustur",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }));
vi.mock("@/lib/student/student-shell-context", () => ({
  useStudentShellAccount: () => ({ audience: "free" }),
  useDocumentLimits: () => ({ isAdmin: false }),
  useIsFounder: () => false,
}));

import {
  DOCUMENT_IMAGE_TYPES,
  IMAGE_MAX_SIDE,
  IMAGE_OUTPUT_TYPE,
  IMAGE_QUALITY,
  SOLVE_IMAGE_TYPES,
  compressImageForUpload,
  encodeImage,
} from "@/lib/upload/compress-image";
import * as legacy from "@/lib/documents/image-compress";
import { PHOTO_SET_MAX_SIDE, PHOTO_SET_QUALITY } from "@/lib/documents/photo-set-pdf";
import { encodePhotoPage } from "@/lib/documents/photo-set-client";
import { requestSolve, solveUploadFile } from "@/lib/solve/solve-client";
import { movePage, photoOnlySelection, trayUploadLabel } from "@/lib/upload/photo-tray";
import { usePhotoTray } from "@/lib/upload/use-photo-tray";
import { CameraCaptureInput, PhotoPageTray } from "@/components/parity/photo-page-tray";
import { ExamCreateWizard } from "@/components/parity/exam-create-wizard";
import { examWizardDraftKey, setExamWizardDraftOwner, type ExamWizardDraft } from "@/lib/learning/exam-wizard-draft";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

type CanvasRecord = { width: number; height: number; type?: string; quality?: number; ops: string[] };

/** jsdom çizim yapmaz: tuval gerçek öğe, yalnız 2B bağlamı ve `toBlob` kayıt tutan sahte. */
function stubCanvas(blobBytes = 300_000) {
  const records: CanvasRecord[] = [];
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string, options?: ElementCreationOptions) => {
    const element = create(tag, options);
    if (tag !== "canvas") return element;
    const canvas = element as HTMLCanvasElement;
    const record: CanvasRecord = { width: 0, height: 0, ops: [] };
    records.push(record);
    const context = {
      fillStyle: "",
      fillRect: () => record.ops.push(`fill ${context.fillStyle}`),
      drawImage: (_source: unknown, _x: number, _y: number, width: number, height: number) => {
        record.width = canvas.width;
        record.height = canvas.height;
        record.ops.push(`draw ${width}x${height}`);
      },
    };
    canvas.getContext = (() => context) as unknown as HTMLCanvasElement["getContext"];
    canvas.toBlob = ((callback: BlobCallback, type?: string, quality?: number) => {
      record.type = type;
      record.quality = quality;
      const bytes = new Uint8Array(blobBytes);
      bytes[0] = 0xff;
      bytes[1] = 0xd8;
      callback(new Blob([bytes], { type }));
    }) as HTMLCanvasElement["toBlob"];
    return canvas;
  }) as typeof document.createElement);
  return records;
}

/** Telefon fotoğrafı: 4000×3000 ve 10 MB (çözülmüş boyu `createImageBitmap` sahtesi verir). */
function stubBitmap(width = 4000, height = 3000) {
  const close = vi.fn();
  const create = vi.fn(async () => ({ width, height, close }) as unknown as ImageBitmap);
  vi.stubGlobal("createImageBitmap", create);
  return { create, close };
}

const photo = (name: string, bytes = 10_000_000, type = "image/jpeg") => new File([new Uint8Array(bytes)], name, { type });

let urls: string[] = [];
let revoked: string[] = [];

beforeEach(() => {
  urls = [];
  revoked = [];
  let n = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      n += 1;
      const url = `blob:test/${n}-${(blob as File).name ?? "onizleme"}`;
      urls.push(url);
      return url;
    }),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn((url: string) => revoked.push(url)),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

/* ---------- 1. Tek küçültücü ---------- */

describe("tek küçültücü", () => {
  it("sabitler tek kaynakta: 1600 piksel, JPEG %82; fotoğraf seti ve eski yol aynı değerleri okur", () => {
    expect(IMAGE_MAX_SIDE).toBe(1600);
    expect(IMAGE_QUALITY).toBe(0.82);
    expect(IMAGE_OUTPUT_TYPE).toBe("image/jpeg");
    expect(PHOTO_SET_MAX_SIDE).toBe(IMAGE_MAX_SIDE);
    expect(PHOTO_SET_QUALITY).toBe(IMAGE_QUALITY);
    expect(legacy.UPLOAD_IMAGE_MAX_SIDE).toBe(IMAGE_MAX_SIDE);
    expect(legacy.UPLOAD_IMAGE_QUALITY).toBe(IMAGE_QUALITY);
    expect(legacy.compressImageForUpload).toBe(compressImageForUpload);
  });

  it("4000×3000, 10 MB fotoğraf: uzun kenar 1600'e iner, kalite 0,82, yön seçeneği verilir, beyaz zemin, .jpg", async () => {
    const { create, close } = stubBitmap(4000, 3000);
    const canvases = stubCanvas(320_000);
    const original = photo("IMG_2031.HEIC", 10_000_000, "image/heic");
    const out = await compressImageForUpload(original);

    expect(create).toHaveBeenCalledWith(original, { imageOrientation: "from-image" });
    expect(canvases).toHaveLength(1);
    expect(canvases[0]).toMatchObject({ width: 1600, height: 1200, type: "image/jpeg", quality: 0.82 });
    // Saydamlık siyaha dönmesin: önce beyaz zemin, sonra fotoğraf.
    expect(canvases[0]!.ops).toEqual(["fill #ffffff", "draw 1600x1200"]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(out).not.toBe(original);
    expect(out.name).toBe("IMG_2031.jpg");
    expect(out.type).toBe("image/jpeg");
    expect(out.size).toBe(320_000);
    expect(out.size / original.size).toBeLessThan(0.05);
  });

  it("dikey fotoğrafın oranı korunur", async () => {
    stubBitmap(3000, 4000);
    const canvases = stubCanvas();
    await compressImageForUpload(photo("dikey.jpg"));
    expect(canvases[0]).toMatchObject({ width: 1200, height: 1600 });
  });

  it("küçük ve zaten küçük boyutlu fotoğrafa dokunulmaz (tuval açılmaz)", async () => {
    stubBitmap(1200, 900);
    const canvases = stubCanvas();
    const small = photo("kucuk.jpg", 400_000);
    expect(await compressImageForUpload(small)).toBe(small);
    expect(canvases).toHaveLength(0);
  });

  it("yeniden kodlanınca büyüyen, boyu da küçülmeyen JPEG olduğu gibi kalır", async () => {
    stubBitmap(1500, 1000);
    stubCanvas(2_000_000);
    const original = photo("zaten-iyi.jpg", 1_200_000);
    expect(await compressImageForUpload(original)).toBe(original);
  });

  it("tarayıcı çözemezse (HEIC'i açamayan tarayıcı) dosya olduğu gibi gider; açılan adres bırakılır", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("decode"))));
    const canvases = stubCanvas();
    const heic = photo("IMG_0001.HEIC", 3_000_000, "image/heic");
    expect(await compressImageForUpload(heic)).toBe(heic);
    expect(await encodeImage(heic)).toBeNull();
    expect(canvases).toHaveLength(0);
    // jsdom'da resim öğesinin `decode`'u yok: adres açıldıysa bırakılmıştır.
    expect(revoked).toEqual(urls);
  });

  it("yön seçeneğini tanımayan tarayıcıda resim öğesine düşer (tarayıcı yönü resimde uygular)", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new TypeError("imageOrientation"))));
    class FakeImage {
      decoding = "";
      src = "";
      naturalWidth = 3024;
      naturalHeight = 4032;
      decode() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const canvases = stubCanvas();
    const out = await compressImageForUpload(photo("yan-cekim.jpg", 5_000_000));
    expect(canvases[0]).toMatchObject({ width: 1200, height: 1600, quality: 0.82 });
    expect(out.type).toBe("image/jpeg");
    expect(revoked).toEqual(urls);
    expect(urls).toHaveLength(1);
  });

  it("belge ve fotoğraf olmayan dosyaya hiç dokunulmaz", async () => {
    const create = vi.fn();
    vi.stubGlobal("createImageBitmap", create);
    const pdf = new File(["%PDF-1.4"], "not.pdf", { type: "application/pdf" });
    expect(await compressImageForUpload(pdf)).toBe(pdf);
    expect(create).not.toHaveBeenCalled();
  });

  it("fotoğraf setinin sayfası aynı koddan: 1600 piksel, %82, JPEG baytları", async () => {
    stubBitmap(4080, 3060);
    const canvases = stubCanvas(280_000);
    const page = await encodePhotoPage(photo("sayfa-1.jpg"));
    expect(page).toMatchObject({ width: 1600, height: 1200 });
    expect(page!.jpeg[0]).toBe(0xff);
    expect(page!.jpeg).toHaveLength(280_000);
    expect(canvases[0]).toMatchObject({ quality: 0.82, type: "image/jpeg" });
  });

  it("kaynakta ikinci bir küçültücü yok: tuvalden JPEG yalnız tek küçültücüde üretilir", () => {
    // Fotoğrafı çözen ya da tuvalden dosya üreten yerler: küçültücü, netlik ölçüsü (yalnız ölçer) ve çizim penceresi
    // (öğrencinin kendi çizimi, PNG). Yeni bir yer eklenirse önce tek küçültücü kullanılmalı.
    const allowed = new Set([
      "src/lib/upload/compress-image.ts",
      "src/lib/documents/photo-quality.ts",
      "src/components/parity/sketch-dialog.tsx",
    ]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name)) {
          const rel = path.replace(/\\/g, "/");
          const source = read(path);
          if (/createImageBitmap\(|\.toBlob\(|\.toDataURL\("image\/jpeg"/.test(source) && !allowed.has(rel)) offenders.push(rel);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
    expect(read("src/components/parity/paper-exam-runner.tsx")).toContain("encodeImage(file, step)");
  });
});

/* ---------- 2. Soru çözücü ---------- */

describe("soru çözücü fotoğrafı küçültülmüş gönderir", () => {
  it("10 MB fotoğraf 1600 piksel JPEG olarak gider", async () => {
    stubBitmap(4000, 3000);
    stubCanvas(310_000);
    let sent: FormData | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        sent = init?.body as FormData;
        return new Response("", { status: 200 });
      }),
    );
    await requestSolve({ file: photo("soru.jpg") }, () => undefined);
    const file = (sent as FormData | null)?.get("file") as File;
    expect(file.type).toBe("image/jpeg");
    expect(file.size).toBe(310_000);
    expect(file.name).toBe("soru.jpg");
  });

  it("çözücü HEIC almıyor: küçük HEIC de çözülebiliyorsa JPEG'e çevrilir; belge yüklemesinde olduğu gibi kalır", async () => {
    stubBitmap(1200, 900);
    stubCanvas(200_000);
    const heic = photo("IMG_9.HEIC", 300_000, "image/heic");
    expect(SOLVE_IMAGE_TYPES).not.toContain("image/heic");
    expect(DOCUMENT_IMAGE_TYPES).toContain("image/heic");
    expect((await solveUploadFile(heic)).type).toBe("image/jpeg");
    expect(await compressImageForUpload(heic)).toBe(heic);
  });

  it("Soru Çöz ekranı ve sohbet aynı gönderimden geçer; eski ayrı küçültücü yok", () => {
    expect(read("src/components/learning/question-solver.tsx")).toContain("requestSolve(");
    expect(read("src/components/chat/chat-panel.tsx")).toContain("await requestSolve(");
    expect(read("src/lib/solve/solve-client.ts")).toContain("form.append(\"file\", await solveUploadFile(request.file))");
    expect(() => readFileSync("src/lib/solve/downscale-image.ts")).toThrow();
  });
});

/* ---------- 3. Sayfa tepsisi ---------- */

function Harness({ onUpload, instant = true }: { onUpload: (files: File[]) => void; instant?: boolean }) {
  const tray = usePhotoTray(instant ? { preview: async () => null } : {});
  return (
    <div>
      <button type="button" onClick={() => tray.add([photo("a.jpg", 10), photo("b.jpg", 10), photo("c.jpg", 10)])}>
        üç sayfa
      </button>
      <PhotoPageTray tray={tray} onAddPage={() => tray.add([photo("d.jpg", 10)])} onUpload={onUpload} />
    </div>
  );
}

const order = () =>
  screen.queryAllByRole("listitem").map((item) => within(item).getByRole("img").getAttribute("src") ?? "");

describe("sayfa tepsisi", () => {
  it("saf kısım: yalnız fotoğraftan oluşan seçim tepsiye girer; sıra taşıma uçlarda durur", () => {
    expect(photoOnlySelection([{ name: "a.jpg", type: "image/jpeg" }, { name: "b.HEIC", type: "" }])).toBe(true);
    expect(photoOnlySelection([{ name: "a.jpg", type: "image/jpeg" }, { name: "n.pdf", type: "application/pdf" }])).toBe(false);
    expect(photoOnlySelection([])).toBe(false);
    const pages = [{ id: "1" }, { id: "2" }, { id: "3" }];
    expect(movePage(pages, "3", -1).map((page) => page.id)).toEqual(["1", "3", "2"]);
    expect(movePage(pages, "1", -1).map((page) => page.id)).toEqual(["1", "2", "3"]);
    expect(movePage(pages, "3", 1).map((page) => page.id)).toEqual(["1", "2", "3"]);
    expect(trayUploadLabel(1)).toBe("Sayfayı yükle");
    expect(trayUploadLabel(4)).toBe("Sayfaları yükle (4)");
  });

  it("ekle, sırala, sil: numaralar ve sıra; silinen sayfanın adresi bırakılır; yükleme tepsinin sırasıyla", async () => {
    const onUpload = vi.fn();
    render(<Harness onUpload={onUpload} />);
    expect(screen.queryByRole("list")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "üç sayfa" }));
    await waitFor(() => expect(screen.getAllByRole("img", { name: /Sayfa \d/ })).toHaveLength(3));
    await waitFor(() => expect(order().every((src) => src.startsWith("blob:"))).toBe(true));
    expect(document.querySelector(".cx-ptray-count")?.textContent).toBe("3 sayfa");
    expect(order()).toEqual(["blob:test/1-a.jpg", "blob:test/2-b.jpg", "blob:test/3-c.jpg"]);

    // Uçtaki düğmeler kapalı.
    expect((screen.getByRole("button", { name: "1. sayfayı önceye taşı" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "3. sayfayı sonraya taşı" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "3. sayfayı önceye taşı" }));
    expect(order()).toEqual(["blob:test/1-a.jpg", "blob:test/3-c.jpg", "blob:test/2-b.jpg"]);
    expect(screen.getAllByRole("img").map((image) => image.getAttribute("alt"))).toEqual(["Sayfa 1", "Sayfa 2", "Sayfa 3"]);

    fireEvent.click(screen.getByRole("button", { name: "1. sayfayı kaldır" }));
    expect(revoked).toEqual(["blob:test/1-a.jpg"]);
    expect(order()).toEqual(["blob:test/3-c.jpg", "blob:test/2-b.jpg"]);

    // "Bir sayfa daha ekle" sona ekler.
    fireEvent.click(screen.getByRole("button", { name: "📷 Bir sayfa daha ekle" }));
    await waitFor(() => expect(order()).toEqual(["blob:test/3-c.jpg", "blob:test/2-b.jpg", "blob:test/4-d.jpg"]));

    fireEvent.click(screen.getByRole("button", { name: "Sayfaları yükle (3)" }));
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect((onUpload.mock.calls[0]![0] as File[]).map((file) => file.name)).toEqual(["c.jpg", "b.jpg", "d.jpg"]);
    // Tepsi boşaldı, bütün önizleme adresleri bırakıldı.
    expect(screen.queryByRole("list")).toBeNull();
    expect(new Set(revoked)).toEqual(new Set(urls));
  });

  it("kapanınca (sayfa değişince) bekleyen önizleme adresleri bırakılır; açılamayan önizleme simgeye döner", async () => {
    const view = render(<Harness onUpload={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "üç sayfa" }));
    await waitFor(() => expect(urls).toHaveLength(3));
    const first = screen.getAllByRole("img")[0]!;
    fireEvent.error(first);
    expect(revoked).toEqual([urls[0]]);
    expect(screen.getAllByRole("img", { name: "Sayfa 1" })[0]!.tagName).toBe("SPAN");
    view.unmount();
    expect(new Set(revoked)).toEqual(new Set(urls));
  });

  it("önizleme küçük JPEG: tam boy fotoğraf aynı anda açılmaz (uzun kenar 320)", async () => {
    stubBitmap(4000, 3000);
    const canvases = stubCanvas(9_000);
    render(<Harness onUpload={() => undefined} instant={false} />);
    fireEvent.click(screen.getByRole("button", { name: "üç sayfa" }));
    await waitFor(() => expect(urls).toHaveLength(3));
    expect(canvases.map((canvas) => `${canvas.width}x${canvas.height}`)).toEqual(["320x240", "320x240", "320x240"]);
  });

  it("kamera girişi: arka kamera, yalnız görsel, her çekim bir sayfa", () => {
    const onFiles = vi.fn();
    const { container } = render(<CameraCaptureInput onFiles={onFiles} />);
    const input = container.querySelector("input")!;
    expect(input.getAttribute("capture")).toBe("environment");
    expect(input.getAttribute("accept")).toBe("image/*");
    expect(input.multiple).toBe(false);
    fireEvent.change(input, { target: { files: [photo("kamera.jpg", 10)] } });
    expect(onFiles.mock.calls[0]![0][0].name).toBe("kamera.jpg");
  });
});

/* ---------- Kurulumun materyal adımı ---------- */

function seedMaterialStep() {
  setExamWizardDraftOwner("foto-tepsi");
  const key = examWizardDraftKey("foto-tepsi")!;
  const draft: ExamWizardDraft = {
    v: 1,
    step: "material",
    subject: "Biyoloji",
    examDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    target: 80,
    language: "tr",
    modality: "auto",
    modalities: [],
    equalFocus: true,
    focusTopics: [],
    materials: [],
    failedMaterials: [],
    processing: null,
    title: "",
    orderEdited: false,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(key, JSON.stringify(draft));
}

describe("kurulumun materyal adımında sayfa tepsisi", () => {
  let prepared: string[] = [];
  let calls: string[] = [];

  beforeEach(() => {
    prepared = [];
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/api/documents/upload/prepare")) prepared.push(JSON.parse(String(init?.body)).fileName);
        return new Response(JSON.stringify({ error: "Oturum gerekli" }), { status: 401 });
      }),
    );
  });

  it("yalnız fotoğraf seçilince yükleme başlamaz, tepsi açılır; sıralanıp yüklenince motor tepsinin sırasıyla gönderir", async () => {
    seedMaterialStep();
    const { container } = render(<ExamCreateWizard onUseChat={() => undefined} gradeLevel="11. sınıf" />);
    await screen.findByRole("heading", { name: "Çalışma materyalini ekle" });
    const zone = container.querySelector(".apw-drop")!;
    // Bölgede tek dosya girişi; kamera girişi bölgenin dışında.
    expect(zone.querySelectorAll("input[type=file]")).toHaveLength(1);
    const camera = container.querySelector('input[capture="environment"]') as HTMLInputElement;
    expect(camera).toBeTruthy();
    expect(zone.contains(camera)).toBe(false);

    const input = zone.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [photo("s1.jpg", 10), photo("s2.jpg", 10), photo("s3.jpg", 10)] } });
    const tray = await screen.findByRole("region", { name: "Ders notu sayfaları" });
    expect(within(tray).getAllByRole("listitem")).toHaveLength(3);
    // Yükleme yok, tarama anı yok, "Devam et" yok: ekranın tek ana düğmesi tepsinin yüklemesi.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(calls.filter((url) => url.includes("/api/documents"))).toEqual([]);
    expect(zone.querySelector(".cx-scan-core[data-playing]")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Devam et/ })).toBeNull();

    // Kamerayla bir sayfa daha.
    fireEvent.change(camera, { target: { files: [photo("s4.jpg", 10)] } });
    await waitFor(() => expect(within(tray).getAllByRole("listitem")).toHaveLength(4));
    fireEvent.click(within(tray).getByRole("button", { name: "4. sayfayı önceye taşı" }));
    fireEvent.click(within(tray).getByRole("button", { name: "1. sayfayı kaldır" }));
    fireEvent.click(within(tray).getByRole("button", { name: "Sayfaları yükle (3)" }));

    await waitFor(() => expect(prepared).toEqual(["s2.jpg", "s4.jpg", "s3.jpg"]));
    expect(screen.queryByRole("region", { name: "Ders notu sayfaları" })).toBeNull();
  });

  it("belge içeren seçim bugünkü gibi hemen yüklenir (tepsi açılmaz)", async () => {
    seedMaterialStep();
    const { container } = render(<ExamCreateWizard onUseChat={() => undefined} gradeLevel="11. sınıf" />);
    await screen.findByRole("heading", { name: "Çalışma materyalini ekle" });
    const input = container.querySelector(".apw-drop input[type=file]") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["%PDF-1.4"], "not.pdf", { type: "application/pdf" }), photo("defter.jpg", 10)] },
    });
    await waitFor(() => expect(prepared.length).toBeGreaterThan(0));
    expect(screen.queryByRole("region", { name: "Ders notu sayfaları" })).toBeNull();
  });

  it("kaynak: telefondan yükleme de tepsiyi hazırlıkta açar; motor ve fotoğraf sorusu yerinde", () => {
    const phone = read("src/components/parity/phone-upload-client.tsx");
    expect(phone).toContain("if (usesTray && photoOnlySelection(files)) tray.add(files);");
    expect(phone).toContain("onUpload={(files) => void sendFiles(files)}");
    expect(phone).toContain('const usesTray = purpose === "hazirlik";');
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain("onUpload={(files) => void takeFiles(files)}");
    expect(wizard).toContain("if (photoOnlySelection(picked)) tray.add(picked);");
    // Sürükle-bırak bugünkü gibi hemen.
    expect(wizard).toContain("void takeFiles(e.dataTransfer.files);");
    expect(wizard).toContain("!checkingMaterials && !trayPending");
  });
});
