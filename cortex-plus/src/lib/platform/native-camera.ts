"use client";

import { isNativeApp } from "@/lib/platform/native";

/**
 * Mobil uygulamada kamera (26 Kasım 2026, Aşama 1). Telefonun kendi kamera ekranı açılır; çekilen fotoğraf `File`
 * olarak döner ve bildiğimiz yükleme hattına girer (sayfa tepsisi → tek küçültücü 1600 px / %82 → fotoğraf seti).
 *
 * Görüntü base64 olarak alınır: canlı siteyi açan web görünümü telefonun dosya adresini (`capacitor://…`) kendi
 * kökeninden okuyamaz. Boyut kamerada 2400 px ile sınırlanır; asıl küçültme yükleme hattında.
 */

export type NativePhotoResult = { file: File } | { cancelled: true } | { error: "permission" | "unavailable" };

let shotCounter = 0;

function base64ToFile(base64: string, format: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const extension = format === "png" ? "png" : format === "heic" ? "heic" : "jpg";
  const type = extension === "png" ? "image/png" : extension === "heic" ? "image/heic" : "image/jpeg";
  shotCounter += 1;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return new File([bytes], `defter-${stamp}-${shotCounter}.${extension}`, { type, lastModified: Date.now() });
}

function isCancel(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cancel|iptal/i.test(message);
}

function isPermission(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /permission|denied|access/i.test(message);
}

/** Kamerayla tek fotoğraf. Web'de "unavailable" (web kendi `capture` girişini kullanır). */
export async function takeNativePhoto(): Promise<NativePhotoResult> {
  if (!isNativeApp()) return { error: "unavailable" };
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Base64,
      quality: 90,
      width: 2400,
      correctOrientation: true,
      saveToGallery: false,
      allowEditing: false,
    });
    if (!photo.base64String) return { error: "unavailable" };
    return { file: base64ToFile(photo.base64String, photo.format) };
  } catch (error) {
    if (isCancel(error)) return { cancelled: true };
    return { error: isPermission(error) ? "permission" : "unavailable" };
  }
}

export const CAMERA_PERMISSION_MESSAGE =
  "Kameraya izin verilmedi. Telefonunun Ayarlar > Cortex Plus bölümünden kamerayı açıp yeniden dene.";
export const CAMERA_UNAVAILABLE_MESSAGE = "Kamera şu an açılamadı. Galeriden fotoğraf seçebilirsin.";
