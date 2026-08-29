import { PhoneUploadClient } from "@/components/parity/phone-upload-client";

export const metadata = { title: "Telefonundan yükle" };

export default async function PhoneUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PhoneUploadClient token={token} />;
}
