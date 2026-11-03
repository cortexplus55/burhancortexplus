/**
 * Canlı sohbet akışı (3 Kasım 2026, canlı ölçüm: ilk kelime 5–6 sn'de geliyordu çünkü cevap
 * kayıttan sonra gönderiliyordu). Model token'ları geldiği anda gövdeye yazılır; denetim,
 * ekler ve kayıt arkada sürer. Bitişte `LIVE_TRAILER_MARK` + JSON kuyruk gelir: kesin metin
 * (düzeltilmiş ya da geri çekilmiş olabilir), mesaj kimliği ve kaynak bilgisi. İstemci kuyruğu
 * görünce ekrandaki taslağı kesin metinle değiştirir.
 */
export const LIVE_HEADER = "X-Chat-Live";
export const LIVE_TRAILER_MARK = "\u001e";

export type LiveTrailer = {
  content: string;
  conversationId?: string;
  messageId?: string;
  sources?: number;
  sourceDoc?: string;
  sourcePage?: string;
  error?: boolean;
};

export type LiveChannel = {
  /** Yanıt başladı mı (ilk token yazıldı mı). */
  readonly started: boolean;
  readonly firstTokenMs: number | null;
  /** İlk token'da yanıtı açar; sonra yazar. */
  write(text: string): void;
  finish(trailer: LiveTrailer): void;
  /** Akış izni ve belge modu; izin yoksa write sessizce yok sayılır. */
  enable(documentsOnly: boolean): void;
  readonly enabled: boolean;
  /** İlk token'da çözülen yanıt. */
  response: Promise<Response>;
};

export function createLiveChannel(startedAt: number): LiveChannel {
  let documentsOnly = false;
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let started = false;
  let enabled = false;
  let closed = false;
  let firstTokenMs: number | null = null;
  let resolve!: (response: Response) => void;
  const response = new Promise<Response>((r) => { resolve = r; });
  const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  const open = () => {
    if (started) return;
    started = true;
    firstTokenMs = Date.now() - startedAt;
    resolve(new Response(stream, { headers: {
      "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store",
      [LIVE_HEADER]: "1", "X-Documents-Only": documentsOnly ? "1" : "0",
    } }));
  };
  return {
    get started() { return started; },
    get firstTokenMs() { return firstTokenMs; },
    get enabled() { return enabled; },
    enable(flag) { enabled = true; documentsOnly = flag; },
    response,
    write(text) {
      if (closed || !text || !enabled) return;
      open();
      // İşaret karakteri model metninde geçerse kuyrukla karışmasın.
      controller?.enqueue(encoder.encode(text.split(LIVE_TRAILER_MARK).join("")));
    },
    finish(trailer) {
      if (closed || !started) return;
      closed = true;
      try {
        controller?.enqueue(encoder.encode(LIVE_TRAILER_MARK + JSON.stringify(trailer)));
        controller?.close();
      } catch { /* istemci gitti */ }
    },
  };
}

/** İstemci: gövdeyi taslak ve kuyruk olarak ayırır. */
export function splitLiveBody(body: string): { draft: string; trailer: LiveTrailer | null } {
  const at = body.indexOf(LIVE_TRAILER_MARK);
  if (at < 0) return { draft: body, trailer: null };
  try {
    return { draft: body.slice(0, at), trailer: JSON.parse(body.slice(at + 1)) as LiveTrailer };
  } catch {
    return { draft: body.slice(0, at), trailer: null };
  }
}
