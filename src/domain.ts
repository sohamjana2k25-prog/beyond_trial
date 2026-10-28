import type { AppState, Letter, LetterPreferences, Profile } from "./types";

const answerDimensionScores = [
  [90, 65, 35, 60],
  [90, 35, 62, 55],
  [90, 72, 65, 45],
  [85, 78, 50, 70],
  [90, 68, 35, 60],
  [65, 90, 75, 82],
];

export function scorePersonalityAnswer(question: number, answer: number): number | undefined {
  const scores = answerDimensionScores[question];
  if (!scores || !Number.isInteger(answer) || answer < 0 || answer >= scores.length) return undefined;
  return scores[answer];
}

export function compatibilityFor(person: Profile, state: AppState) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  const shared = person.interests.filter((interest) =>
    state.interests.some((userInterest) => normalize(userInterest) === normalize(interest)),
  );
  const allInterests = new Set([...state.interests, ...person.interests].map(normalize));
  const interestScore = allInterests.size ? shared.length / allInterests.size : 0;
  const hasInterestData = state.interests.length > 0 && person.interests.length > 0;
  const dimensions = [
    { question: 1, person: 0, weight: 0.1 },
    { question: 2, person: 1, weight: 0.2 },
    { question: 0, person: 2, weight: 0.075 },
    { question: 3, person: 3, weight: 0.25 },
    { question: 4, person: 4, weight: 0.075 },
    { question: 5, person: 5, weight: 0.15 },
  ];
  let weightedScore = hasInterestData ? interestScore * 0.15 : 0;
  let availableWeight = hasInterestData ? 0.15 : 0;
  for (const dimension of dimensions) {
    const answer = state.quizAnswers[dimension.question];
    if (answer === undefined) continue;
    const userScore = scorePersonalityAnswer(dimension.question, answer);
    const personScore = person.dimensions[dimension.person];
    if (userScore === undefined || personScore === undefined) continue;
    const similarity = 1 - Math.abs(userScore - personScore) / 100;
    weightedScore += similarity * dimension.weight;
    availableWeight += dimension.weight;
  }
  return {
    score: availableWeight ? Math.round(weightedScore / availableWeight * 100) : 0,
    shared,
    hasScore: hasInterestData || Object.keys(state.quizAnswers).length > 0,
  };
}

export function canDiscoverProfile(person: Profile, state: AppState) {
  return person.age >= 18 &&
    !state.liked.includes(person.id) &&
    !state.passed.includes(person.id) &&
    !state.matches.includes(person.id) &&
    !state.blocked.includes(person.id) &&
    (state.mode === "Dating" || person.friendshipEligible);
}

export function calculateLetterDelivery(
  now: number,
  letterId: string,
  preferences: LetterPreferences,
): number {
  const category = preferences.distanceCategory;
  if (category === "unavailable") {
    return now + Math.max(1, preferences.defaultDeliveryDelayMinutes) * 60_000;
  }
  const tier = preferences.deliveryTiers[category];
  const minimum = Math.max(1, Math.min(tier.minimumMinutes, tier.maximumMinutes));
  const maximum = Math.max(minimum, tier.maximumMinutes);
  let seed = 0;
  for (const character of letterId) seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  const span = maximum - minimum + 1;
  const delayMinutes = minimum + (span > 0 ? seed % span : 0);
  return now + delayMinutes * 60_000;
}

export function isQuietHour(now: number, preferences: LetterPreferences): boolean {
  if (!preferences.quietHoursEnabled) return false;
  const [startHour, startMinute] = preferences.quietStart.split(":").map(Number);
  const [endHour, endMinute] = preferences.quietEnd.split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some((value) => !Number.isInteger(value) || value < 0)) return false;
  const current = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

export function deliverDueLetters(letters: Letter[], now: number) {
  const arrived: Letter[] = [];
  const updated = letters.map((letter) => {
    if (letter.status !== "travelling" || letter.scheduledDeliveryAt > now) return letter;
    const delivered = { ...letter, status: "delivered" as const, deliveredAt: now };
    arrived.push(delivered);
    return delivered;
  });
  return { letters: updated, arrived };
}

export function canSendLetter(conversationId: string, state: AppState, people: Profile[]) {
  const recipient = people.find((person) => person.id === conversationId);
  return state.mode === "Dating" &&
    state.letterPreferences.slowDatingEnabled &&
    state.matches.includes(conversationId) &&
    !state.blocked.includes(conversationId) &&
    recipient?.slowDatingEnabled === true;
}

export function canAccessLetter(letter: Letter, userId: string, state: AppState) {
  return letter.status !== "deleted" &&
    (letter.senderId === userId || letter.recipientId === userId) &&
    state.matches.includes(letter.conversationId) &&
    !state.blocked.includes(letter.conversationId);
}
