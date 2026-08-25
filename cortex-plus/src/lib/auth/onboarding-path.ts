/** Profil tamamlanmamış kullanıcıyı yönlendirme (middleware ile uyumlu). */
export function onboardingPathForRole(role: string | null | undefined): string {
  switch (role) {
    case "parent":
      return "/onboarding/veli";
    case "teacher":
      return "/onboarding/ogretmen";
    default:
      return "/onboarding";
  }
}
