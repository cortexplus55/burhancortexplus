import { extractFollowUps } from "@/lib/teacher/follow-ups";
import { splitActionMarkers, type ChatAction } from "@/lib/ai/chat-material-link";
import { stripOrphanCitations } from "@/lib/ai/chat-answer-settle";
import { plainTutorText } from "@/lib/learning/tutor-reply";

/*
  Öğretmen v3 ekranı (teacher.v2 ana sohbeti, 21 Kasım 2026, ürün sahibi: "teknik damgalarla boğulmuş, karşımda canlı bir
  öğretmen var hissini öldürüyor"). Yanıtın GÖRÜNÜMÜ için saf temizlik: kayıtlı içerik ve sunucunun denetimi değişmez,
  yalnız ekranda çizilmeyecek damgalar ayrılır.

  - "Belgeden" başlıkları, metin içi `[1]` atıfları, "Kaynaklar:" bloğu, `[[kaynak:…]]` / `[[gecmis:…]]` çipleri,
    sunucunun `[[chip:…]]` ve `[[kapsam:…]]` önerileri ekrandan kalkar.
  - "Genel bilgiden" / "Materyal dışı" başlığı başlık olarak çizilmez; o bölümün başında tek soluk satır kalır
    ("Notunda geçmiyor · genel bilgi"). Güven kuralı: notta olmayan bilgi işaretli kalır.
  - Takip soruları (`[[sorular:…]]`) ve stüdyo düğmeleri (`[[arac:…]]`) ayrı döner.

  Kod cümle yazmaz; yalnız işaret ve etiket satırı siler. Ders, konu ya da kişi adı yok.
*/

export const GENERAL_NOTE_TEXT = "Notunda geçmiyor · genel bilgi";
/** Genel bilgi bölümünün başı (yalnız bu modülün içinde; ekrana yazılmaz). */
export const V3_GENERAL_MARK = "[[genel]]";
/** Belge bölümünün başı: genel bilgi bölümü burada biter. */
export const V3_DOC_MARK = "[[belge]]";

/** "Kaynaklar:" satırı ve altındaki madde listesi (sunucu yanıtın sonuna ekler). */
const SOURCES_BLOCK = /(^|\n)[ \t]*(?:\*\*)?Kaynaklar:(?:\*\*)?[ \t]*(?:\n[ \t]*[-*•][^\n]*)*/g;
const DROP_MARKERS = /\[\[(?:kaynak|gecmis|chip|kapsam):[^\]]*\]\]/g;
const OUTSIDE_BADGE = /\[\[rozet:\s*(?:Materyal dışı|Outside the material)\s*\]\]/gi;
const OTHER_BADGE = /\[\[rozet:[^\]]*\]\]/g;

const IS_DOC_LABEL = /^\s*(?:#{1,6}\s*)?(?:\*\*)?Belgeden\b\s*(?::|(?:\*\*)?\s*$)/i;
const DOC_PREFIX = /^\s*(?:#{1,6}\s*)?(?:\*\*)?Belgeden\s*:?\s*(?:\*\*)?\s*:?\s*/i;
const IS_GENERAL_LABEL =
  /^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:Genel bilgiden|Materyal dışı|Outside the material)(?:\s*[—–-]\s*kaynak gösterilmez)?\s*(?::|(?:\*\*)?\s*$)/i;
const GENERAL_PREFIX =
  /^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:Genel bilgiden|Materyal dışı|Outside the material)(?:\s*[—–-]\s*kaynak gösterilmez)?\s*:?\s*(?:\*\*)?\s*:?\s*/i;
/** "Bu, belgede yok." / "Bu, yüklediğin kaynakta yok — genel bilgiyle anlatıyorum:" satırı da genel bölümü açar. */
const ABSENCE_LINE =
  /^\s*(?:Bu,\s*(?:yüklediğin kaynakta yok\s*[—–-]\s*genel bilgiyle anlatıyorum\s*:?|belgede yok\.?)|This is not in the material\.?)\s*$/i;

export type V3Reply = {
  /** Ekranda çizilecek gövde (bölüm işaretleri `V3_GENERAL_MARK` / `V3_DOC_MARK` satırları). */
  body: string;
  /** Yanıtın altındaki takip soruları (en çok 3; yoksa boş). */
  questions: string[];
  /** Sunucunun eklediği stüdyo düğmeleri. */
  actions: ChatAction[];
};

function labelLines(text: string): string {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (ABSENCE_LINE.test(line)) {
      out.push("", V3_GENERAL_MARK, "");
      continue;
    }
    if (IS_GENERAL_LABEL.test(line)) {
      const rest = line.replace(GENERAL_PREFIX, "");
      out.push("", V3_GENERAL_MARK, "");
      if (rest.trim()) out.push(rest);
      continue;
    }
    if (IS_DOC_LABEL.test(line)) {
      const rest = line.replace(DOC_PREFIX, "");
      out.push("", V3_DOC_MARK, "");
      if (rest.trim()) out.push(rest);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Art arda gelen ya da arkasında içerik olmayan bölüm işaretlerini sadeleştirir. */
function tidyMarks(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let lastMark: string | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === V3_GENERAL_MARK || trimmed === V3_DOC_MARK) {
      // Önceki işaretle bu işaret arasında içerik yoksa öncekinin yerine geçer.
      if (lastMark !== null) {
        const at = kept.lastIndexOf(lastMark);
        if (at >= 0 && kept.slice(at + 1).every((item) => !item.trim())) kept.splice(at);
      }
      kept.push(trimmed);
      lastMark = trimmed;
      continue;
    }
    kept.push(line);
  }
  // Baştaki belge işareti ve sondaki boş işaretler anlamsız.
  while (kept.length && (!kept[kept.length - 1]!.trim() || kept[kept.length - 1]!.trim() === V3_GENERAL_MARK || kept[kept.length - 1]!.trim() === V3_DOC_MARK)) {
    kept.pop();
  }
  const firstContent = kept.findIndex((item) => item.trim());
  if (firstContent >= 0 && kept[firstContent]!.trim() === V3_DOC_MARK) kept.splice(firstContent, 1);
  return kept.join("\n");
}

/** Yanıtı v3 ekranına hazırlar (saf). */
export function cleanV3Reply(content: string): V3Reply {
  const { body: withoutQuestions, questions } = extractFollowUps(String(content ?? "").replace(/\r\n/g, "\n"));
  const { body: withoutActions, actions } = splitActionMarkers(withoutQuestions);
  let body = withoutActions
    .replace(SOURCES_BLOCK, "$1")
    .replace(DROP_MARKERS, "")
    .replace(OUTSIDE_BADGE, `\n\n${V3_GENERAL_MARK}\n\n`)
    .replace(OTHER_BADGE, "");
  body = labelLines(body);
  // Kaynak kartı çizilmediği için metindeki çıplak atıfların karşılığı yok: hepsi gider (kod bloğuna dokunulmaz).
  body = stripOrphanCitations(body);
  body = tidyMarks(body)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { body, questions, actions };
}

export type V3Segment = { general: boolean; text: string };

/** Gövdeyi bölümlere ayırır: genel bilgi bölümü soluk satırla başlar. */
export function v3Segments(body: string): V3Segment[] {
  const segments: V3Segment[] = [{ general: false, text: "" }];
  const lines: string[] = [];
  const flush = () => {
    segments[segments.length - 1]!.text = lines.join("\n").trim();
    lines.length = 0;
  };
  for (const line of String(body ?? "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === V3_GENERAL_MARK || trimmed === V3_DOC_MARK) {
      flush();
      segments.push({ general: trimmed === V3_GENERAL_MARK, text: "" });
      continue;
    }
    lines.push(line);
  }
  flush();
  return segments.filter((segment) => segment.text);
}

/**
 * Akış ya da yumuşak açılış sürerken görünen kısım: sonda yarım kalmış işaret ("[[kay", "[[benzetme:yarım") ve
 * kapanmamış adım bloğu geçici gizlenir. Tamamlanınca bir kerede görünür; öğrenci ham köşeli parantez görmez.
 */
export function hidePartialMarkers(text: string): string {
  let out = String(text ?? "");
  const steps = out.lastIndexOf("[[adimlar]]");
  if (steps >= 0 && out.indexOf("[[/adimlar]]", steps) < 0) out = out.slice(0, steps);
  const open = out.lastIndexOf("[[");
  if (open >= 0 && out.indexOf("]]", open) < 0) out = out.slice(0, open);
  else if (out.endsWith("[")) out = out.slice(0, -1);
  return out.trimEnd();
}

/** Kopyala ve sesli dinle için düz metin: işaretsiz, atıfsız, bölüm işaretsiz. */
export function v3PlainText(content: string): string {
  const { body } = cleanV3Reply(content);
  const unmarked = body
    .split("\n")
    .filter((line) => line.trim() !== V3_GENERAL_MARK && line.trim() !== V3_DOC_MARK)
    .join("\n");
  return plainTutorText(unmarked)
    .replace(/==([^=\n]+)==/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
