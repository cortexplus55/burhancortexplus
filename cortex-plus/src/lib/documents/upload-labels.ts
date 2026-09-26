/**
 * Belge yükleme metinleri — tek liste.
 *
 * Kabul edilen türler kodda duruyor (PDF, Word, PowerPoint, TXT, görsel).
 * Ekrandaki cümle geride kalırsa öğrenci yükleyebileceği dosyayı
 * "desteklenmiyor" sanıyor.
 */

export const DOCUMENT_KIND_LABEL =
  "PDF, Word (.docx), PowerPoint (.pptx), TXT, JPG, PNG ve HEIC";

export const DOCUMENT_UPLOAD_HINT = `${DOCUMENT_KIND_LABEL} · en fazla 15 MB`;

export const DOCUMENT_TYPE_REJECTED =
  "Bu dosya türü desteklenmiyor. PDF, Word (.docx), PowerPoint (.pptx), TXT veya görsel (JPG, PNG, HEIC) yükle.";

export const DOCUMENT_PICK_REJECTED =
  "PDF, Word (.docx), PowerPoint (.pptx), JPG, PNG, HEIC veya TXT yükleyebilirsin.";

export const DOCUMENT_MATERIAL_HINT =
  "PDF, Word, slayt ya da fotoğraf (JPG, PNG, HEIC) yükle; her şey senin belgenden üretilsin.";

export const DOCUMENT_EMPTY_DESCRIPTION =
  "Ders notunu yükle — PDF, Word veya PowerPoint. Konular çıkınca çalışma planın oluşsun.";

export const DOCUMENT_ONBOARDING_HINT =
  "PDF, Word, PowerPoint veya fotoğraf yükleyerek yalnızca kendi belgenden öğrenebilirsin.";
