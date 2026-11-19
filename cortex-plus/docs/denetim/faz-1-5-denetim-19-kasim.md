# Faz 1-A, 1-B, 2, 4, 5 denetimi ve Faz 3 (19–20 Kasım 2026)

Dal: `fix/faz-3-ve-denetim-kapanisi` (origin/main bf37945e'den). Kaynak: #690–#706 kodu, salt okuma ile beş ayrı inceleme ve
canlı veritabanında salt okunur sorgular. Bu belge düzeltilenleri ve bilerek açık bırakılanları listeler.

**Önemli not:** görev metnindeki "yereldeki ~69 dosyalık Faz 3 değişikliği" bu makinede yok. Ana kopya ve 21 çalışma
kopyasının hiçbirinde taahhüt edilmemiş değişiklik bulunmadı (yalnız eski bir yönetim dalında 1 dosya). Faz 3 bu dalda
denetim raporundan sıfırdan yazıldı (aşağıda).

## Düzeltilenler

| Faz | Bulgu | Düzeltme | Yer |
|---|---|---|---|
| 2 | **Cevap anahtarı okuma açığı** (canlıda doğrulandı): satır güvenliği "satırım benim" diyor, sütun sınırı yok; öğrenci açık anahtarla süren sınavının `correct_answer`, `explanation`, `payload` sütunlarını doğrudan okuyabiliyordu (practice_exam_questions, quiz_questions, exam_prep_node_attempts, exam_prep_intro_attempts, exam_prep_lessons, exam_prep_podcasts, prep_duels) | Anahtar sütunları tek kaynakta (`answer-key-columns.ts`); öğrenci oturumuyla bu sütunları okuyan 7 yer sunucu anahtarı + sahiplik süzgecine geçti; süren sınav sorusu `stripAnswerKeyForActiveExam`'den geçer. Göç `20261119150000` (YAZILDI, UYGULANMADI) tarayıcı okumasını sütun düzeyinde kapatır; geri alma ayrı dosyada | `src/lib/security/answer-key-columns.ts`, hazırlık/ilerleme/sonuç/inceleme/ders/sohbet sayfaları, `quiz/grade` |
| 2 | Yol iskeleti eşzamanlı yazımda ikiye katlanabiliyor, hatalar yutuluyordu | Hazırlık başına kilit (`shareInFlight`) + `exam_path_write_failed` kaydı | `exam-prep-insert.ts` |
| 2 | Kredi ayırma / sahiplenme hatası sessiz "error" | `credit_reserve_failed`, `credit_claim_failed` (+ ayırma kimliği) | `credits/service.ts` |
| 2 | Hazırlık öğretmen yolu öğrenci metni süzgecinden geçmiyordu | `studentOutputText` | `api/ai/chat/route.ts` |
| 2 | Yol testi sorusu bildirilince defter eski anahtarla kalıyordu | `source_ref` ile güncelle / öğrenildi say; hata kayda geçer | `question-report/apply.ts` |
| 4 | Çizimli videonun girişi her açılışta 22 kredi kesiyordu | Aynı konunun çizimli videosu varsa kredisiz açılır (davranış testi) | `video-reuse.ts`, `video/route.ts` |
| 4 | Ücretsiz tekrar her açılışta boş `active` satır | Cevapsız tekrar kaydı yeniden açılır; sözleşme testinde insert yok | `node/replay.ts` |
| 4 | Fiyatlar | Doğrulandı: Sınav Haftası 2.500, Plus 4.350, Sigma 14.500; ek paket 900/2.350/5.400; sohbet 1, D/Y 3, sözlü 3, farklı anlat 4, kart 8, test 14, podcast 16, deneme 17, ders 22, sketch_reel 22 (kod ve göç) | `price-table.ts`, göç `20261119120000` |
| 5 | "Cortex Plus Plus" | "Cortex Plus — Plus Paketi" (WhatsApp ve veli sayfası tek yardımcıdan) | `parent-link-plan.ts` |
| 5 | Veli onay kutuları | Kutu 1 "okudum, onaylıyorum"; kutu 2 "Dijital hizmetin ödeme anında hemen başlamasını onaylıyorum ve bu nedenle cayma hakkının bulunmadığını biliyorum." Denetim kaydı gösterilen kutunun metnini tutar | `parent-pay-form.tsx`, `parent-pay-copy.ts`, `checkout.ts` |
| 5 | "Yazılı deneme her zaman açık" (ücretsizde kapalı), "Plus'ta sınırsız / sınırsız hazırlık" | Tek cümle `WRITTEN_EXAM_AVAILABILITY`; "birden çok hazırlık, hepsi aynı aylık haktan"; eski ifadeler bekçi listesinde | `/sinav-hazirligi`, Sınavlar sayfası, ana sayfa, Plus ayı, yardım |
| 1-A | Tek doğru şık / cevap sızıntısı sorunlu soru kurtarmayla geri konup son kapıda atılıyor, test düşüyordu | `UNSALVAGEABLE_PROBLEM`'e iki önek | `teacher-quiz.ts` |
| 1-B | Matematik: "azalan üstel" eksenin altında −eˣ çiziliyordu | e^(−x) (y eksenine göre ayna) | `MathGraphScene.tsx` |
| 1-B | Tıp sahnesi her disiplinde "TUS / KLİNİK SPOTU" | Klinikte "KLİNİK SPOTU", öbürlerinde "SPOT BİLGİ" | `MedicalPathwayScene.tsx` |
| 3 | `/pay?returnTo=https://…` açık yönlendirme | `safeNextPath`; yardımcı kodlanmış hileleri de reddeder | `subscription-cards.tsx`, `safe-next-path.ts` |
| 3 | `/kullanim-sartlari` 404 | Aynı sayfa, 200, kanonik `/kullanim-kosullari` | `src/app/kullanim-sartlari` |
| 3 | `/mufredat` "null. sınıf" (ALES, DGS, YDS, TUS, DUS: 64 program) | `programGroupLabel` | `program-group.ts` |
| — | Kaynak yorumlarında rakip adı | Kaldırıldı | 4 dosya |
| — | Windows CRLF'de düşen iki bekçi test | Satır sonu bağımsız okuma | `helpers/node-sources.ts` |

## Bilerek açık bırakılanlar (karar ya da ayrı iş)

**Burhan onayı gerekenler**
- Göç `20261119150000_cevap_anahtari_okuma_kapat.sql`: **önce bu dalın kodu yayına, sonra göç**. Kod göçten önce de sonra da
  çalışır; göç koddan önce uygulanırsa eski kod sonuç/inceleme/ders sayfalarını boş açar.
- `ui.v2.pay` izlemesi: 1 başarısız ödeme kaydı veli bağlantısından (`/pay` değil); bayrak kapatılmadı
  (`pay-bayragi-secenekler.md` → "24 saat izleme").

**Kalan denetim bulguları (bu dalda yapılmadı)**
- Faz 1-A: kaynak düzeltmesinin kod bekçisi (`correctionRepeatIssue`) canlı ders yolunda çalışmıyor (yalnız istem ve
  model tutuyor); düzeltme yazılı deneme, son kontrol, sözlü ve Araçlar uçlarına gitmiyor.
- Faz 1-A: cümle bölücü "Sonuç 250. Şimdi…" gibi sayıyla biten cümleyi birleştiriyor; ~30 düz `split` merkezi bölücüye
  taşınmadı.
- Faz 1-B: mimarlık sahnesi içerikten bağımsız sabit şablon; hukuk karar ağacı tek kademe; sınıflandırıcıda sözcük sınırı
  yok ("tani" → "tanım"); sahnelerde 11 px altı yazı ve açık tema token'ı yok. Bunlar tasarım işi; tek tek görsel
  doğrulama ister.
- Faz 2: `exam_path_insert_after` hazırlığı kilitlemiyor (SQL göçü ister); yanlış sayacı oku-artır-yaz; KVKK onayı yalnız
  istemci kapısında (sunucu zorunluluğu kimlik/oturum mantığı: Burhan kararı); sayfa aralığı başlangıcı toplamı aşınca
  reddedilmiyor; e-posta değişince `canonical_email` yeniden hesaplanmıyor.
- Faz 4: `flashcard_reviews` için kodun yazdığı sütunlar depodaki şemada yok (canlı şema doğrulanmalı); `spaced` destesi
  SM-2 kaydı yazmıyor; sonuç sayfası eski etiketleri ("sağlam/çalışılacak") kullanıyor; `review` kaynağının ağırlığı
  tanımsız, practice cevabı kanıta yazılıyor; yalnız ipuçlu kanıt "Zayıf %0" gösterebiliyor; kâğıttaki "Zayıf" eşiği %75,
  politika %55.
- Faz 5: "İki şık arasında kaldım" ucu çift başına sınırsız eleme yapıyor (çeldiriciler toplanabilir); misafir hata
  bildirimi ucunda günlük tavan ve tekrar engeli yok; ikiz sınav giriş kartı ücretsizde Plus rozetsiz.
- Faz 3: belgelerim arama/süzgeç ve silme penceresi, "içeriğe atla" + iç içe `<main>`, etiketsiz alanlar, pencerelerde odak
  tuzağı, şifre göz düğmesi bayraksız, SEO (sayfa başına canonical/OG, JSON-LD Organization/WebSite/FAQPage), sihirbaz
  kartına dil/çalışma tarzı/saat-yer, yazma alanında JS büyüme yedeği, baskı cilası.
