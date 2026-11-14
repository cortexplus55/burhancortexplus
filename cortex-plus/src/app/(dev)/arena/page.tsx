import { notFound } from "next/navigation";
import { ArenaGallery } from "./gallery";

export const dynamic = "force-dynamic";

/**
 * Heyecan kiti galerisi (Faz 4A): bileşenleri ekranlara bağlamadan doğrulamak için. Üretimde YOK
 * (`VERCEL_ENV === "production"` iken 404); önizlemede ve yerel test sunucusunda açık. Veri sabit, istek yok.
 */
export default function ArenaPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <ArenaGallery />;
}
