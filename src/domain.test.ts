import { describe, expect, it } from "vitest";
import { profiles } from "./data";
import { calculateLetterDelivery, canAccessLetter, canDiscoverProfile, canSendLetter, compatibilityFor, deliverDueLetters, isQuietHour, scorePersonalityAnswer } from "./domain";
import type { AppState, Letter, LetterPreferences } from "./types";

const defaultLetterPreferences: LetterPreferences = {
  slowDatingEnabled: true,
  preferredStyle: "Letters and messages",
  relationshipIntent: "Open to either",
  distanceCategory: "regional",
  deliveryTiers: {
    nearby: { minimumMinutes: 1, maximumMinutes: 5 },
    regional: { minimumMinutes: 5, maximumMinutes: 20 },
    international: { minimumMinutes: 20, maximumMinutes: 60 },
  },
  defaultDeliveryDelayMinutes: 10,
  inAppArrivalNotifications: true,
  shareReadReceipts: false,
  quietHoursEnabled: false,
  quietStart: "22:00",
  quietEnd: "08:00",
};

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    signedIn: true,
    displayName: "Jana",
    bio: "",
    city: "Brooklyn, NY",
    primaryPhoto: "",
    interests: ["Indie films", "Travel", "Cooking", "Live music"],
    mode: "Dating",
    liked: [],
    passed: [],
    matches: [],
    blocked: [],
    messages: {},
    quizAnswers: {},
    playlist: [],
    watchlist: [],
    timeline: [],
    promptAnswer: "",
    promptVisibility: "Private",
    letters: [],
    letterDrafts: [],
    letterPreferences: defaultLetterPreferences,
    userStamps: [
      { stampId: "first-light", acquiredAt: 0 },
      { stampId: "pressed-flower", acquiredAt: 0 },
      { stampId: "little-postcard", acquiredAt: 0 },
    ],
    ...overrides,
  };
}

describe("personality scoring", () => {
  it("maps valid answers to stable dimension values", () => {
    expect(scorePersonalityAnswer(0, 0)).toBe(90);
    expect(scorePersonalityAnswer(5, 3)).toBe(82);
  });

  it("rejects unknown questions and out-of-range answer indexes", () => {
    expect(scorePersonalityAnswer(6, 0)).toBeUndefined();
    expect(scorePersonalityAnswer(0, 4)).toBeUndefined();
    expect(scorePersonalityAnswer(0, -1)).toBeUndefined();
  });
});

describe("compatibility", () => {
  it("uses Jaccard interest overlap and does not invent a score without evidence", () => {
    const imani = profiles.find((profile) => profile.id === "imani")!;
    const result = compatibilityFor(imani, makeState());
    expect(result.shared).toEqual(["Travel"]);
    expect(result.score).toBe(17);
    expect(result.hasScore).toBe(true);

    const leo = profiles.find((profile) => profile.id === "leo")!;
    expect(compatibilityFor(leo, makeState()).score).toBe(0);
    expect(compatibilityFor(leo, makeState({ interests: [] })).hasScore).toBe(false);
  });

  it("renormalizes over answered personality dimensions only", () => {
    const leo = profiles.find((profile) => profile.id === "leo")!;
    const result = compatibilityFor(leo, makeState({ interests: [], quizAnswers: { 0: 0 } }));
    expect(result.score).toBe(88);
    expect(result.hasScore).toBe(true);
  });
});

describe("discovery eligibility", () => {
  const person = profiles.find((profile) => profile.id === "sana")!;

  it("excludes minors and people already liked, passed, matched, or blocked", () => {
    expect(canDiscoverProfile({ ...person, age: 17 }, makeState())).toBe(false);
    expect(canDiscoverProfile(person, makeState({ liked: [person.id] }))).toBe(false);
    expect(canDiscoverProfile(person, makeState({ passed: [person.id] }))).toBe(false);
    expect(canDiscoverProfile(person, makeState({ matches: [person.id] }))).toBe(false);
    expect(canDiscoverProfile(person, makeState({ blocked: [person.id] }))).toBe(false);
  });

  describe("letter delivery", () => {
    const preferences = makeState().letterPreferences;

    it("calculates a stable delay within the configured regional tier", () => {
      const now = 1_800_000_000_000;
      const first = calculateLetterDelivery(now, "letter-1", preferences);
      expect(first).toBe(calculateLetterDelivery(now, "letter-1", preferences));
      expect(first).toBeGreaterThanOrEqual(now + 5 * 60_000);
      expect(first).toBeLessThanOrEqual(now + 20 * 60_000);
    });

    it("uses the configured default when approximate distance is unavailable", () => {
      const now = 1_800_000_000_000;
      const unavailable = { ...preferences, distanceCategory: "unavailable" as const, defaultDeliveryDelayMinutes: 7 };
      expect(calculateLetterDelivery(now, "letter-1", unavailable)).toBe(now + 7 * 60_000);
    });

    it("handles quiet hours that cross midnight", () => {
      const quiet = { ...preferences, quietHoursEnabled: true, quietStart: "22:00", quietEnd: "07:00" };
      const lateNight = new Date(2026, 9, 28, 23, 0).getTime();
      const afternoon = new Date(2026, 9, 28, 14, 0).getTime();
      expect(isQuietHour(lateNight, quiet)).toBe(true);
      expect(isQuietHour(afternoon, quiet)).toBe(false);
      expect(isQuietHour(lateNight, preferences)).toBe(false);
    });

    it("releases due letters and keeps future or already delivered letters unchanged", () => {
      const now = 1_800_000_000_000;
      const makeLetter = (id: string, scheduledDeliveryAt: number, status: Letter["status"] = "travelling"): Letter => ({
        id,
        conversationId: "amara",
        senderId: "amara",
        recipientId: "you",
        subject: "A little hello",
        body: "A thoughtful note.",
        createdAt: now - 60_000,
        scheduledDeliveryAt,
        deliveredAt: null,
        readAt: null,
        status,
        favorite: false,
        stampId: "first-light",
      });
      const due = makeLetter("due", now);
      const future = makeLetter("future", now + 60_000);
      const delivered = makeLetter("delivered", now - 60_000, "delivered");
      const result = deliverDueLetters([due, future, delivered], now);
      expect(result.arrived.map((letter) => letter.id)).toEqual(["due"]);
      expect(result.letters.map((letter) => letter.status)).toEqual(["delivered", "travelling", "delivered"]);
      expect(result.letters[0].deliveredAt).toBe(now);
      expect(result.letters[1]).toBe(future);
    });

    it("only lets the opted-in author send to a matched, opted-in, unblocked dating match", () => {
      const person = profiles.find((profile) => profile.id === "amara")!;
      expect(canSendLetter(person.id, makeState({ matches: [person.id] }), profiles)).toBe(true);
      expect(canSendLetter(person.id, makeState({ matches: [] }), profiles)).toBe(false);
      expect(canSendLetter(person.id, makeState({ matches: [person.id], blocked: [person.id] }), profiles)).toBe(false);
      expect(canSendLetter(person.id, makeState({ matches: [person.id], mode: "Friends" }), profiles)).toBe(false);
      expect(canSendLetter(person.id, makeState({ matches: [person.id], letterPreferences: { ...defaultLetterPreferences, slowDatingEnabled: false } }), profiles)).toBe(false);
      const notOptedIn = { ...person, slowDatingEnabled: false };
      expect(canSendLetter(person.id, makeState({ matches: [person.id] }), [notOptedIn])).toBe(false);
    });

    it("only exposes a private letter to a matched, unblocked participant", () => {
      const person = profiles.find((profile) => profile.id === "amara")!;
      const letter: Letter = {
        id: "private-letter",
        conversationId: person.id,
        senderId: "you",
        recipientId: person.id,
        subject: "Private",
        body: "A private note.",
        createdAt: 1,
        scheduledDeliveryAt: 2,
        deliveredAt: null,
        readAt: null,
        status: "travelling",
        favorite: false,
        stampId: "first-light",
      };
      expect(canAccessLetter(letter, "you", makeState({ matches: [person.id] }))).toBe(true);
      expect(canAccessLetter(letter, "someone-else", makeState({ matches: [person.id] }))).toBe(false);
      expect(canAccessLetter(letter, "you", makeState({ matches: [person.id], blocked: [person.id] }))).toBe(false);
      expect(canAccessLetter({ ...letter, status: "deleted" }, "you", makeState({ matches: [person.id] }))).toBe(false);
    });
  });

  it("keeps friends-only discovery separate from dating profiles", () => {
    expect(canDiscoverProfile(person, makeState({ mode: "Friends" }))).toBe(true);
    expect(canDiscoverProfile({ ...person, friendshipEligible: false }, makeState({ mode: "Friends" }))).toBe(false);
    expect(canDiscoverProfile({ ...person, friendshipEligible: false }, makeState({ mode: "Dating" }))).toBe(true);
  });
});
