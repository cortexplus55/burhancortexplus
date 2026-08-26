import { SignupWizard } from "./signup-wizard";
import { Suspense } from "react";

export const metadata = {
  title: "Hesap oluştur",
  description: "Öğrenci, veli veya okul öğretmeni olarak Cortex Plus'a katıl.",
};

export default function KayitPage() {
  return (
    <Suspense fallback={null}>
      <SignupWizard />
    </Suspense>
  );
}
