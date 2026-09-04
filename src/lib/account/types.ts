export type DmPrivacy = "everyone" | "friends" | "nobody";
export type SocialRelationship = "none" | "incoming" | "outgoing" | "friends";

export interface SocialProfile {
  userId: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  dmPrivacy: DmPrivacy;
  createdAt: string;
}

export interface SocialPerson {
  userId: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  relationship: SocialRelationship;
  canMessage: boolean;
  updatedAt?: string;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  isMine: boolean;
}

export interface DmThread {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  lastBody: string;
  lastMessageAt: string;
  unreadCount: number;
}
