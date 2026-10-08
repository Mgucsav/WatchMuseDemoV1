import { accountErrorResponse } from "@/lib/account/http";
import { removeProfileImage, uploadProfileImage } from "@/lib/account/profile-image";

/** Profilin üstündeki kapak fotoğrafı (form alanı: `banner`). */
export async function POST(request: Request): Promise<Response> {
  try {
    return Response.json({ bannerUrl: await uploadProfileImage(request, "banner") });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function DELETE(): Promise<Response> {
  try {
    await removeProfileImage("banner");
    return Response.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
