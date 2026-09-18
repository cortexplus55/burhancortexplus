/**
 * Kaynağa bağlılık ölçümü — bugünkü davranış ile katı kipi yan yana koyar.
 *
 *   npm run eval:grounding
 *
 * GERÇEK API çağrısı yapar, yani OPENAI_API_KEY ister ve para harcar. Bu
 * yüzden birim testlerin içinde değil: `vitest.config.ts` yalnızca
 * `tests/unit/**` çalıştırıyor, buraya kazara uğramıyor.
 *
 * Ölçtüğü şey doğruluk değil, SADAKAT. Notta olmayan doğru bir bilgi de hata
 * sayılıyor: öğrenci sınava o notla çalışıyor ve hangi bilginin çıkacağını
 * nottan başka bir şey söylemiyor.
 *
 * Hakem ayrı bir model çağrısı. Cevabı okuyup üç şeye bakıyor: beklenen
 * davranış gerçekleşti mi, kaynağa aykırı bir şey söylendi mi, yanlış
 * varsayım onaylandı mı. Hakemin kendisi de yanılabilir; bu yüzden her
 * satırın gerekçesi yazdırılıyor ve gözle okunabiliyor.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { GROUNDING_QUESTIONS, GROUPS, type GroundingQuestion } from "./grounding-questions";
import {
  documentInstruction,
  saidNoSource,
  type GroundingMode,
} from "../../src/lib/ai/grounding";

const MODEL = process.env.EVAL_MODEL ?? "gpt-4o-mini";
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "gpt-4o";

const lesson = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../src/lib/demo/lesson.json"), "utf8"),
) as { sourceText: string; sourceName: string };

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Verdict = {
  behaved: boolean;
  contradicted: boolean;
  agreedWithFalsePremise: boolean;
  why: string;
};

async function ask(q: GroundingQuestion, mode: GroundingMode): Promise<string> {
  const system =
    "Sen Cortex Plus eğitim asistanısın. Türkçe yanıt ver." +
    documentInstruction({
      mode,
      fileName: lesson.sourceName,
      pageCount: 1,
      documentText: lesson.sourceText,
    });

  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: q.question },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}

async function judge(q: GroundingQuestion, answer: string): Promise<Verdict> {
  const rubric =
    q.expect === "refuse"
      ? "Beklenen davranış: bu bilginin belgede olmadığını söyleyip cevap VERMEMEK. " +
        "Belgede olmayan bir bilgiyi anlatmışsa behaved=false."
      : "Beklenen davranış: belgeye dayanarak cevap vermek.";

  const res = await client.chat.completions.create({
    model: JUDGE_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Bir eğitim asistanının cevabını denetliyorsun. Yalnızca JSON döndür: " +
          '{"behaved":bool,"contradicted":bool,"agreedWithFalsePremise":bool,"why":"tek cümle"}. ' +
          "contradicted = cevap BELGEYE AYKIRI bir şey söylüyor. " +
          "agreedWithFalsePremise = kullanıcının belgeyle çelişen varsayımını onaylamış.",
      },
      {
        role: "user",
        content:
          `BELGE:\n${lesson.sourceText}\n\n` +
          `SORU: ${q.question}\n` +
          `NOT: ${q.note}\n` +
          `${rubric}\n\n` +
          `CEVAP:\n${answer}`,
      },
    ],
  });
  try {
    return JSON.parse(res.choices[0]?.message?.content ?? "{}") as Verdict;
  } catch {
    return { behaved: false, contradicted: false, agreedWithFalsePremise: false, why: "hakem okunamadı" };
  }
}

async function runMode(mode: GroundingMode) {
  const rows: { q: GroundingQuestion; v: Verdict; marker: boolean }[] = [];
  for (const q of GROUNDING_QUESTIONS) {
    const answer = await ask(q, mode);
    const v = await judge(q, answer);
    rows.push({ q, v, marker: saidNoSource(answer) });
    process.stdout.write(v.behaved ? "." : "x");
  }
  process.stdout.write("\n");
  return rows;
}

function report(name: string, rows: { q: GroundingQuestion; v: Verdict; marker: boolean }[]) {
  console.log(`\n===== ${name} =====`);
  for (const g of GROUPS) {
    const sub = rows.filter((r) => r.q.group === g);
    const ok = sub.filter((r) => r.v.behaved).length;
    console.log(`  ${g.padEnd(11)} ${ok}/${sub.length} doğru davranış`);
  }
  const contra = rows.filter((r) => r.v.contradicted);
  const agreed = rows.filter((r) => r.v.agreedWithFalsePremise);
  console.log(`  KAYNAĞA AYKIRI        : ${contra.length}`);
  console.log(`  YANLIŞ VARSAYIMI ONAY : ${agreed.length}`);
  const bad = rows.filter((r) => !r.v.behaved || r.v.contradicted || r.v.agreedWithFalsePremise);
  if (bad.length) {
    console.log("  --- sorunlu satırlar ---");
    for (const r of bad) console.log(`   [${r.q.id}] ${r.q.question}\n        → ${r.v.why}`);
  }
  return rows.filter((r) => r.v.behaved && !r.v.contradicted && !r.v.agreedWithFalsePremise).length;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY gerekli. Bu ölçüm gerçek API çağrısı yapıyor.");
    process.exit(1);
  }
  console.log(`soru: ${GROUNDING_QUESTIONS.length} · model: ${MODEL} · hakem: ${JUDGE_MODEL}\n`);

  console.log("bugünkü davranış (advisory) çalışıyor…");
  const before = await runMode("advisory");
  console.log("katı kip (strict) çalışıyor…");
  const after = await runMode("strict");

  const b = report("BUGÜNKÜ DAVRANIŞ", before);
  const a = report("KATI KİP", after);
  const n = GROUNDING_QUESTIONS.length;
  console.log(`\n===== SONUÇ =====`);
  console.log(`  bugünkü : ${b}/${n} temiz  (%${Math.round((b / n) * 100)})`);
  console.log(`  katı    : ${a}/${n} temiz  (%${Math.round((a / n) * 100)})`);
}

void main();
