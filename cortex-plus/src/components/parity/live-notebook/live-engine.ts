import {
  LIVE_COST,
  liveRate,
  liveRevealedCount,
  liveStarts,
  type LiveSpeed,
} from "@/lib/learning/live-writing";

/**
 * Canlı Defter yazım motoru (28 Kasım 2026). React'e dokunmaz; yalnız sınıf ekler/çıkarır ve kalemin konumunu yazar.
 *
 * - Birimler DOM sırasıyla toplanır: `RichBody`'nin canlı çıktısındaki kelime (`.lw`), formül (`.lw-atom`) ve vurgu
 *   (`.lw-hl`) birer birim; kelimesi olmayan her kutu (formül kartı, not, tablo, soru) tek birim (`.lw-block`).
 *   Başlık ve etiketler (`.als-heading`, `.als-kicker`) birim değildir, hep görünür.
 * - Yazım sürerken kapsam `lw-playing` taşır; açılmamış birim görünmez ama yerini kaplar (sayfa kaymaz).
 * - Öğrenci tekerlek, parmak ya da tuşla kaydırırsa izleme o an durur; kaydırma hiç kilitlenmez.
 * - Kapsama yeni içerik gelirse (önce dene sorusu cevaplanınca açılan anlatım) yazım kaldığı yerden sürer.
 */

export type LivePhaseChange = "playing" | "done";

type Unit = { el: Element; cost: number };

const SKIP = ".als-kicker, .als-heading, .als-part, [data-lw-skip]";
/** Kalemin ucu ile SVG'nin sol alt köşesi arasındaki pay (px). */
const PEN_TIP = { x: 3, y: 21 };
/** İzleme: kalem görünür alanın bu oranının altına inince sayfa yumuşakça kayar. */
const FOLLOW_LIMIT = 0.78;
const FOLLOW_TARGET = 0.55;
const FOLLOW_EVERY_MS = 320;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

/** Açılış birimleri, DOM sırasıyla. Kelimesi olmayan kutu tek birim olur ve `lw lw-block` sınıfını alır. */
export function collectLiveUnits(root: Element): Unit[] {
  const out: Unit[] = [];
  const walk = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (child.matches(SKIP)) continue;
      const classes = child.classList;
      if (classes.contains("lw") && !classes.contains("lw-block")) {
        const atom = classes.contains("lw-atom") || classes.contains("lw-hl");
        out.push({ el: child, cost: atom ? LIVE_COST.atom : LIVE_COST.word });
        continue;
      }
      if (child.querySelector(".lw:not(.lw-block)")) {
        walk(child);
        continue;
      }
      // Kutu sarmalayıcısı görünmez (`display: contents`, ör. art arda kart satırı): kartlar tek tek açılır.
      if (typeof window !== "undefined" && window.getComputedStyle(child).display === "contents") {
        walk(child);
        continue;
      }
      classes.add("lw", "lw-block");
      out.push({ el: child, cost: LIVE_COST.block });
    }
  };
  walk(root);
  return out;
}

export function canAnimateLive(): boolean {
  return typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
}

export type LiveEngine = {
  /** Baştan yaz (ilk giriş ya da "Tekrar oynat"). */
  play(): void;
  /** Hepsini anında göster ("Hepsini göster"). */
  showAll(): void;
  /** Yazım yok: içerik tam açık (geri dönülen adım, hareket azaltma). */
  settle(): void;
  setSpeed(speed: LiveSpeed): void;
  destroy(): void;
};

export function createLiveEngine(
  scope: HTMLElement,
  pen: HTMLElement | null,
  options: { speed: LiveSpeed; onPhase: (phase: LivePhaseChange) => void },
): LiveEngine {
  let speed = options.speed;
  let units: Unit[] = [];
  let starts: number[] = [];
  let total = 0;
  let progress = 0;
  let shown = 0;
  let frame = 0;
  let last = 0;
  let follow = true;
  let lastFollow = 0;
  let observer: MutationObserver | null = null;
  let listening = false;
  let reindexQueued = false;

  const stopFollowing = () => {
    follow = false;
  };
  const onKey = (event: KeyboardEvent) => {
    if (SCROLL_KEYS.has(event.key)) follow = false;
  };

  function listen(on: boolean) {
    if (on === listening) return;
    listening = on;
    const method = on ? "addEventListener" : "removeEventListener";
    window[method]("wheel", stopFollowing, { passive: true } as AddEventListenerOptions);
    window[method]("touchmove", stopFollowing, { passive: true } as AddEventListenerOptions);
    window[method]("keydown", onKey as EventListener);
  }

  function index() {
    units = collectLiveUnits(scope);
    starts = liveStarts(units.map((unit) => unit.cost));
    total = units.reduce((sum, unit) => sum + unit.cost, 0);
  }

  function penOff() {
    pen?.classList.remove("is-on");
  }

  function placePen(el: Element) {
    if (!pen) return;
    const box = scope.getBoundingClientRect();
    const rects = el.getClientRects();
    const rect = rects.length ? rects[rects.length - 1]! : el.getBoundingClientRect();
    const block = el.classList.contains("lw-block");
    const rawX = (block ? rect.left + Math.min(rect.width, 24) : rect.right + 1) - box.left;
    const x = Math.max(0, Math.min(rawX, box.width - 18));
    const y = rect.bottom - box.top;
    pen.style.transform = `translate3d(${(x - PEN_TIP.x).toFixed(1)}px, ${(y - PEN_TIP.y).toFixed(1)}px, 0)`;
    pen.classList.add("is-on");
  }

  function followPen(now: number) {
    if (!follow || !pen || now - lastFollow < FOLLOW_EVERY_MS) return;
    lastFollow = now;
    const bottom = pen.getBoundingClientRect().bottom;
    const limit = window.innerHeight * FOLLOW_LIMIT;
    if (bottom > limit) {
      window.scrollTo({ top: window.scrollY + (bottom - window.innerHeight * FOLLOW_TARGET), behavior: "smooth" });
    }
  }

  function reveal() {
    const count = liveRevealedCount(starts, progress);
    for (let at = 0; at < count; at += 1) units[at]!.el.classList.add("is-in");
    if (count > shown && count > 0) placePen(units[count - 1]!.el);
    shown = count;
  }

  function step(now: number) {
    frame = 0;
    const elapsed = last ? Math.min(64, now - last) : 16;
    last = now;
    progress += (elapsed / 1000) * liveRate(total, speed);
    reveal();
    followPen(now);
    if (progress >= total) {
      finish();
      return;
    }
    frame = window.requestAnimationFrame(step);
  }

  function run() {
    if (frame || !canAnimateLive()) return;
    last = 0;
    frame = window.requestAnimationFrame(step);
  }

  function halt() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  function finish() {
    halt();
    progress = Math.max(progress, total);
    for (const unit of units) unit.el.classList.add("is-in");
    shown = units.length;
    penOff();
    listen(false);
    options.onPhase("done");
  }

  function observe(on: boolean) {
    if (!on) {
      observer?.disconnect();
      observer = null;
      return;
    }
    if (observer || typeof MutationObserver === "undefined") return;
    observer = new MutationObserver(() => {
      if (reindexQueued) return;
      reindexQueued = true;
      queueMicrotask(() => {
        reindexQueued = false;
        if (!scope.classList.contains("lw-playing")) return;
        index();
        // Yeni içerik (önce dene sorusu cevaplanınca açılan anlatım): yazım kaldığı yerden sürer.
        if (progress < total && !frame) {
          follow = true;
          listen(true);
          options.onPhase("playing");
          run();
        } else {
          reveal();
        }
      });
    });
    observer.observe(scope, { childList: true, subtree: true });
  }

  return {
    play() {
      halt();
      index();
      for (const unit of units) unit.el.classList.remove("is-in");
      progress = 0;
      shown = 0;
      follow = true;
      lastFollow = 0;
      scope.classList.add("lw-playing");
      listen(true);
      observe(true);
      options.onPhase("playing");
      reveal();
      run();
    },
    showAll() {
      halt();
      observe(false);
      listen(false);
      penOff();
      scope.classList.remove("lw-playing");
      progress = total;
      options.onPhase("done");
    },
    settle() {
      halt();
      observe(false);
      listen(false);
      penOff();
      scope.classList.remove("lw-playing");
    },
    setSpeed(next) {
      speed = next;
    },
    destroy() {
      halt();
      observe(false);
      listen(false);
      penOff();
      scope.classList.remove("lw-playing");
    },
  };
}
