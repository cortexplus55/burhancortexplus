import { SignupWizard } from "./signup-wizard";

export const metadata = {
  title: "Hesap oluştur",
  description: "Öğrenci, veli veya okul öğretmeni olarak Cortex Plus'a katıl.",
};

export default function KayitPage() {
  return <SignupWizard />;
}
