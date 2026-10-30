import { PARALLEL_UPLOADS } from "@/lib/documents/upload-batch";

/**
 * Yükleme uçlarının istek sınırları (31 Ekim 2026).
 *
 * Önce dakikada 6, günde 40 yükleme ve aynı anda en çok 3 bekleyen yükleme vardı: 100 fotoğraf seçen Plus öğrencisi
 * günlük sınıra çarpardı, altı şeritli toplu yüklemede 4.-6. dosya "Üç yükleme hazırlanıyor" alırdı (kurucuda 10 kat
 * çarpan olduğu için canlı denemede görünmedi). Öğrenciyi kota sınırlar (sayfa, fotoğraf, kredi, depolama); bu
 * sayılar yalnız girişli bir ucun kötüye kullanımını keser. Ölçü: altı şeritle telefon fotoğrafı ~10 sn → dakikada
 * ~36 yükleme.
 */
export const UPLOAD_PREPARE_PER_MINUTE = 60;
/** Sigma'nın aylık 1.000 fotoğraf hakkından geniş: bir günde bütün dönemin notu yüklenebilir. */
export const UPLOAD_PREPARE_PER_DAY = 1_500;
/** Aynı anda hazırlanan (deposuna yazılmamış) yükleme: şerit sayısının iki katı. */
export const UPLOAD_PENDING_MAX = PARALLEL_UPLOADS * 2;
