# Denetim kapsamı (#667 sonrası, 15 Kasım 2026)

Hangi yolda hangi denetim gerçekten çalışıyor. Kaynak: kod (dosya adları tabloda). "Model denetimi", yazardan sonra ayrı
bir model çağrısıdır. "Kod", modelsiz kesin kontroldür.

**Sembolik çözücü yoktur.** Sayısal kontroller şunlardır:
- hesap zinciri sağlaması (`step-arithmetic.ts`),
- Türkçe aritmetik düzeltmesi (`turkish-math-fix.ts`),
- sohbette ve soru çözücüde bağımsız ikinci çözüm (bir model çağrısı, cevaba bakmaz).

## Sohbet (`/api/ai/chat`)

| Yol | Model denetimi | Kod | Not |
|---|---|---|---|
| **Yalnızca belgem** (katı) | Eğitim denetimi (luna, düşük düşünme) **+** belge-kaynak denetimi (luna, düşük; her iddia alıntıyla) | Atıf numarası gerçek kaynağı mı gösteriyor, sahipsiz `[n]` silinir | Taslak ekrana akmaz; denetimden geçmeyen cevap gösterilmez |
| **Belgem + genel bilgi** | Eğitim denetimi (tek, düşük) | `localDocumentCheck`: belge bölümündeki sayılar kaynakta mı, atıf gerçek mi, genel bilgi belgeye mal edilmiş mi; etiket ve atıf temizliği | Belge-kaynak model denetimi **yalnız** kaynakta olmayan sayı görülünce. **%5 örnek**: şüphesiz geçen cevabın %5'i yanıttan sonra model denetiminden geçer, sonuç yalnız günlükte (`chat_audit_sample`, `agree`) |
| **Genel sohbet, sistemin bağladığı not** (`linkedEvidence`) | Belgem + genel bilgi ile aynı | Aynı | Aynı %5 örnek |
| **Genel sohbet, not yok** | Yok (24 Ekim 2026 kararı: tek çağrı) | Türkçe aritmetik düzeltmesi, etiket temizliği | Sayısal/şıklı soruda bağımsız ikinci çözüm (model, yazımla paralel) |
| **Görselli soru** | Eğitim denetimi (gpt-4.1, görselle) | Aynı | Fotoğraflı soru çoğunlukla soru çözücüye gider |
| **Hazırlık sohbeti** (`/deneme-sinavlari/{id}/sohbet`) | Öğretmen motorunun denetimi (belgeye dayanan cevapta, `runTeacherTutor` `verify`) | Sayısal uzlaştırma (`settleQuantReply`, `auditQuantitative`); gerekirse küçük sayı kontrolü (`quantSelfCheck`) | "Genel sohbet" modunda ve belge dışı soruda denetim yok |

## İçerik üretimi

| İçerik | Model denetimi | Kod | Not |
|---|---|---|---|
| Ders (`teacher-lesson-run.ts`) | Hafif doğrulayıcı (`lesson-sanity.ts`, kavram başına; şık türü, anahtar, tekrar eden kutu). Tam denetçi turu 26 Ekim'den beri yok ("tek geçiş") | Anahtar hizalama (`settleCheckKeys`), soru bütünlüğü (`question-integrity.ts`), kapsam açığı, ekran içi tekrar süzgeci | Kapsam açığı ve eksik şema kartı için tek küçük tamamlama çağrısı |
| Konu testi ve öbür testler (`teacher-quiz-run.ts`) | Hafif doğrulayıcı (`quiz-sanity.ts`; soruyu çözer, kesinse anahtarı düzeltir). Tam denetçi istemi (`quizVerifySystem`) tanımlı ama **çağrılmıyor** | Soru bütünlüğü, set kuralları (`quizSetIssues`), kökte cevap, eşik ikizleri, aynı cevap sınırı | |
| Podcast | Denetçi (A-F yüksek önem) + düzeltme turu | Satır kurtarma, akış ölçüleri | |
| Soru çözücü | İki bağımsız çözüm + gpt-4.1 onayı (arkada) | Şık eşleme, hesap zinciri | "Doğrulandı" yalnız açık onayda |
| Hazır müfredat havuzu | Kapı (`gate.ts`) + kör çözüm | Koşullu önerme cebiri vb. | Model çağrısı üretim anında, öğrenci beklemez |

## Ürün metinleri
- Ana sayfa ve SSS'deki "çift kontrol" sözü yalnız ders ve test için. Bu tabloyla uyumlu (yazar + hafif doğrulayıcı + kod);
  değişiklik gerekmedi.
- Plus sayfasındaki "Notunda olmayanı uydurmaz" cümlesi sohbetin bütün modlarını kapsıyor gibi okunuyordu. Yerine:
  "«Yalnızca belgem» modunda notunda olmayanı uydurmaz; öbür modlarda genel bilgiyi ayrı etiketler. Cevaplayamadığı soruda
  hakkından düşmez." Söz katı modda kodla tutuluyor (`no-source-guarantee.test.ts`).
