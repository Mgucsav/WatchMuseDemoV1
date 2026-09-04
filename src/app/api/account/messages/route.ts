import { accountError } from "@/lib/account/errors";
import { accountErrorResponse } from "@/lib/account/http";
import { listMessages, listThreads, sendMessage } from "@/lib/account/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  try {
    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) return Response.json({ threads: await listThreads() });
    if (!UUID.test(userId)) throw accountError("user_not_found");
    return Response.json({ messages: await listMessages(userId) });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw accountError("invalid_direct_message");
    const value = body as Record<string, unknown>;
    if (typeof value.userId !== "string" || !UUID.test(value.userId) || typeof value.body !== "string") {
      throw accountError("invalid_direct_message");
    }
    await sendMessage(value.userId, value.body);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
