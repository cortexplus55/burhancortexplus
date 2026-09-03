/**
 * Kutlama patlaması — doğru cevap, tamamlanan hazırlık gibi anlar için.
 *
 * Kütüphane yok: CSP'nin izin verdiği CDN'ler yalnızca birkaç kaynağa
 * kapalı, canvas üzerinde birkaç yüz satırlık bir efekt için bağımlılık
 * eklemeye değmez. Parçacık üretimi saf fonksiyon olarak ayrıldı ki test
 * edilebilsin; ekrana çizen kısım tarayıcıya özel ve test edilmiyor.
 */

export type ConfettiParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
};

const DEFAULT_COLORS = ["#e8a33d", "#f0b354", "#7c6cf7", "#6b8cff", "#4ade80"];

/**
 * Parçacıkları üretir. `rand` enjekte edilebilir (varsayılan Math.random) —
 * testte sabit bir üreteçle deterministik davranış doğrulanabiliyor.
 */
export function createConfettiParticles(
  count: number,
  originX: number,
  originY: number,
  options: { colors?: string[]; rand?: () => number } = {},
): ConfettiParticle[] {
  const colors = options.colors ?? DEFAULT_COLORS;
  const rand = options.rand ?? Math.random;
  const particles: ConfettiParticle[] = [];

  for (let i = 0; i < count; i += 1) {
    // Yukarı doğru geniş bir huni: -110°..-70° arası açı, patlama hissi verir.
    const angle = (-110 + rand() * 40) * (Math.PI / 180);
    const speed = 4 + rand() * 5;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + rand() * 5,
      color: colors[Math.floor(rand() * colors.length)],
      rotation: rand() * 360,
      rotationSpeed: -8 + rand() * 16,
    });
  }
  return particles;
}

export type CelebrateOptions = {
  /** Patlama merkezi; verilmezse ekranın üst-orta noktası. */
  originX?: number;
  originY?: number;
  count?: number;
  colors?: string[];
};

// Aynı anda tek kutlama: yeni bir celebrate() çağrısı öncekini hemen
// temizliyor. Olmasaydı hızlı art arda doğru cevaplarda ekranda üst üste
// canvas birikirdi.
let activeCleanup: (() => void) | null = null;

/**
 * Tam ekran, tıklamayı yutmayan bir canvas açıp kutlamayı oynatır ve
 * kendini temizler. `prefers-reduced-motion` açıksa hiçbir şey yapmaz —
 * bu bilgi taşımayan saf bir süs, hareketi azaltan kullanıcıya dayatmıyoruz.
 */
export function celebrate(options: CelebrateOptions = {}): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  activeCleanup?.();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const originX = options.originX ?? window.innerWidth / 2;
  const originY = options.originY ?? window.innerHeight * 0.35;
  let particles = createConfettiParticles(options.count ?? 90, originX, originY, {
    colors: options.colors,
  });

  const gravity = 0.16;
  const drag = 0.985;
  const durationMs = 2200;
  const fadeMs = 500;
  const startedAt = performance.now();
  let raf = 0;

  function cleanup() {
    cancelAnimationFrame(raf);
    window.clearTimeout(hardStop);
    canvas.remove();
    if (activeCleanup === cleanup) activeCleanup = null;
  }
  activeCleanup = cleanup;

  // Sekme arka plandayken requestAnimationFrame durabiliyor — o durumda
  // frame sayısı hiç ilerlemez ve canvas süresiz asılı kalır. Gerçek geçen
  // süreye dayanan bu zaman aşımı, sekme öne geldiğinde temizliği garanti
  // ediyor; setTimeout arka planda da (yavaşlasa da) çalışmaya devam ediyor.
  const hardStop = window.setTimeout(cleanup, durationMs + 2000);

  function tick() {
    const elapsed = performance.now() - startedAt;
    if (elapsed >= durationMs) {
      cleanup();
      return;
    }

    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.map((p) => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      vx: p.vx * drag,
      vy: p.vy * drag + gravity,
      rotation: p.rotation + p.rotationSpeed,
    }));

    const fade =
      elapsed > durationMs - fadeMs
        ? Math.max(0, (durationMs - elapsed) / fadeMs)
        : 1;
    for (const p of particles) {
      ctx!.save();
      ctx!.globalAlpha = fade;
      ctx!.translate(p.x, p.y);
      ctx!.rotate((p.rotation * Math.PI) / 180);
      ctx!.fillStyle = p.color;
      ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx!.restore();
    }

    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  // Sayfadan ayrılınca asılı kalmasın.
  window.addEventListener("beforeunload", cleanup, { once: true });
}
