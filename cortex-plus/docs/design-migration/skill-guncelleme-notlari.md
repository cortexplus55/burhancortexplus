# Skill güncelleme notları (Faz 12C)

`cortex-plus-design-system` skill'ine eklenecekler. Skill'i Claude değiştirmez; ürün sahibi bu notlarla günceller.

## 1. Yeni görünüm bayrakları ve sarmalayıcı
- Her ekranın yeni görünümü `ui.v2.<ekran>` bayrağının arkasında: `ders`, `tekrar`, `ogretmen`, `giris`, `kurulum`,
  `pay`, `studyo`, `duello`, `ayarlar`, `kutuphane`, `araclar2`, `buyume` (`src/lib/ui-v2/flags.ts`).
- Sarmalayıcı tek bileşen: `UiScope` (`src/lib/ui-v2/scope.tsx`). Anahtar boşsa çocukları olduğu gibi döndürür (bayrak
  kapalıyken DOM aynı); açıkken `display: contents` kap, `data-ui="anahtar"`.
- Kurallar yalnız `src/styles/ui-v2-<ekran>.css` içinde ve her seçici `[data-ui~="<ekran>"]` ile başlar. Ham renk yok
  (token), `outline: none` yok, odak `1px solid var(--cx-focus)` + 3 px.
- Var olan bileşenin kendi kuralı `.x .y` (0,2,0) ise yeni kural bir basamak öncelikli yazılır
  (`[data-ui~="k"] .x .y`); eşit öncelikte yükleme sırası belirler, güvenilmez.
- Bayrak istek anında okunur; durağan sayfa (giriş, kayıt) bayrak okumak için dinamik olur. `loading.tsx` olan rotada
  düzen eklenmez, sarmalayıcı sayfanın içine konur (Suspense kuralı).

## 2. Hak sistemi (`lib/entitlements`)
- `getGate(snapshot, action, ctx)` bugünkü sunucuyu birebir taşır; eylemler `lesson.create`, `teacher.message`,
  `photo.solve`, `podcast.create`, `video.create`, `oral.start`, `written.start`, `cram.export`, `duel.start`.
- `<Gate action asChild>`: açık → işaret yok; sınırlı → günlük sayaç ("3 kaldı"); kilitli → 16 px kilit + `PLUS`
  rozeti, kontrol soluk DEĞİL, basınca `UpgradeSheet`. Kilitliyken istek atılmaz.
- `UpgradeSheet` altı neden, metinler `sheet-copy.ts`; `/pay?plan=plus|week|sigma&from=<eylem>` (beyaz liste).
  `/pay` `?plan=` kartı açar, işaretler ve karta kaydırır.
- Sunucu 402 gövdesinde `gate` alanı; arayüz sayacı kendisi artırmaz / azaltmaz.

## 3. Ekranda tek brand
- Marka gradyanı (`--cx-gradient-brand`) ekranın tek ana eyleminde. /pay'de istenen kartın ana düğmesi, yoksa önerilen
  Plus'ınki (`data-cx-main`, `data-cx-picked`); öbürleri cam, ek paket zayıf.
- Cam yüzey de gradyan taşır: testte "marka mı" sorusu rengiyle (`rgb(79, 70, 229)`) sorulur, "gradient" kelimesiyle değil.

## 4. Heyecan kiti ve dürüstlük
- Düello: bot "BOT" etiketli; botun bu sorudaki doğru / yanlışı, puanı ve nokta rengi öğrenci cevaplayana kadar
  gösterilmez ("cevapladı" nötr işareti, nokta `is-done`).
- Podcast şimdiki satırı renk + kalınlık + sol çizgi (renk tek başına anlam taşımaz), en az 16 px. Konuşmacı renkleri
  token: `--cx-speaker-ada`, `--cx-speaker-kerem`.

## 5. Büyüme kuralları (`lib/growth`)
- Günde en çok bir öneri (bütün yerleşimler), aygıta özel `localStorage`; okunamazsa gösterilmez.
- Kapatılan yerleşim 30 gün çıkmaz (`GROWTH_DISMISS_COOLDOWN_DAYS`). Gün İstanbul saatiyle.
- Çalışma ekranlarında (ders, test, sözlü, düello, yazılı) yerleşim yok. Hiçbir şey kendiliğinden gönderilmez.
- Olay `share_prompt_shown` (`placement`, `plan`), yerleşim başına günde bir kez, kişisel veri yok.
- Ana ekran davet şeridi yalnız masaüstünde (telefon ana ekranı kaydırmasız; "Kalan haklar" ile aynı kural).

## 6. Durum ekranları
- 404 ve hata ekranları tek bileşen: `StatusScreen` (gerçek logo dosyası, başlık, tek cümle, tek brand, isteğe bağlı
  zayıf eylem, yalnız kısa hata kodu). Metinler: "Sayfa bulunamadı" / "Aradığın sayfa taşınmış ya da silinmiş olabilir."
  / "Ana sayfaya dön"; "Bir şeyler ters gitti" / "Sorun bizde. Sayfayı yenilemeyi dene; sürerse biraz sonra tekrar bak."
  / "Yeniden dene". `global-error` kendi `<html lang="tr">`'si ve token değerleriyle.

## 7. Hareket ve erişilebilirlik
- Hareket azaltmada boşta sonsuz animasyon 0 (yalnız opaklık serbest); e2e `hareket-azaltma.spec.ts`.
- Playwright'ta hareket azaltma `page.emulateMedia({ reducedMotion: "reduce" })` ile verilir; `test.use({ reducedMotion })`
  bu depoda uygulanmıyor (ölçüm yanılır).
- Tam axe taraması `scripts/axe-scan.mjs` (WCAG 2.1 A + AA, rota matrisi × 3 genişlik × planlar).

## 8. Sık hatalar
- Prettier'ı dosyanın tamamına koşmak ilgisiz satırları değiştirir; bu depoda yalnız değişen satırlar.
- Test dosyasını kabuk heredoc'uyla yazarken `\\[` gibi kaçışlar kaybolabilir; düzenleme aracıyla yazın.
- Derleme sürerken dal değiştirmeyin; ayrı çalışma kopyası (`git worktree`) kullanın.
