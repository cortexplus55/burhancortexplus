import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
  Podcast 18 Eylül 2026'da Plus'a alındı ve tarayıcı sesi yedeği kalktı.

  Düzeltilen şey bir kapı eksikliğinden fazlasıydı: `/studio/podcast` HİÇ
  gerçek ses çalmıyordu. Senaryoyu üretip tarayıcının robot sesine okutuyordu
  — ücretsiz kullanıcıya da, 599 TL ödeyen Plus abonesine de. İki sesli
  stüdyo anlatımı yalnızca sınav hazırlığı oynatıcısında vardı. Yani ürünün
  en cazip özelliğinin kendi sayfası o özelliği kullanmıyordu ve onu hiç
  duymamış öğrenci, duyduğu robot sesini ürün sanıyordu.

  Bu dosya dört şeyi tutuyor:

  1. Ücretsiz kullanıcı podcast ÜRETEMEZ (kapı sunucuda, istemcide değil).
  2. Stüdyo GERÇEK sesi çalar — robot ses yolu geri gelmesin.
  3. Aboneliği olmayana "kredin yetmiyor" denmez; kredi alsa da açılmaz.
  4. `/ornek` misafire açık kalır ve hiçbir AI çağrısı yapmaz.
*/

const read = (file: string) => readFileSync(file, "utf8");

describe("üretim ucu Plus'a özel", () => {
  const source = read("src/app/api/learning/podcast/generate/route.ts");

  it("premium değilse reddediyor", () => {
    expect(source).toContain('return errorResponse(402, "premium_required")');
  });

  /* Kapı üretimden sonra olsaydı ücretsiz kullanıcı krediyi de modeli de
     harcar, sonra 402 yerdi. */
  it("kapı üretimden önce", () => {
    expect(source.indexOf('errorResponse(402, "premium_required")')).toBeLessThan(
      source.indexOf("generateJson({"),
    );
  });

  it("premium bilgisini iki kez sormuyor", () => {
    expect(source.match(/isPremiumUser\(/g)).toHaveLength(1);
  });
});

describe("robot ses yolu kalktı", () => {
  const podcastFiles = [
    "src/components/learning/studio/podcast-studio.tsx",
    "src/components/parity/exam-podcast-player.tsx",
  ];

  /* Podcast ya iki sesli gerçek anlatımıyla vardır ya yoktur. */
  it.each(podcastFiles)("%s tarayıcı sesini çağırmıyor", (file) => {
    expect(read(file)).not.toMatch(/\bspeakTurkish\b/);
  });

  /* Sözlü pratik ve sohbette sesli okuma podcast DEĞİL; oralarda tarayıcı
     sesi doğru araç ve bilerek duruyor. Bu test, temizliğin oraya taşmadığını
     doğruluyor. */
  it.each([
    "src/components/parity/exam-voice-tutor.tsx",
    "src/components/chat/message-actions.tsx",
    "src/components/learning/studio/oral-studio.tsx",
  ])("%s tarayıcı sesini korudu", (file) => {
    expect(read(file)).toMatch(/\bspeakTurkish\b/);
  });

  it("oynatıcıda ses yokken oynat düğmesi kapalı", () => {
    const source = read("src/components/parity/exam-podcast-player.tsx");
    expect(source).toContain('disabled={status !== "ready"}');
  });

  /* Mesajların hiçbiri artık cihaz sesi vaat etmemeli — vaat edilen ses
     çalmıyor olurdu. */
  it("oynatıcı cihaz sesi vaat etmiyor", () => {
    const source = read("src/components/parity/exam-podcast-player.tsx");
    expect(source).not.toMatch(/cihazının\s+sesiyle/);
  });
});

describe("stüdyo gerçek sesi çalıyor", () => {
  const source = read("src/components/learning/studio/podcast-studio.tsx");

  it("ses ucunu çağırıyor", () => {
    expect(source).toContain('"/api/learning/podcast/audio"');
  });

  /* Senaryo bedeli zaten harcandı; ses gelmese de öğrenci ödediğini görmeli.
     Kalkan tek şey robot ses. */
  it("ses gelmezse senaryo ekranda kalıyor", () => {
    expect(source).toContain("setAudioNote(");
    expect(source).toMatch(/Senaryoyu aşağıdan okuyabilirsin/);
  });

  it("aboneliği olmayanı sunucuya hiç göndermiyor", () => {
    expect(source).toMatch(/if \(!isPremium\) \{\s*\n\s*openPaywall\("premium"\);/);
  });
});

describe("iki ayrı 402 ayrılıyor", () => {
  it("postStudio sebebi taşıyor", () => {
    const source = read("src/components/learning/studio/studio-shared.tsx");
    expect(source).toContain("return { paywall: true, code: payload.code }");
  });

  /* "Kredin yetmiyor" demek, aboneliği olmayan öğrenciye kredi alırsa
     açılacağını söyler — açılmaz. */
  it("stüdyo aboneliği olmayana kredi satmıyor", () => {
    const source = read("src/components/learning/studio/podcast-studio.tsx");
    expect(source).toContain('paywallReason === "premium"');
    expect(source).toContain("Podcast Plus aboneliğine özel.");
  });
});

describe("araç listesi", () => {
  const source = read("src/components/parity/start-hub.tsx");

  /* Gizlemek öğrenciye ürünün ne yapabildiğini hiç göstermezdi. */
  it("podcast listeden çıkmıyor, kilitli görünüyor", () => {
    expect(source).toContain('href: "/studio/podcast"');
    expect(source).toContain('locked ? "Plus\'a özel" : tool.hint');
  });
});

describe("misafir örneği duruyor", () => {
  const page = read("src/app/ornek/page.tsx");

  /* Hazır bir bölüm, gerçek sesiyle, girişsiz — ve bize maliyetsiz. Ücretsiz
     tarafın ürünü DUYABİLDİĞİ tek yer burası; kapı bunun üstüne kuruldu. */
  it("giriş istemiyor ve AI çağrısı yapmıyor", () => {
    expect(page).not.toMatch(/redirect\(|requireUser|withUser/);
    expect(page).not.toMatch(/generateJson|openai|OpenAI/);
  });

  it("podcast adımı yerinde", () => {
    expect(page).toContain("podcastTitle={lesson.podcastTitle}");
    expect(page).toContain("chapters={lesson.chapters}");
  });

  it("stüdyodaki kilit örneğe yönlendiriyor", () => {
    const studio = read("src/components/learning/studio/podcast-studio.tsx");
    expect(studio).toContain('href="/ornek"');
  });
});
