import { CONTENT_STYLE } from "@/lib/ai/content-style";
import { sourceText, visualSceneGrounded, type TeacherLessonMode } from "@/lib/learning/teacher-lesson";
import { classifyAcademicDomain, DOMAIN_ARCHETYPE, type AcademicDomain, type DomainClassification, type VisualArchetype } from "@/lib/learning/visual-scenes/archetype";
import {
  REEL_BEATS,
  REEL_BEAT_LABEL,
  isReelBeat,
  parseReelVisual,
  readAcademicDomain,
  readVisualArchetype,
  reelKindForBeat,
  type ReelBeat,
  type ReelVisual,
} from "@/lib/learning/visual-scenes/schema";
import { archetypeSpecBlock, domainChoices, VISUAL_SCENE_COMMON_RULE } from "@/lib/learning/visual-scenes/prompt";
import { examPointsBlock } from "@/lib/learning/exam-points";

/**
 * Video ders (17 Ekim 2026, ürün sahibinin kararı: kıyas ürünündeki gibi).
 *
 * kıyas ürününde canlı bakıldı: "1 dakikalık video dersi izle — Hızlı ve görsel", stil seçimi
 * (Gerçekçi & Sinematik · Çizgi roman · Beyaz tahta · Neon infografik · Hızlı odak), konu seçimi; çıktı dikey,
 * 66 sn, 6-8 sahne, her sahnede ayrı bir çizim, 2-4 kelimelik akan alt yazı ve
 * anlatıcı sesi. Kararla bizde video oynatıcıda birleşir: sahne resimleri, sahne başına
 * ses ve alt yazı ayrı saklanır; yalnız Plus.
 *
 * Senaryo öğretmen motoru kalıbında: kaynak sayfalar → tek yazar istemi → kaynakla
 * eşleyen denetim → gerekirse bir düzeltme. Kod anlatıma bir şey eklemez.
 */

export type VideoStyle = "cinematic" | "comic" | "whiteboard" | "infographic" | "fast_focus";

/** Eski kayıtlar ve istemciler: realistic → cinematic, brainrot → infographic, meme → fast_focus. */
export const VIDEO_STYLE_ALIASES: Record<string, VideoStyle> = {
  realistic: "cinematic",
  brainrot: "infographic",
  meme: "fast_focus",
};

export const VIDEO_STYLE_IDS = ["cinematic", "comic", "whiteboard", "infographic", "fast_focus"] as const;

export const VIDEO_STYLES: { id: VideoStyle; emoji: string; label: string; blurb: string; image: string }[] = [
  {
    id: "cinematic",
    emoji: "🎬",
    label: "Gerçekçi & Sinematik",
    blurb: "Detaylı, yüksek kontrastlı gerçekçi sahneler",
    image: "photorealistic cinematic educational scene, high contrast, rich detail, dramatic lighting, film still",
  },
  {
    id: "comic",
    emoji: "💥",
    label: "Çizgi Roman / Anime",
    blurb: "Canlı renkler, kalın konturlar, dinamik çizgi roman estetiği",
    image: "comic book / anime illustration, bold ink outlines, vivid flat colors, dynamic composition",
  },
  {
    id: "whiteboard",
    emoji: "✏️",
    label: "Beyaz Tahta & El Çizimi",
    blurb: "Akademik el çizimi diyagramlar, temiz şematik anlatım",
    image: "academic hand-drawn whiteboard diagram, clean schematic, simple black marker line drawing on a plain white background, minimal shading",
  },
  {
    id: "infographic",
    emoji: "🧠",
    label: "Neon İnfografik & Şema",
    blurb: "Koyu zeminde parlayan kavram haritaları ve görsel şemalar",
    image: "neon infographic on a dark background, glowing concept map, luminous schematic, high-contrast educational diagram",
  },
  {
    id: "fast_focus",
    emoji: "⚡",
    label: "Hızlı Odak (Yüksek Enerji)",
    blurb: "Dikkat dağılmasını önleyen, çok canlı ve çarpıcı görsel metaforlar",
    image: "high-energy visual metaphor, punchy saturated colors, single striking focal subject, no clutter, bold educational poster",
  },
];

export function resolveVideoStyle(id: string | null | undefined): VideoStyle {
  if (id && (VIDEO_STYLE_IDS as readonly string[]).includes(id)) return id as VideoStyle;
  if (id && VIDEO_STYLE_ALIASES[id]) return VIDEO_STYLE_ALIASES[id]!;
  return "cinematic";
}

export function videoStyle(id: string | null | undefined): (typeof VIDEO_STYLES)[number] {
  const resolved = resolveVideoStyle(id);
  return VIDEO_STYLES.find((item) => item.id === resolved) ?? VIDEO_STYLES[0]!;
}

/** Kayıtlı stilin öğrenciye görünen adı. Çizimli özet resim stillerinden ayrıdır. */
export function videoStyleLabel(id: string | null | undefined): string {
  if (id === "sketch_reel") return "1 Dk Çizimli Video";
  return videoStyle(id).label;
}

/** Çizimli özet: stil adı ya da resimsiz şema sahnesi. Eski CHECK beyaz tahtaya düşerse de tanınır. */
export function isSketchStored(
  style: string | null | undefined,
  scenes: { imagePath?: string; diagram?: unknown; visualSchema?: unknown; reel?: unknown }[] | null | undefined,
): boolean {
  if (style === "sketch_reel") return true;
  return (scenes ?? []).some((scene) => !scene.imagePath && Boolean(scene.diagram ?? scene.visualSchema ?? scene.reel));
}

/**
 * Kayıt için stil. Göç `20261025120000` uygulanmadan yeni id'ler CHECK'e takılır;
 * o yüzden eski beş değer yazılır, okurken alias ile yeni etikete döner.
 */
export function persistVideoStyle(id: string | null | undefined): string {
  const resolved = resolveVideoStyle(id);
  const stored: Record<VideoStyle, string> = {
    cinematic: "realistic",
    comic: "comic",
    whiteboard: "whiteboard",
    infographic: "brainrot",
    fast_focus: "meme",
  };
  return stored[resolved];
}

/*
 * Süre: seslendirme Türkçeyi saniyede ~1,64 kelimeyle okuyor (17 Ekim canlı ölçüm: 178
 * kelime 108,5 sn — "1 dakikalık" denen video 1:48 çıktı). kıyas ürününün 66 sn'si ≈ 108 kelime.
 * Yazara hedef verilir; hedef kaçarsa düzeltme turu, yalnız sınırın dışı videoyu düşürür.
 */
export const VIDEO_MIN_SCENES = 6;
export const VIDEO_MAX_SCENES = 8;
/** Bir sahnenin anlatımı: 1-2 cümle, en çok 18 kelime (yaklaşık 11 sn). */
export const VIDEO_SCENE_MAX_WORDS = 18;
/** Bütün video: 85-115 kelime ≈ 52-70 sn. */
export const VIDEO_TOTAL_WORDS = { min: 85, max: 115 } as const;
/** Düzeltmeden sonra da aşılırsa video yazılmaz (≈ 43-85 sn, 5 sahne, sahnede 24 kelime). */
export const VIDEO_HARD_LIMITS = { minScenes: 5, sceneWords: 24, totalWords: { min: 70, max: 140 } } as const;

/**
 * keyFact: sahnenin sınavda sorulacak kilit bilgisi; oynatıcı resmin üstüne büyük yazar (18 Ekim 2026,
 * kıyas ürününün tahtasında eşikler büyük yazılıydı). Resim yazısız kalır: model yazıyı bozuyor.
 * Anlatımdaki **anahtar kelime** alt yazıda renkli görünür, seslendirmede okunmaz.
 */
export type VideoScene = { narration: string; visual: string; keyFact?: string };
export type VideoScript = { title: string; scenes: VideoScene[] };

export type VideoInput = {
  mode: TeacherLessonMode;
  topicLabel: string;
  prepTitle: string;
  pages: { page: number; text: string }[];
  style: VideoStyle;
  /** Öğretmen analizinin "Sınavda sorulur" maddeleri: kilit bilgiler bunlardan seçilir. */
  examPoints?: string[];
  /**
   * `sketch_reel`: sahne resmi yok. Parametrik SVG + KaTeX + paralel ses.
   * `image`: mevcut gpt-image sahne resmi.
   */
  renderMode?: "image" | "sketch_reel";
  /** Kapsam satırı: kardeş ünite sınır bloğu (19 Kasım 2026, Faz 1-A §1). Boşsa satır yok. */
  scopeLine?: string;
};

const SCHEMA =
  '{"title":"videonun kısa adı","scenes":[{"narration":"1-2 cümle anlatım; sahnenin anahtar kelimesi **iki yıldız** arasında","visual":"bu sahnenin resmini anlatan İngilizce tarif, yazısız","keyFact":"ekrana büyük yazılacak kilit bilgi, en çok 8 kelime"}]}';

const RULE_DOCUMENT =
  "KAYNAK KURALI (kesin): Anlatımdaki her olgu, sayı, tanım ve kural yalnız KAYNAK metninden gelir. Kaynakta yoksa " +
  "söyleme; genel kültürden ekleme. Kaynaktaki bozuk kelimeyi doğru Türkçeyle söyle.\n\n";

const RULE_TOPIC =
  "BİLGİ KURALI (belgesiz, kesin): Konuyu sınav müfredatındaki yerleşik, tartışmasız bilgiyle anlat. Emin olmadığın " +
  "sayı, eşik ya da kuralı söyleme.\n\n";

export function videoSystem(mode: TeacherLessonMode): string {
  return (
    "Sen Cortex Plus'ın usta öğretmenisin. Öğrencin sınava hazırlanıyor; konunun özünü yaklaşık 1 dakikalık dikey bir " +
    "video derste izleyecek. Ekranda her sahnede tek bir resim ve senin anlatımın akıyor.\n\n" +
    (mode === "topic" ? RULE_TOPIC : RULE_DOCUMENT) +
    "AKIŞ:\n" +
    `- ${VIDEO_MIN_SCENES}-${VIDEO_MAX_SCENES} sahne, toplam ${VIDEO_TOTAL_WORDS.min}-${VIDEO_TOTAL_WORDS.max} kelime.\n` +
    `- Her sahnenin anlatımı 1-2 kısa cümle, en çok ${VIDEO_SCENE_MAX_WORDS} kelime; konuşur gibi, 'sen' diye.\n` +
    "- İlk sahne merak uyandıran bir kanca (bir soru ya da karşılaştırma); son sahne sınavda akılda kalacak tek cümlelik " +
    "özet. Aradaki sahneler konunun en önemli 3-5 noktasını sırayla anlatır: ne olduğu, neyle karıştırıldığı, sınavda " +
    "nasıl tanınacağı. Bir olguyu söylediğinde nedenini de söyle.\n" +
    "- Boş cümle yok ('bu videoda … öğreneceğiz', 'önemli bir konudur'). Kaynağa atıf yok ('metne göre', 'belgede').\n" +
    "- visual: o sahnenin resmini İngilizce tarif et — sahnedeki nesne, beden bölgesi, olay ya da karşılaştırma; " +
    "resimde YAZI, harf, sayı, etiket olmaz. Gerçek kişi, marka ya da logo olmaz. Tek cümle, somut.\n" +
    "- keyFact: sahnenin sınavda sorulacak KİLİT bilgisi (eşik, yaş, süre, ayırıcı ipucu, sınıflama) — ekranda " +
    "resmin üstüne büyük yazılır, öğrenci onu akılda tutar. En çok 8 kelime, kaynaktaki sayı ve terimle, anlatımla " +
    "aynı bilgi; cümle değil kısa ifade ('Safralı kusma → obstrüksiyon', '18 ayda kelime yoksa: alarm'). Kancada ve " +
    "bilgisi olmayan sahnede boş bırak.\n" +
    "- narration'da sahnenin tek anahtar kelimesini **iki yıldız** arasına al: alt yazıda renkli görünür, sesli okunmaz.\n\n" +
    `${CONTENT_STYLE}\n\nYalnızca bu şemada JSON döndür:\n${SCHEMA}`
  );
}

export function videoUserPrompt(input: VideoInput): string {
  return [
    `SINAV: ${input.prepTitle}`,
    `KONU: ${input.topicLabel}`,
    input.mode === "topic" ? "" : (input.scopeLine ?? ""),
    examPointsBlock(input.examPoints, "video"),
    input.mode === "topic" ? "KAYNAK: (yok — belgesiz; konunun yerleşik bilgisiyle anlat)" : `KAYNAK:\n${sourceText(input.pages)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const VIDEO_VERIFY_SYSTEM =
  "Sen titiz bir video ders denetçisisin. Senaryoyu yazıldığı KAYNAK ile (belgesizse konunun yerleşik bilgisiyle) " +
  "karşılaştırıyorsun. Şunları bul:\n" +
  "A) Kaynakta dayanağı olmayan ya da kaynakla çelişen olgu, sayı, tanım, kural (belgesizde: yanlış ya da tartışmalı bilgi).\n" +
  "B) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
  "C) Bilgi taşımayan boş cümle ya da kaynağa atıf ('metne göre').\n" +
  "D) visual tarifinde yazı/etiket isteği, gerçek kişi ya da marka.\n" +
  "E) keyFact kaynakta olmayan ya da yanlış bir sayı/bilgi taşıyor, anlatımla çelişiyor ya da 8 kelimeden uzun.\n" +
  "A-B ve E'deki yanlış bilgi 'high'; C-D ve E'deki uzunluk 'low'.\n" +
  'JSON döndür: {"issues":[{"scene":0,"severity":"high","problem":"…","fix":"…"}]} — scene 0\'dan başlar. Sorun yoksa boş dizi.';

export function videoVerifyUserPrompt(script: VideoScript, input: VideoInput): string {
  return `${videoUserPrompt(input)}\n\nSENARYO (JSON):\n${JSON.stringify(script)}`;
}

export const VIDEO_FIX_PREFIX =
  "Sen aynı video dersi yazan öğretmensin. Denetçinin bulduğu sorunları düzelt; sorunsuz sahnelere dokunma. " +
  "Kurallar ve şema aynı:\n\n";

export function videoFixUserPrompt(script: VideoScript, problems: string[], input: VideoInput): string {
  return [videoUserPrompt(input), `SENARYO (JSON):\n${JSON.stringify(script)}`, `SORUNLAR:\n${problems.join("\n")}`].join("\n\n");
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Model çıktısını senaryo tipine oturtur; metne bir şey eklemez, yalnız kırpar. */
export function parseVideoScript(raw: unknown, fallbackTitle: string): VideoScript | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(row.scenes) ? row.scenes : [];
  const scenes = list.flatMap((item) => {
    const scene = (item ?? {}) as Record<string, unknown>;
    const narration = typeof scene.narration === "string" ? scene.narration.replace(/\s+/g, " ").trim() : "";
    const visual = typeof scene.visual === "string" ? scene.visual.replace(/\s+/g, " ").trim() : "";
    const fact = typeof scene.keyFact === "string" ? scene.keyFact.replace(/\s+/g, " ").trim() : "";
    // Kilit bilgi kısa kalır: uzun cümle ekrana sığmaz, akılda da kalmaz.
    const keyFact = fact && words(fact) <= 12 ? fact.slice(0, 90) : undefined;
    return narration && visual ? [{ narration, visual, ...(keyFact ? { keyFact } : {}) }] : [];
  });
  if (!scenes.length) return null;
  const title = typeof row.title === "string" && row.title.trim() ? row.title.trim().slice(0, 120) : fallbackTitle;
  return { title, scenes: scenes.slice(0, VIDEO_MAX_SCENES) };
}

export type VideoStructureIssue = { severity: "high" | "low"; problem: string };

/**
 * Yapı denetimi (saf). Sorunu düzeltmez; hepsi düzeltme turuna gider. "high" yalnız
 * sert sınırın dışı: düzeltmeden sonra da kalırsa video yazılmaz.
 */
export function videoStructureIssues(script: VideoScript): VideoStructureIssue[] {
  const issues: VideoStructureIssue[] = [];
  const count = script.scenes.length;
  if (count < VIDEO_MIN_SCENES) {
    issues.push({
      severity: count < VIDEO_HARD_LIMITS.minScenes ? "high" : "low",
      problem: `Sahne sayısı ${count}; ${VIDEO_MIN_SCENES}-${VIDEO_MAX_SCENES} olmalı.`,
    });
  }
  const total = script.scenes.reduce((sum, scene) => sum + words(scene.narration), 0);
  if (total < VIDEO_TOTAL_WORDS.min || total > VIDEO_TOTAL_WORDS.max) {
    const hard = VIDEO_HARD_LIMITS.totalWords;
    issues.push({
      severity: total < hard.min || total > hard.max ? "high" : "low",
      problem: `Toplam ${total} kelime; ${VIDEO_TOTAL_WORDS.min}-${VIDEO_TOTAL_WORDS.max} olmalı (yaklaşık 1 dakika).`,
    });
  }
  script.scenes.forEach((scene, index) => {
    const sceneWords = words(scene.narration);
    if (sceneWords > VIDEO_SCENE_MAX_WORDS) {
      issues.push({
        severity: sceneWords > VIDEO_HARD_LIMITS.sceneWords ? "high" : "low",
        problem: `scenes[${index}]: anlatım ${sceneWords} kelime; en çok ${VIDEO_SCENE_MAX_WORDS}.`,
      });
    }
    if (/metne göre|belgede|kaynakta|bu videoda/i.test(scene.narration)) {
      issues.push({ severity: "low", problem: `scenes[${index}]: kaynağa atıf ya da boş giriş cümlesi; çıkar.` });
    }
  });
  return issues;
}

/** Resim istemi: sahne tarifi + güvenli stil yönergesi; yazısız, dikey. */
export function videoImagePrompt(scene: VideoScene, style: string): string {
  const look = videoStyle(style).image;
  return `${scene.visual}. Style: ${look}. Vertical 9:16 composition, single clear focal subject, no text, no letters, no numbers, no labels, no watermark, no logos, no real celebrities.`;
}

/**
 * Alt yazı parçaları: anlatım 2-4 kelimelik parçalara bölünür (kıyas ürününde ekranda akan
 * kalın yazı); süre sahnenin sesine kelime sayısıyla oranlanır.
 */
/** Seslendirilen metin: **anahtar kelime** işareti okunmaz. */
export function speechText(narration: string): string {
  return narration.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

/** Anlatımın kelimeleri; **…** içindekiler anahtar (alt yazıda renkli). */
function captionWords(narration: string): { word: string; key: boolean }[] {
  const out: { word: string; key: boolean }[] = [];
  let key = false;
  for (const raw of narration.split(/\s+/).filter(Boolean)) {
    const opens = raw.startsWith("**");
    const closes = raw.replace(/[.,;:!?]+$/, "").endsWith("**") && (raw.length > 4 || !opens);
    if (opens) key = true;
    const word = raw.replace(/\*\*/g, "");
    if (word) out.push({ word, key });
    if (closes) key = false;
  }
  return out;
}

export function captionChunks(
  narration: string,
  durationMs: number,
): { text: string; words: { word: string; key: boolean }[]; startMs: number; endMs: number }[] {
  const tokens = captionWords(narration);
  if (!tokens.length) return [];
  const chunks: { word: string; key: boolean }[][] = [];
  let current: { word: string; key: boolean }[] = [];
  for (const token of tokens) {
    current.push(token);
    const ends = /[.,;:!?]$/.test(token.word);
    if (current.length >= 4 || (ends && current.length >= 2)) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) {
    if (current.length === 1 && chunks.length) chunks[chunks.length - 1]!.push(current[0]!);
    else chunks.push(current);
  }
  const perWord = durationMs / tokens.length;
  let cursor = 0;
  return chunks.map((chunk) => {
    const startMs = Math.round(cursor * perWord);
    cursor += chunk.length;
    return { text: chunk.map((item) => item.word).join(" "), words: chunk, startMs, endMs: Math.round(cursor * perWord) };
  });
}

/**
 * 1 dakikalık çizimli video (27 Ekim 2026). Sahne resmi üretilmez.
 * Her sahne: başlık, vurucu formül, parametrik SVG şema, ses.
 * 4–5 sahne, toplam yaklaşık 60 saniye.
 */
export const SKETCH_REEL_ID = "sketch_reel" as const;
export { SKETCH_REEL_LABEL } from "@/lib/learning/video-lesson-labels";
/** Faz 1-B (19 Kasım 2026): tam 5 sahne, sabit sırayla (kanca → ana çizim → karşılaştırma → tuzak → hafıza çivisi). */
export const SKETCH_MIN_SCENES = 5;
export const SKETCH_MAX_SCENES = 5;
export const SKETCH_SCENE_MAX_WORDS = 26;
export const SKETCH_TOTAL_WORDS = { min: 72, max: 110 } as const;
/**
 * Yazarın hedefi denetim aralığının üst yarısı (30 Ekim 2026, canlı tur): "1 Dk" video 0:43 çıktı; yazar alt sınıra
 * (72 kelime ≈ 44 sn, seslendirme saniyede ~1,64 kelime) yazıyordu. Denetim aralığı aynı kalır: alt sınırı yükseltmek
 * her kısa senaryoda bir düzeltme turu (iki çağrı) açardı.
 */
export const SKETCH_TARGET_WORDS = { min: 92, max: 110 } as const;
export const SKETCH_HARD_LIMITS = { minScenes: 5, sceneWords: 34, totalWords: { min: 55, max: 140 } } as const;

export const SKETCH_DIAGRAM_KINDS = ["balance_scale", "number_line", "function_curve", "timeline", "process_network"] as const;
export type SketchDiagramKind = (typeof SKETCH_DIAGRAM_KINDS)[number];

export type SketchDiagramItem = {
  label: string;
  value?: string | number;
  detail?: string;
  highlight?: boolean;
};

export type SketchDiagram = {
  diagramKind: SketchDiagramKind;
  title: string;
  caption?: string;
  items: SketchDiagramItem[];
};

/**
 * Sahne: yeni kayıtlarda `beat` + `reel` (branşa özel SVG sahnesi, Faz 1-B); eski kayıtlarda `diagram`
 * (parametrik kart). İkisinden biri mutlaka vardır.
 */
export type SketchScene = {
  narration: string;
  sceneTitle: string;
  formula?: string;
  keyFact?: string;
  voice: "ada" | "kerem";
  diagram?: SketchDiagram;
  beat?: ReelBeat;
  reel?: ReelVisual;
};

export type SketchScript = {
  title: string;
  scenes: SketchScene[];
  academicDomain?: AcademicDomain;
  visualArchetype?: VisualArchetype;
};

const SKETCH_SCHEMA =
  '{"title":"videonun kısa adı","academicDomain":"…","visualArchetype":"…","scenes":[' +
  '{"beat":"hook","sceneTitle":"…","narration":"…","keyFact":"…","voice":"ada","visual":{"kind":"hook","question":"sınavda en çok çıkan kilit soru","visualTitle":"merak uyandıran görsel başlık"}},' +
  '{"beat":"main_diagram","sceneTitle":"…","narration":"…","voice":"kerem","visual":{"kind":"archetype","scene":{…arketip JSON…}}},' +
  '{"beat":"comparison","sceneTitle":"…","narration":"…","formula":"isteğe bağlı kısa kural","voice":"ada","visual":{"kind":"comparison","title":"…","mode":"concept|variable","left":"…","right":"…","rows":[{"label":"…","left":"…","right":"…","winner":"left|right|none"}]}},' +
  '{"beat":"exam_trap","sceneTitle":"…","narration":"…","voice":"kerem","visual":{"kind":"exam_trap","title":"…","wrong":"öğrencinin en sık yaptığı hata","right":"doğrusu","tell":"ayırt ettiren ipucu"}},' +
  '{"beat":"memory_nail","sceneTitle":"…","narration":"…","voice":"ada","visual":{"kind":"memory_nail","mnemonic":"akılda kalıcı kodlama","keys":[{"letter":"…","meaning":"…"}],"summary":"sınav sabahı tek cümlelik özet"}}]}';

/** Video için disiplin sınıflandırması (model çağrısız). */
export function videoDomain(input: Pick<VideoInput, "prepTitle" | "topicLabel" | "pages" | "mode">): DomainClassification {
  return classifyAcademicDomain({ prepTitle: input.prepTitle, topicLabel: input.topicLabel, pages: input.pages, mode: input.mode });
}

/** Bu güvenin altında istem altı arketipi gösterir (ders tamamlamasıyla aynı eşik). */
const SKETCH_CONFIDENT = 0.25;

export function sketchSystem(mode: TeacherLessonMode, domain?: DomainClassification): string {
  const classification = domain ?? { academicDomain: "general" as const, visualArchetype: DOMAIN_ARCHETYPE.general, confidence: 0, sourceTable: null };
  return (
    "Sen Cortex Plus'ın usta öğretmeni ve bilgi tasarımcısısın. Öğrenci konuyu yaklaşık 1 dakikalık çizimli bir video " +
    "özette izleyecek. Ekranda sahne resmi yok: her sahnede branşa özel, animasyonla çizilen bir SVG sahnesi belirir; " +
    "sen anlatırsın. Alt yazı ekranın altındaki şeritte akar, çizimin üstüne binmez.\n\n" +
    (mode === "topic" ? RULE_TOPIC : RULE_DOCUMENT) +
    "AKIŞ (tam 5 sahne, bu sırayla; beat alanı aynen):\n" +
    `1) hook — ${REEL_BEAT_LABEL.hook}: konunun sınavda en çok çıkan kilit sorusu ve merak uyandıran görsel başlık.\n` +
    `2) main_diagram — ${REEL_BEAT_LABEL.main_diagram}: disiplinin arketip çizimi (aşağıdaki ARKETİP JSON'u, kind "archetype").\n` +
    `3) comparison — ${REEL_BEAT_LABEL.comparison}: iki kavramın ya da değişken etkisinin renk kodlu matrisi (2-4 satır).\n` +
    `4) exam_trap — "${REEL_BEAT_LABEL.exam_trap}": öğrencilerin en sık yaptığı hata (✗) ve doğrusu (✓).\n` +
    `5) memory_nail — ${REEL_BEAT_LABEL.memory_nail}: akılda kalıcı görsel kodlama (harf karoları) ve tek cümlelik sınav sabahı özeti.\n` +
    `- Toplam ${SKETCH_TARGET_WORDS.min}-${SKETCH_TARGET_WORDS.max} kelime (yaklaşık 60 saniye). Her sahnenin anlatımı 1-2 kısa cümle, en çok ${SKETCH_SCENE_MAX_WORDS} kelime; konuşur gibi, 'sen' diye.\n` +
    "- Anlatım o sahnenin çizimini anlatır (çizimde ne görülüyorsa onu söyle). Boş cümle yok. Kaynağa atıf yok ('metne göre', 'belgede', 'bu videoda').\n" +
    "- sceneTitle: en çok 6 kelime. keyFact: sınavda sorulacak kilit ifade, en çok 8 kelime; yoksa boş bırak.\n" +
    "- formula isteğe bağlı: varsa KaTeX ya da oklu düz kural (→, ↑, ↓); dolar işareti yok, uydurma sayı yok.\n" +
    "- voice: sahneleri Ada (ada) ve Kerem (kerem) arasında dağıt; art arda aynı ses en çok iki sahne.\n" +
    `- ${VISUAL_SCENE_COMMON_RULE}\n` +
    "- Resim tarifi yazma. Yalnız sahne verisi.\n\n" +
    `${archetypeSpecBlock(classification.visualArchetype, classification.confidence >= SKETCH_CONFIDENT)}\n\n` +
    `academicDomain şunlardan biri: ${domainChoices()}. visualArchetype: ana çizimin arketipi.\n\n` +
    `${CONTENT_STYLE}\n\nYalnızca bu şemada JSON döndür:\n${SKETCH_SCHEMA}`
  );
}

export function sketchVerifySystem(mode: TeacherLessonMode): string {
  return (
    "Sen titiz bir çizimli video denetçisisin. Senaryoyu yazıldığı KAYNAK ile (belgesizse konunun yerleşik bilgisiyle) karşılaştır.\n" +
    "A) Kaynakta dayanağı olmayan ya da kaynakla çelişen olgu, sayı, tanım, kural.\n" +
    "B) Bozuk Türkçe.\n" +
    "C) Boş cümle ya da kaynağa atıf.\n" +
    "D) formula ya da sahne verisi (visual) kaynağın dışında sayı, tarih, kesir veya kural taşıyor.\n" +
    "E) Sahne sırası hook, main_diagram, comparison, exam_trap, memory_nail değil ya da bir sahnenin çizim verisi eksik.\n" +
    "A, B ve D'deki yanlış bilgi 'high'; C ve E 'low'.\n" +
    (mode === "topic" ? "Belgesiz konuda emin olunmayan güncel eşiği high say.\n" : "") +
    'JSON döndür: {"issues":[{"scene":0,"severity":"high","problem":"…","fix":"…"}]}. Sorun yoksa boş dizi.'
  );
}

export function sketchFixUserPrompt(script: SketchScript, problems: string[], input: VideoInput): string {
  return [videoUserPrompt(input), `SENARYO (JSON):\n${JSON.stringify(script)}`, `SORUNLAR:\n${problems.join("\n")}`].join("\n\n");
}

const SKETCH_KIND_SET = new Set<string>(SKETCH_DIAGRAM_KINDS);

function sketchItem(raw: unknown): SketchDiagramItem | null {
  if (typeof raw === "string" && raw.trim()) return { label: raw.trim().slice(0, 80) };
  const row = (raw ?? {}) as Record<string, unknown>;
  const labelRaw = typeof row.label === "string" ? row.label : typeof row.name === "string" ? row.name : "";
  const label = labelRaw.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!label) return null;
  const rawValue = row.value ?? row.amount;
  let value: string | number | undefined;
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) value = rawValue;
  else if (typeof rawValue === "string" && rawValue.trim()) value = rawValue.trim().slice(0, 40);
  const detailRaw = typeof row.detail === "string" ? row.detail : "";
  const detail = detailRaw.replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    label,
    ...(value !== undefined ? { value } : {}),
    ...(detail ? { detail } : {}),
    ...(row.highlight === true ? { highlight: true } : {}),
  };
}

function sketchDiagram(raw: unknown, fallbackTitle: string): SketchDiagram | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  const kind = typeof row.diagramKind === "string" ? row.diagramKind : typeof row.kind === "string" ? row.kind : "";
  if (!SKETCH_KIND_SET.has(kind)) return null;
  const items = (Array.isArray(row.items) ? row.items : []).flatMap((item) => {
    const next = sketchItem(item);
    return next ? [next] : [];
  });
  if (items.length < 2) return null;
  const titleRaw = typeof row.title === "string" ? row.title.replace(/\s+/g, " ").trim() : "";
  const captionRaw = typeof row.caption === "string" ? row.caption.replace(/\s+/g, " ").trim() : "";
  return {
    diagramKind: kind as SketchDiagramKind,
    title: (titleRaw || fallbackTitle).slice(0, 120),
    ...(captionRaw ? { caption: captionRaw.slice(0, 200) } : {}),
    items: items.slice(0, 8),
  };
}

/** Kayıttaki şema verisini oynatıcıya verir. Bozuk kayıt tahtayı açmaz. */
export function readSketchDiagram(raw: unknown): SketchDiagram | null {
  const diagram = sketchDiagram(raw, "Şema");
  return diagram && diagram.items.length >= 2 ? diagram : null;
}

/**
 * Model çıktısını çizimli senaryoya oturtur. Resim tarifi aramaz. Yeni biçim: her sahnede `beat` + `visual`
 * (Faz 1-B); beat yoksa sıradan atanır. Eski biçim: `diagram`. Ne çizimi ne şeması olan sahne düşer.
 */
export function parseSketchScript(raw: unknown, fallbackTitle: string, domain?: Pick<DomainClassification, "visualArchetype">): SketchScript | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(row.scenes) ? row.scenes : [];
  const archetype = readVisualArchetype(row.visualArchetype) ?? domain?.visualArchetype;
  const reelFormat = list.some((item) => {
    const scene = (item ?? {}) as Record<string, unknown>;
    return isReelBeat(scene.beat) || Boolean(scene.visual && typeof scene.visual === "object");
  });
  const scenes = list.flatMap((item, index) => {
    const scene = (item ?? {}) as Record<string, unknown>;
    const narration = typeof scene.narration === "string" ? scene.narration.replace(/\s+/g, " ").trim() : "";
    const titleRaw = typeof scene.sceneTitle === "string" ? scene.sceneTitle : typeof scene.title === "string" ? scene.title : "";
    const sceneTitle = titleRaw.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!narration || !sceneTitle) return [];
    const beat: ReelBeat | undefined = isReelBeat(scene.beat) ? scene.beat : reelFormat ? REEL_BEATS[index] : undefined;
    const reel = beat ? (parseReelVisual(scene.visual ?? scene.reel, beat, archetype) ?? undefined) : undefined;
    // Sahne kendi beat'inin türünü taşımalı (ör. tuzak sahnesine kanca verisi gelmez).
    const reelOk = reel && beat && reel.kind === reelKindForBeat(beat) ? reel : undefined;
    const diagram = sketchDiagram(scene.diagram ?? scene.visualSchema, sceneTitle) ?? undefined;
    if (!reelOk && !diagram) return [];
    const fact = typeof scene.keyFact === "string" ? scene.keyFact.replace(/\s+/g, " ").trim() : "";
    const keyFact = fact && words(fact) <= 12 ? fact.slice(0, 90) : undefined;
    const formulaRaw = typeof scene.formula === "string" ? scene.formula.replace(/^\$+|\$+$/g, "").trim() : "";
    const formula = formulaRaw ? formulaRaw.slice(0, 240) : undefined;
    const voice = scene.voice === "kerem" || scene.speaker === "kerem" ? "kerem" : scene.voice === "ada" || scene.speaker === "ada" ? "ada" : index % 2 === 0 ? "ada" : "kerem";
    return [
      {
        narration,
        sceneTitle,
        voice,
        ...(diagram ? { diagram } : {}),
        ...(beat && reelOk ? { beat, reel: reelOk } : {}),
        ...(formula ? { formula } : {}),
        ...(keyFact ? { keyFact } : {}),
      } satisfies SketchScene,
    ];
  });
  if (!scenes.length) return null;
  const title = typeof row.title === "string" && row.title.trim() ? row.title.trim().slice(0, 120) : fallbackTitle;
  const mainScene = scenes.find((scene) => scene.reel?.kind === "archetype")?.reel;
  const visualArchetype = mainScene?.kind === "archetype" ? mainScene.scene.archetype : archetype;
  const domainRaw = readAcademicDomain(row.academicDomain);
  const academicDomain = domainRaw && visualArchetype && DOMAIN_ARCHETYPE[domainRaw] === visualArchetype ? domainRaw : undefined;
  return {
    title,
    scenes: scenes.slice(0, SKETCH_MAX_SCENES),
    ...(academicDomain ? { academicDomain } : {}),
    ...(visualArchetype ? { visualArchetype } : {}),
  };
}

/** Senaryo yeni (5 sahneli çizim) biçiminde mi. */
export function isReelScript(script: SketchScript): boolean {
  return script.scenes.some((scene) => Boolean(scene.reel));
}

export function sketchStructureIssues(script: SketchScript, sourceCorpus?: string): VideoStructureIssue[] {
  const issues: VideoStructureIssue[] = [];
  const count = script.scenes.length;
  if (count < SKETCH_MIN_SCENES) {
    issues.push({
      severity: count < SKETCH_HARD_LIMITS.minScenes ? "high" : "low",
      problem: `Sahne sayısı ${count}; tam ${SKETCH_MIN_SCENES} olmalı (hook, main_diagram, comparison, exam_trap, memory_nail).`,
    });
  }
  const total = script.scenes.reduce((sum, scene) => sum + words(scene.narration), 0);
  if (total < SKETCH_TOTAL_WORDS.min || total > SKETCH_TOTAL_WORDS.max) {
    const hard = SKETCH_HARD_LIMITS.totalWords;
    issues.push({
      severity: total < hard.min || total > hard.max ? "high" : "low",
      problem: `Toplam ${total} kelime; ${SKETCH_TOTAL_WORDS.min}-${SKETCH_TOTAL_WORDS.max} olmalı (yaklaşık 1 dakika).`,
    });
  }
  REEL_BEATS.forEach((beat, index) => {
    const scene = script.scenes[index];
    if (scene && (scene.beat !== beat || !scene.reel)) {
      issues.push({
        severity: "high",
        problem: `scenes[${index}]: ${index + 1}. sahne "${beat}" (${REEL_BEAT_LABEL[beat]}) olmalı ve visual çizim verisini taşımalı.`,
      });
    }
  });
  script.scenes.forEach((scene, index) => {
    const sceneWords = words(scene.narration);
    if (sceneWords > SKETCH_SCENE_MAX_WORDS) {
      issues.push({
        severity: sceneWords > SKETCH_HARD_LIMITS.sceneWords ? "high" : "low",
        problem: `scenes[${index}]: anlatım ${sceneWords} kelime; en çok ${SKETCH_SCENE_MAX_WORDS}.`,
      });
    }
    if (/metne göre|belgede|kaynakta|bu videoda/i.test(scene.narration)) {
      issues.push({ severity: "low", problem: `scenes[${index}]: kaynağa atıf ya da boş giriş cümlesi; çıkar.` });
    }
    // Ana çizimin sayıları kaynakta geçmeli (belgeli videoda; kod denetimi, model çağrısız).
    if (sourceCorpus && scene.reel?.kind === "archetype" && !visualSceneGrounded(scene.reel.scene, sourceCorpus)) {
      issues.push({ severity: "high", problem: `scenes[${index}]: ana çizimde kaynakta geçmeyen sayı ya da terim var; yalnız kaynaktakini yaz.` });
    }
  });
  return issues;
}

/** Formülü tahtada adım adım açmak için böler. */
export function sketchFormulaSteps(formula: string): string[] {
  const clean = formula.replace(/^\$+|\$+$/g, "").trim();
  if (!clean) return [];
  const parts = clean
    .split(/\s*(?:\\\\|;|→)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [clean];
}
