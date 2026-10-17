import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Bize özgü üç boyutlu simge seti (17 Ekim 2026, tasarım 7. adım; ürün sahibinin kararı).
 * Astra özel 3B çizimler kullanıyor (roket, altın madalya, kategori simgeleri); bizimkiler
 * tek tarzda yapay zekâyla bir kez üretildi: mavi #4353f3, beyaz, sarı #fdb300, şeffaf zemin,
 * 256 px webp (`public/illustrations/3d/`). Ad listesi buradaki tek kaynak.
 */
export const ICON_3D_NAMES = [
  "okulum",
  "mufredat",
  "resmi-sinavlar",
  "denklem",
  "integral",
  "periyodik",
  "birim",
  "davet",
  "yildiz",
  "seri",
  "bos-hazirlik",
  "bos-belge",
  "bos-sohbet",
  "avatar",
  "ders",
  "podcast",
  "video",
  "kartlar",
  "bosluk",
  "ogretmen",
  "alistirma",
  "konu-testi",
  "dogru-yanlis",
  "tekrar",
  "yazili",
  "sozlu",
] as const;

export type Icon3DName = (typeof ICON_3D_NAMES)[number];

export function Icon3D({ name, size = 40, className }: { name: Icon3DName; size?: number; className?: string }) {
  return (
    <Image
      src={`/illustrations/3d/${name}.webp`}
      alt=""
      width={size}
      height={size}
      className={cn("cp-icon3d", className)}
      draggable={false}
      unoptimized
    />
  );
}
