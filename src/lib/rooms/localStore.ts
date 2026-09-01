import { randomUUID } from "node:crypto";
import { buildInvitationUrl, generateInvitationToken, hashInvitationToken, isValidInvitationTokenFormat } from "./tokens";
import { sharedSubscriptions } from "./subscriptions";
import type {
  CreateRoomResult,
  JoinRoomResult,
  RoomState,
  RoomSubscriptions,
} from "./types";
import { roomError } from "./errors";

/** Basit in-memory store — yalnızca geliştirme için. Sunucu tekrar başlatılınca silinir. */
type Participant = {
  userId: string;
  role: "host" | "guest";
  /** Katılım anında seçilen abonelikler; ortak küme buradan türetilir. */
  subscriptions: RoomSubscriptions;
};

interface LocalInvitation {
  id: string;
  token: string;
  tokenHash: string;
  spaceId: string;
  expiresAt: string; // ISO
  usedAt?: string;
  usedBy?: string;
}

interface LocalSpace {
  id: string;
  status: "active" | "closed";
  createdBy: string;
  participants: Participant[];
  invitations: LocalInvitation[];
}

const spaces = new Map<string, LocalSpace>();

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

export async function createRoomLocal(
  baseUrl: string,
  subscriptions: RoomSubscriptions,
  userId: string,
): Promise<CreateRoomResult> {
  if (!userId) throw roomError("unauthenticated");
  if (subscriptions.length === 0) throw roomError("subscriptions_required");

  const spaceId = randomUUID();
  const space: LocalSpace = {
    id: spaceId,
    status: "active",
    createdBy: userId,
    participants: [{ userId, role: "host", subscriptions: [...subscriptions] }],
    invitations: [],
  };

  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const invitation: LocalInvitation = {
    id: randomUUID(),
    token,
    tokenHash,
    spaceId,
    expiresAt: nowIso(24 * 60 * 60 * 1000),
  };

  space.invitations.push(invitation);
  spaces.set(spaceId, space);

  const inviteUrl = buildInvitationUrl(baseUrl, token);

  return { spaceId, inviteUrl, invitationExpiresAt: invitation.expiresAt };
}

export async function joinRoomLocal(
  token: string,
  subscriptions: RoomSubscriptions,
  userId: string,
): Promise<JoinRoomResult> {
  if (!isValidInvitationTokenFormat(token)) throw roomError("invalid_invitation");
  if (!userId) throw roomError("unauthenticated");
  if (subscriptions.length === 0) throw roomError("subscriptions_required");

  const tokenHash = hashInvitationToken(token);

  // find invitation
  let foundInv: LocalInvitation | null = null;
  let ownerSpace: LocalSpace | null = null;
  for (const s of spaces.values()) {
    const inv = s.invitations.find((i) => i.tokenHash === tokenHash);
    if (inv) {
      foundInv = inv;
      ownerSpace = s;
      break;
    }
  }

  if (!foundInv || !ownerSpace) throw roomError("invalid_invitation");

  if (ownerSpace.status !== "active") throw roomError("room_closed");

  if (foundInv.usedAt) throw roomError("invitation_already_used");

  if (new Date(foundInv.expiresAt) <= new Date()) throw roomError("invitation_expired");

  const existing = ownerSpace.participants.find((p) => p.userId === userId);
  if (existing) {
    if (existing.role === "host") throw roomError("host_cannot_join");
    // Tekrar gelen misafir seçimini tazeleyebilir; üyelik değişmez.
    existing.subscriptions = [...subscriptions];
    return { spaceId: ownerSpace.id, role: "guest", alreadyMember: true };
  }

  if (ownerSpace.participants.length >= 2) throw roomError("room_full");

  ownerSpace.participants.push({
    userId,
    role: "guest",
    subscriptions: [...subscriptions],
  });
  foundInv.usedAt = nowIso();
  foundInv.usedBy = userId;

  return { spaceId: ownerSpace.id, role: "guest", alreadyMember: false };
}

export async function getRoomStateLocal(spaceId: string, userId: string): Promise<RoomState> {
  const space = spaces.get(spaceId);
  if (!space) throw roomError("invalid_invitation");
  if (!space.participants.find((p) => p.userId === userId)) throw roomError("invalid_invitation");

  const participantCount = space.participants.length;
  const mine = space.participants.find((p) => p.userId === userId)!;
  const partner = space.participants.find((p) => p.userId !== userId) ?? null;

  return {
    spaceId: space.id,
    status: space.status,
    participantCount,
    myRole: mine.role,
    partnerJoined: participantCount >= 2,
    mySubscriptions: [...mine.subscriptions],
    partnerSubscriptions: partner ? [...partner.subscriptions] : [],
    sharedSubscriptions: partner
      ? sharedSubscriptions(mine.subscriptions, partner.subscriptions)
      : [],
  };
}

/** Çağıranın kendi abonelik seçimini değiştirir; başka satıra dokunmaz. */
export function setRoomSubscriptionsLocal(
  spaceId: string,
  subscriptions: RoomSubscriptions,
  userId: string,
): void {
  if (subscriptions.length === 0) throw roomError("subscriptions_required");

  const space = spaces.get(spaceId);
  if (!space) throw roomError("invalid_invitation");

  const mine = space.participants.find((p) => p.userId === userId);
  if (!mine) throw roomError("invalid_invitation");

  mine.subscriptions = [...subscriptions];
}
