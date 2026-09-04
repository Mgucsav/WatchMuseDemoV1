import { accountError } from "@/lib/account/errors";
import { accountErrorResponse } from "@/lib/account/http";
import { searchPeople } from "@/lib/account/service";

export async function GET(request: Request): Promise<Response> {
  try {
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 2 || query.length > 60) throw accountError("invalid_user_search");
    return Response.json({ people: await searchPeople(query) });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
