import { redirect } from "next/navigation";

/** Eski middleware rotası — öğrenci deneme akışına yönlendir. */
export default function SinavHazirligiAppPage() {
  redirect("/deneme-sinavlari");
}
