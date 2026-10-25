import { auditQuantitative, repairQuantitative } from "@/lib/learning/tutor-quant";
import { stepArithmeticIssues } from "@/lib/solve/step-arithmetic";
import type { TutorStyle } from "@/lib/learning/tutor-style";

/**
 * Sohbet öğretmeninde çözüm sağlaması (25 Ekim 2026).
 * Fotoğraf ya da şıklı/sayısal bir problem, doğrudan çöz veya adım adım modda
 * üretildiyse cevap öğrenciye yazılmadan önce aritmetik kuraldan geçer.
 * Fotoğraf ve şıklı soruda ayrıca bağımsız bir çözümle karşılaştırılır
 * (`/soru-coz` çift çözümünün sohbet karşılığı; ikinci çağrı yalnız bu kapıda).
 */

const SOLVE_STYLES = new Set<TutorStyle>(["direct_solve", "step_by_step"]);

export type IndependentSolve = {
  letter: string | null;
  value: string | null;
  text: string;
};

export function chatSolveNeedsGuard(input: {
  tutorStyle: TutorStyle;
  hasImage: boolean;
  message: string;
}): boolean {
  if (!SOLVE_STYLES.has(input.tutorStyle)) return false;
  return input.hasImage || asksSolvedProblem(input.message);
}

/** Şıkkın harfi en az iki kez geçiyor ya da hesap isteniyor. */
export function asksSolvedProblem(message: string): boolean {
  const text = message.trim();
  if (text.length < 8) return false;
  const options = text.match(/(?:^|[\s\n])[A-E][).:]/g) ?? [];
  if (options.length >= 2) return true;
  const asks = /(hesapla|çöz(?!üm)|çözün|kaçtır|kaç olur|değeri nedir|hangi şık|doğru şık)/i.test(text);
  return asks && /\d/.test(text);
}

export function prepareChatSolution(draft: string): string {
  const audit = auditQuantitative(draft);
  const repaired = audit.ok ? draft : repairQuantitative(draft, audit);
  const lines = repaired.split("\n").filter((line) => stepArithmeticIssues(line).length === 0);
  const cleaned = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned.length >= 20 ? cleaned : repaired.trim();
}

export function claimedSolution(text: string): { letter: string | null; value: string | null } {
  const letterMatch = text.match(
    /(?:doğru\s+şık(?:kı)?|doğru\s+seçenek|doğru\s+cevap|cevap(?:tır|ı)?|şık)\s*[:\-]?\s*\**\(?([A-E])\)?/i,
  );
  const valueMatch = text.match(/(?:sonuç|sonuc|cevap)\s*[:\-=]?\s*(-?\d+(?:[.,]\d+)?)/i);
  return {
    letter: letterMatch?.[1]?.toUpperCase() ?? null,
    value: valueMatch?.[1]?.replace(",", ".") ?? null,
  };
}

export function independentSolvePrompt(message: string): { system: string; user: string } {
  return {
    system:
      "Aynı sınav sorusunu bağımsız çöz. Sana başka bir çözüm gösterilmiyor. " +
      "İşlemi kendin kur; şıklıysa doğru harfi, sayısal ise sonucu yaz. " +
      "Karşılaştırmadan, 'ilk çözüm'den söz etme. " +
      'Yalnız JSON: {"letter":"A"|"B"|"C"|"D"|"E"|null,"value":"12"|null,"text":"öğrenciye Türkçe çözüm, en çok 900 karakter"}',
    user: `SORU:\n${message.slice(0, 4000)}`,
  };
}

export function parseIndependentSolve(raw: string): IndependentSolve | null {
  try {
    const parsed = JSON.parse(raw) as { letter?: unknown; value?: unknown; text?: unknown };
    const letter =
      typeof parsed.letter === "string" && /^[A-E]$/i.test(parsed.letter.trim())
        ? parsed.letter.trim().toUpperCase()
        : null;
    const valueRaw =
      typeof parsed.value === "number"
        ? String(parsed.value)
        : typeof parsed.value === "string"
          ? parsed.value.trim()
          : "";
    const value = /\d/.test(valueRaw) ? valueRaw.replace(",", ".").replace(/[^\d.+-]/g, "") : null;
    const text = typeof parsed.text === "string" ? parsed.text.trim().slice(0, 2000) : "";
    if (!letter && !value && text.length < 20) return null;
    return { letter, value, text };
  } catch {
    return null;
  }
}

function closeNumbers(left: string, right: string): boolean {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return left === right;
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 0.005, Math.abs(b) * 0.005);
}

function textAgrees(text: string, check: IndependentSolve): boolean {
  const claim = claimedSolution(text);
  if (check.letter && claim.letter && claim.letter !== check.letter) return false;
  if (check.value && claim.value && !closeNumbers(claim.value, check.value)) return false;
  return true;
}

/**
 * Taslak ile bağımsız çözüm çelişirse öğrenciye bağımsız çözüm gider.
 * Fotoğrafta taslak bir harf/sonuç söylemiyorsa da bağımsız metin yazılır.
 */
export function mergeIndependentSolve(
  draft: string,
  check: IndependentSolve,
  options?: { preferWhenUnclaimed?: boolean },
): string {
  const cleaned = prepareChatSolution(draft);
  const claim = claimedSolution(cleaned);
  const letterClash = Boolean(claim.letter && check.letter && claim.letter !== check.letter);
  const valueClash = Boolean(claim.value && check.value && !closeNumbers(claim.value, check.value));
  const checkedText = check.text ? prepareChatSolution(check.text) : "";
  const agrees = textAgrees(checkedText, check);
  if ((letterClash || valueClash) && checkedText.length >= 40 && agrees) return checkedText;
  if (letterClash || valueClash) {
    const line = check.letter ? `Doğru şık ${check.letter}.` : check.value ? `Sonuç: ${check.value}.` : "";
    const body = agrees ? checkedText : "";
    return [line, body].filter(Boolean).join("\n\n").trim() || cleaned;
  }
  if (
    options?.preferWhenUnclaimed &&
    !claim.letter &&
    !claim.value &&
    (check.letter || check.value) &&
    checkedText.length >= 40 &&
    agrees
  ) {
    return checkedText;
  }
  return cleaned;
}
