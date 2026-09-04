import { accountError } from "@/lib/account/errors";
import { accountErrorResponse } from "@/lib/account/http";
import {
  listConnections, removeConnection, requestFriendship, respondFriendship,
} from "@/lib/account/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(): Promise<Response> {
  try {
    return Response.json({ connections: await listConnections() });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  return act(request, async (userId) => requestFriendship(userId));
}

export async function PATCH(request: Request): Promise<Response> {
  return act(request, async (userId, value) => {
    if (typeof value.accept !== "boolean") throw accountError("friendship_not_found");
    await respondFriendship(userId, value.accept);
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return act(request, async (userId) => removeConnection(userId));
}

async function act(
  request: Request,
  action: (userId: string, body: Record<string, unknown>) => Promise<void>,
): Promise<Response> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw accountError("invalid_friend_target");
    const value = body as Record<string, unknown>;
    if (typeof value.userId !== "string" || !UUID.test(value.userId)) throw accountError("invalid_friend_target");
    await action(value.userId, value);
    return Response.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
