import { redirect } from "next/navigation";

/** Eski öğretmen landing — öğrenci-only ürün. */
export default function OgretmenlerLegacyPage() {
  redirect("/kayit");
}
