import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Cortex Plus marka işareti — tek kaynak (9 Kasım 2026: yeni 3B logo).
 *
 * Şeffaf PNG (`public/logo-mark.png`, 512 px kare); `next/image` boyuta göre 1x/2x üretir, telefonda da
 * keskin. API eskisiyle aynı (`size` piksel, `className`), bu yüzden menü, sohbet, stüdyo, yönetim ve
 * 404'teki çağrılar değişmedi. Dekoratif: yanında her zaman "Cortex Plus" yazısı ya da bağlantının
 * erişilebilir adı var, bu yüzden alt boş ve ekran okuyucudan gizli.
 */
export function CortexMark({
  size = 20,
  className,
  priority = false,
}: {
  /** Piksel. Uygulama çubuğu 20, pazarlama menüsü 30, sohbet 14. */
  size?: number;
  className?: string;
  /** Yalnız ekranın üstünde ilk görünen yerde (menü, giriş kartı) açın. */
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo-mark.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      priority={priority}
      className={cn("inline-block shrink-0 select-none object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
