/**
 * Ana ekrandaki "Başla".
 *
 * 8 Kasım 2026 (ürün sahibi): önce kayıtta seçilen ders ve hedeften kurulan bir cümle öğrenci adına gönderiliyordu
 * ("Mezun Fizik çalışmak istiyorum…"); sonra genel bir cümleye çevrildi ama öğrencinin balonunda "Önce aklımda ne
 * olduğunu sor" diye öğretmene talimat veriyormuş gibi okunuyordu. Şimdi öğretmen ilk sözü kendisi söyler; model
 * çağrısı yok, kredi yok, kaydedilmez. Öğrenci cevap yazınca asıl sohbet başlar.
 */
export function startGreetingFor(firstName: string | null | undefined): string {
  const name = (firstName ?? "").trim();
  return `${name ? `Merhaba ${name}!` : "Merhaba!"} Bugün ne çalışmak istersin? Aklındaki dersi ya da konuyu yaz; takıldığın bir soru varsa fotoğrafını da gönderebilirsin.`;
}
