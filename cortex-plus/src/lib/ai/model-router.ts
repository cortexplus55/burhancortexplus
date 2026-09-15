import { env, type ActionCode } from "@/lib/env";

export type ModelRouterInput = {
  actionCode: ActionCode;
  isPremium: boolean;
  hasImage: boolean;
  documentPages?: number;
  difficulty?: "easy" | "medium" | "hard";
  userSelectedAdvanced?: boolean;
};

const ADVANCED_ACTIONS: ActionCode[] = [
  "AI_CHAT_ADVANCED",
  "IMAGE_SOLUTION",
  "QUIZ_GENERATE",
  "PRACTICE_EXAM_GENERATE",
  "PRACTICE_EXAM_GRADE",
];

export function selectModel(input: ModelRouterInput): {
  model: string;
  actionCode: ActionCode;
} {
  if (input.hasImage) {
    return { model: env.OPENAI_ADVANCED_MODEL, actionCode: "IMAGE_SOLUTION" };
  }

  if (
    input.userSelectedAdvanced &&
    input.isPremium &&
    input.actionCode.startsWith("AI_CHAT")
  ) {
    return {
      model: env.OPENAI_ADVANCED_MODEL,
      actionCode: "AI_CHAT_ADVANCED",
    };
  }

  /*
    Gelişmiş model ödeme gerekçesi; istemekle gelmiyor.

    Burada `input.actionCode === "AI_CHAT_ADVANCED"` de yazıyordu ve bir
    üstteki premium kontrolünü işlevsiz bırakıyordu: ücretsiz bir hesap sohbet
    ucuna `actionCode: "AI_CHAT_ADVANCED"` göndererek gpt-4o alıyordu. Kademe
    modelinin sattığı şey "daha akıllı model"di ve isteyene bedavaydı.

    Aşağıdaki `standardMap` düşürmesi tam bu durum için yazılmış ama o satır
    yüzünden hiç çalışmıyordu. Artık çalışıyor: premium olmayan gelişmiş
    sohbet isteği standart modele düşüyor ve kredisi de 3 yerine 1 yazılıyor —
    aldığı hizmetin fiyatı.
  */
  if (ADVANCED_ACTIONS.includes(input.actionCode) && input.isPremium) {
    return { model: env.OPENAI_ADVANCED_MODEL, actionCode: input.actionCode };
  }

  /*
    Zorluk ve belge boyutu yükseltmeleri de artık abonelik istiyor.

    İkisi de ücretsiz hesabın gpt-4o'ya çıkabildiği yollardı ve ikisi de
    isteğin içinden geliyordu. `difficulty` alanını istemci yazıyor
    (`/api/learning/exam/generate` zod şeması "hard" kabul ediyor): öğrenci
    kendi işine "ileri" diyerek 4 kredi karşılığında on iki kat pahalı üretim
    alıyordu. `documentPages` daha sessiz ama daha pahalıydı — 40 sayfalık bir
    PDF'i gpt-4o ile işlemek, 2 kredilik DOCUMENT_PAGE_PROCESS'in karşıladığı
    tutarın kat kat üstünde.

    Kural artık tek cümle: ücretsiz hesap standart modelde kalır. Tek istisna
    görsel, çünkü yapılandırdığımız tek gören model gelişmiş olan ve o iş
    zaten en yüksek kredili eylem (5).
  */
  /*
    Sistemin kendi kararıyla güçlü modele çıkması — kredi DEĞİŞMEDEN.

    `difficulty` alanı bu dosyada zaten duruyordu ama gövdede hiç okunmuyordu:
    bir güvenlik düzeltmesinde çıkarılmıştı, çünkü alanı İSTEMCİ yazıyordu.
    `/api/learning/exam/generate` şeması "hard" kabul ediyor, yani öğrenci
    kendi işine "ileri" deyip on iki kat pahalı üretimi 4 krediye alıyordu.

    Geri gelmesini iki şey güvenli kılıyor:

    1. Yalnızca sohbet eylemlerinde çalışıyor (`AI_CHAT*`). Sohbette zorluğu
       istemci göndermiyor: rota mesaj metninden kendisi ölçüyor
       (`assessQuestionDifficulty`). İstemcinin dokunabildiği uçlar bu daldan
       etkilenmiyor.
    2. Abonelik istiyor. Ücretsiz hesap standart modelde kalıyor; zor soruda
       cevap kalite kapısından geçemezse öğrenciye bunu dürüstçe söylüyoruz.

    Kredi bilerek yükselmiyor: `actionCode` standart kalıyor, yani öğrenci bir
    soru sorup bir soruluk kredi ödüyor. Modeli seçen biz olduğumuza göre
    maliyeti de bizim. Aksi hâlde öğrenci aynı görünen iki soruda farklı kredi
    harcadığını görür ve bunun anlaşılır bir açıklaması olmaz.
  */
  if (
    input.isPremium &&
    input.difficulty === "hard" &&
    input.actionCode.startsWith("AI_CHAT")
  ) {
    return { model: env.OPENAI_ADVANCED_MODEL, actionCode: "AI_CHAT_STANDARD" };
  }

  if (input.isPremium && (input.documentPages ?? 0) > 10) {
    return {
      model: env.OPENAI_ADVANCED_MODEL,
      actionCode: input.actionCode,
    };
  }

  const standardMap: Partial<Record<ActionCode, ActionCode>> = {
    AI_CHAT_ADVANCED: "AI_CHAT_STANDARD",
  };

  return {
    model: env.OPENAI_STANDARD_MODEL,
    actionCode: standardMap[input.actionCode] ?? input.actionCode,
  };
}
