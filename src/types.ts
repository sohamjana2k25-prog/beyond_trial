export type Profile = {
  id: string;
  name: string;
  age: number;
  city: string;
  bio: string;
  photo: string;
  interests: string[];
  traits: string[];
  intention: string;
  dimensions: number[];
  prompt: string;
  promptAnswer: string;
  friendshipEligible: boolean;
  slowDatingEnabled: boolean;
};

export type ChatMessage = {
  id: string;
  from: "you" | "them";
  text: string;
  time: string;
};

export type TimelineItem = {
  id: string;
  title: string;
  detail: string;
  date: string;
};

export type LetterStatus = "travelling" | "delivered" | "read" | "deleted";

export type Letter = {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  subject: string;
  body: string;
  createdAt: number;
  scheduledDeliveryAt: number;
  deliveredAt: number | null;
  readAt: number | null;
  status: LetterStatus;
  favorite: boolean;
  stampId: string;
  isDemoSample?: boolean;
  photoDataUrl?: string;
};

export type LetterDraft = {
  userId: string;
  conversationId: string;
  subject: string;
  body: string;
  stampId: string;
  updatedAt: number;
  photoDataUrl?: string;
};

export type DeliveryTier = {
  minimumMinutes: number;
  maximumMinutes: number;
};

export type LetterPreferences = {
  slowDatingEnabled: boolean;
  preferredStyle: "Thoughtful letters" | "Letters and messages" | "Messages first";
  relationshipIntent: "Long-term" | "Exploring" | "Open to either";
  distanceCategory: "nearby" | "regional" | "international" | "unavailable";
  deliveryTiers: Record<"nearby" | "regional" | "international", DeliveryTier>;
  defaultDeliveryDelayMinutes: number;
  inAppArrivalNotifications: boolean;
  shareReadReceipts: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
};

export type UserStamp = {
  stampId: string;
  acquiredAt: number;
};

export type AppState = {
  signedIn: boolean;
  displayName: string;
  bio: string;
  city: string;
  primaryPhoto: string;
  interests: string[];
  mode: "Dating" | "Friends";
  liked: string[];
  passed: string[];
  matches: string[];
  blocked: string[];
  messages: Record<string, ChatMessage[]>;
  quizAnswers: Record<number, number>;
  playlist: string[];
  watchlist: string[];
  timeline: TimelineItem[];
  promptAnswer: string;
  promptVisibility: "Private" | "Matches" | "Profile";
  letters: Letter[];
  letterDrafts: LetterDraft[];
  letterPreferences: LetterPreferences;
  userStamps: UserStamp[];
};
