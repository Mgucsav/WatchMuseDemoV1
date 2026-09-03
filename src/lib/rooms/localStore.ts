import { randomUUID } from "node:crypto";
import { buildInvitationUrl, generateInvitationToken, hashInvitationToken, isValidInvitationTokenFormat } from "./tokens";
import { sharedSubscriptionsForAll } from "./subscriptions";
import type {
  CreateRoomResult,
  JoinRoomResult,
  PublicRoomSummary,
  RoomChatMessage,
  RoomState,
  RoomSubscriptions,
  RoomSelectionMode,
  RoomVisibility,
} from "./types";
import { roomError } from "./errors";

/** Basit in-memory store — yalnızca geliştirme için. Sunucu tekrar başlatılınca silinir. */
type Participant = {
  userId: string;
  role: "host" | "guest";
  displayName: string;
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
  name: string;
  visibility: RoomVisibility;
  selectionMode: RoomSelectionMode;
  capacity: number;
  status: "active" | "closed";
  createdBy: string;
  createdAt: string;
  passwordHash: string | null;
  participants: Participant[];
  invitations: LocalInvitation[];
  bannedUserIds: Set<string>;
  messages: Array<{
    id: string;
    userId: string;
    senderDisplayName: string;
    body: string;
    createdAt: string;
  }>;
}

const spaces = new Map<string, LocalSpace>();

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

export async function createRoomLocal(
  baseUrl: string,
  subscriptions: RoomSubscriptions,
  userId: string,
  options: {
    name: string;
    visibility: RoomVisibility;
    selectionMode: RoomSelectionMode;
    capacity: number;
    isRegistered: boolean;
    passwordHash: string | null;
  },
): Promise<CreateRoomResult> {
  if (!userId) throw roomError("unauthenticated");
  if (subscriptions.length === 0) throw roomError("subscriptions_required");
  if (options.visibility === "public" && !options.isRegistered) {
    throw roomError("registration_required");
  }

  const spaceId = randomUUID();
  const space: LocalSpace = {
    id: spaceId,
    name: options.name,
    visibility: options.visibility,
    selectionMode: options.selectionMode,
    capacity: options.capacity,
    status: "active",
    createdBy: userId,
    createdAt: nowIso(),
    passwordHash: options.passwordHash,
    participants: [{
      userId,
      role: "host",
      displayName: "Oda sahibi",
      subscriptions: [...subscriptions],
    }],
    invitations: [],
    bannedUserIds: new Set(),
    messages: [],
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

  return {
    spaceId,
    name: space.name,
    visibility: space.visibility,
    selectionMode: space.selectionMode,
    capacity: space.capacity,
    inviteUrl,
    invitationExpiresAt: invitation.expiresAt,
  };
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
  if (ownerSpace.passwordHash !== null) throw roomError("private_password_required");

  if (ownerSpace.status !== "active") throw roomError("room_closed");

  if (new Date(foundInv.expiresAt) <= new Date()) throw roomError("invitation_expired");
  if (ownerSpace.bannedUserIds.has(userId)) throw roomError("participant_banned");

  const existing = ownerSpace.participants.find((p) => p.userId === userId);
  if (existing) {
    if (existing.role === "host") throw roomError("host_cannot_join");
    // Tekrar gelen misafir seçimini tazeleyebilir; üyelik değişmez.
    existing.subscriptions = [...subscriptions];
    return { spaceId: ownerSpace.id, role: "guest", alreadyMember: true };
  }

  if (ownerSpace.participants.length >= ownerSpace.capacity) throw roomError("room_full");

  ownerSpace.participants.push({
    userId,
    role: "guest",
    displayName: `Misafir ${ownerSpace.participants.length}`,
    subscriptions: [...subscriptions],
  });

  return { spaceId: ownerSpace.id, role: "guest", alreadyMember: false };
}

export async function getRoomStateLocal(spaceId: string, userId: string): Promise<RoomState> {
  const space = spaces.get(spaceId);
  if (!space) throw roomError("invalid_invitation");
  if (!space.participants.find((p) => p.userId === userId)) throw roomError("invalid_invitation");

  const participantCount = space.participants.length;
  const mine = space.participants.find((p) => p.userId === userId)!;
  const participantSubscriptions = space.participants.map((p) => p.subscriptions);

  return {
    spaceId: space.id,
    name: space.name,
    visibility: space.visibility,
    selectionMode: space.selectionMode,
    capacity: space.capacity,
    status: space.status,
    participantCount,
    myRole: mine.role,
    enoughParticipants: participantCount >= 2,
    participants: space.participants.map((participant) => ({
      userId: participant.userId,
      displayName: participant.displayName,
      role: participant.role,
      subscriptions: [...participant.subscriptions],
      isMe: participant.userId === userId,
    })),
    mySubscriptions: [...mine.subscriptions],
    sharedSubscriptions: sharedSubscriptionsForAll(participantSubscriptions),
  };
}

export function listPublicRoomsLocal(): PublicRoomSummary[] {
  return [...spaces.values()]
    .filter(
      (space) =>
        space.status === "active" &&
        (space.visibility === "public" || space.passwordHash !== null),
    )
    .filter((space) => space.participants.length < space.capacity)
    .map((space) => ({
      spaceId: space.id,
      name: space.name,
      visibility: space.visibility,
      selectionMode: space.selectionMode,
      capacity: space.capacity,
      participantCount: space.participants.length,
      hostDisplayName:
        space.participants.find((participant) => participant.role === "host")
          ?.displayName ?? "Oda sahibi",
      createdAt: space.createdAt,
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function getListedRoomAccessLocal(spaceId: string): {
  visibility: RoomVisibility;
  passwordHash: string | null;
} | null {
  const space = spaces.get(spaceId);
  if (!space || space.status !== "active") return null;
  if (space.visibility === "private" && space.passwordHash === null) return null;
  return { visibility: space.visibility, passwordHash: space.passwordHash };
}

export function joinPrivateRoomLocal(
  spaceId: string,
  subscriptions: RoomSubscriptions,
  userId: string,
): JoinRoomResult {
  const space = spaces.get(spaceId);
  if (!space || space.visibility !== "private" || space.passwordHash === null) {
    throw roomError("invalid_invitation");
  }
  if (space.status !== "active") throw roomError("room_closed");
  if (space.bannedUserIds.has(userId)) throw roomError("participant_banned");

  const existing = space.participants.find((participant) => participant.userId === userId);
  if (existing) {
    existing.subscriptions = [...subscriptions];
    return { spaceId, role: existing.role, alreadyMember: true };
  }
  if (space.participants.length >= space.capacity) throw roomError("room_full");
  space.participants.push({
    userId,
    role: "guest",
    displayName: `Misafir ${space.participants.length}`,
    subscriptions: [...subscriptions],
  });
  return { spaceId, role: "guest", alreadyMember: false };
}

export function joinPublicRoomLocal(
  spaceId: string,
  subscriptions: RoomSubscriptions,
  userId: string,
  isRegistered: boolean,
): JoinRoomResult {
  if (!isRegistered) throw roomError("registration_required");
  const space = spaces.get(spaceId);
  if (!space || space.visibility !== "public") throw roomError("public_room_required");
  if (space.status !== "active") throw roomError("room_closed");
  if (space.bannedUserIds.has(userId)) throw roomError("participant_banned");

  const existing = space.participants.find((participant) => participant.userId === userId);
  if (existing) {
    existing.subscriptions = [...subscriptions];
    return { spaceId, role: existing.role, alreadyMember: true };
  }
  if (space.participants.length >= space.capacity) throw roomError("room_full");

  space.participants.push({
    userId,
    role: "guest",
    displayName: `Üye ${space.participants.length}`,
    subscriptions: [...subscriptions],
  });
  return { spaceId, role: "guest", alreadyMember: false };
}

export function kickRoomParticipantLocal(
  spaceId: string,
  participantUserId: string,
  actorUserId: string,
): void {
  const space = spaces.get(spaceId);
  if (!space) throw roomError("invalid_invitation");
  const actor = space.participants.find((participant) => participant.userId === actorUserId);
  if (actor?.role !== "host") throw roomError("host_required");
  const targetIndex = space.participants.findIndex(
    (participant) => participant.userId === participantUserId && participant.role !== "host",
  );
  if (targetIndex < 0) throw roomError("participant_not_found");
  space.participants.splice(targetIndex, 1);
  space.bannedUserIds.add(participantUserId);
}

export function leaveRoomLocal(spaceId: string, actorUserId: string): void {
  const space = spaces.get(spaceId);
  if (!space) throw roomError("invalid_invitation");
  const actorIndex = space.participants.findIndex(
    (participant) => participant.userId === actorUserId,
  );
  if (actorIndex < 0) throw roomError("participant_not_found");
  if (space.participants[actorIndex]?.role === "host") throw roomError("guest_required");
  space.participants.splice(actorIndex, 1);
}

export function closeRoomLocal(spaceId: string, actorUserId: string): void {
  const space = spaces.get(spaceId);
  if (!space) throw roomError("invalid_invitation");
  const actor = space.participants.find(
    (participant) => participant.userId === actorUserId,
  );
  if (actor?.role !== "host") throw roomError("host_required");
  space.status = "closed";
}

export function getRoomMessagesLocal(
  spaceId: string,
  userId: string,
): RoomChatMessage[] {
  const space = spaces.get(spaceId);
  if (!space || !space.participants.some((participant) => participant.userId === userId)) {
    throw roomError("invalid_invitation");
  }
  return space.messages.slice(-50).map((message) => ({
    id: message.id,
    senderDisplayName: message.senderDisplayName,
    body: message.body,
    createdAt: message.createdAt,
    isMine: message.userId === userId,
  }));
}

export function sendRoomMessageLocal(
  spaceId: string,
  body: string,
  userId: string,
): RoomChatMessage {
  const space = spaces.get(spaceId);
  const participant = space?.participants.find((entry) => entry.userId === userId);
  if (!space || !participant) throw roomError("invalid_invitation");
  if (space.status !== "active") throw roomError("room_closed");

  const previous = space.messages.at(-1);
  if (
    previous?.userId === userId &&
    Date.now() - Date.parse(previous.createdAt) < 750
  ) {
    throw roomError("room_message_rate_limited");
  }

  const message = {
    id: randomUUID(),
    userId,
    senderDisplayName: participant.displayName,
    body,
    createdAt: nowIso(),
  };
  space.messages.push(message);
  return { ...message, isMine: true };
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
