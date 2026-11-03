import { redirect } from "next/navigation";

/**
 * "Bilgilerim" Ayarlar penceresine katıldı (kıyas ürünü gibi: Hesabım / Okulum /
 * Öğrenme tercihleri, 1 Ekim 2026). Eski bağlantılar pencereyi açar.
 */
export default function ProfilDuzenlePage() {
  redirect("/profil?dialog=profile");
}
