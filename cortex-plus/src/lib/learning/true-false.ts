import { z } from "zod";

export const trueFalseItemSchema = z.object({
  text: z.string().trim().min(8).refine(text => !/[?？]/u.test(text), "Soru değil, doğruluğu değerlendirilebilen bir önerme yaz."),
  correct: z.boolean(),
  explanation: z.string().trim().min(12),
  correctedStatement: z.string().trim().min(8).optional(),
  /** Stage 5/6 hook — misconception label for later review. */
  misconceptionTag: z.string().trim().min(2).max(80).optional(),
}).superRefine((item, ctx) => {
  if (!item.correct && (!item.correctedStatement || item.correctedStatement === item.text)) {
    ctx.addIssue({ code: "custom", path: ["correctedStatement"], message: "Yanlış önermenin doğru halini yaz." });
  }
});

export const trueFalseItemsSchema = z.array(trueFalseItemSchema).min(4).max(10).superRefine((items, ctx) => {
  const normalized = items.map(item => item.text.toLocaleLowerCase("tr-TR").replace(/\s+/g, " "));
  if (new Set(normalized).size !== items.length) {
    ctx.addIssue({ code: "custom", message: "Aynı önermeyi tekrarlama." });
  }
  if (items.every(item => item.correct) || items.every(item => !item.correct)) {
    ctx.addIssue({ code: "custom", message: "Hem doğru hem yanlış önermeler bulunmalı." });
  }
});

export const TRUE_FALSE_FORMAT = 'Her text tek, açık ve doğruluğu değerlendirilebilir bir ÖNERME olmalı; "nedir?" gibi açık uçlu soru veya soru işareti içermemeli. Her yanlış önerme için correctedStatement alanında doğru halini yaz. Açıklama doğru halin nedenini anlatsın. Önermeler tekrarlanmasın; hem doğru hem yanlış önermeler bulunsun. Sayısal, tarihsel veya dilsel bağlamı eksik bırakarak belirsizlik yaratma. Belirsiz genellemelerden (her zaman/asla/genelde) kaçın. İsteğe bağlı misconceptionTag ile yanılgı etiketle.';
