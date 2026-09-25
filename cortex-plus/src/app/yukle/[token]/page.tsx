import { PhoneUploadClient } from "@/components/parity/phone-upload-client";

export const metadata = { title: "Telefonundan yükle" };

export default async function PhoneUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ amac?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const purpose = query.amac === "hazirlik" ? "hazirlik" : "odev";
  return <PhoneUploadClient token={token} purpose={purpose} />;
}
