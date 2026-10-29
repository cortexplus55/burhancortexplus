/**
 * Öğrenciye giden metin (bütün ders türleri). Kurallar tek yerde: `student-output-firewall.ts`
 * (29 Ekim 2026). Bu dosya eski adları korur.
 */
export {
  sanitizeStudentContent,
  studentSafePayload,
  studentSafeText,
} from "@/lib/learning/student-output-firewall";
