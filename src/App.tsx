import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { letterPrompts, letterStamps, movies, profiles, questions, songs, starterMessages } from "./data";
import { calculateLetterDelivery, canAccessLetter, canDiscoverProfile, canSendLetter, compatibilityFor, deliverDueLetters, isQuietHour, scorePersonalityAnswer } from "./domain";
import type { AppState, ChatMessage, Letter, LetterDraft, LetterPreferences, Profile } from "./types";

const STORAGE_KEY = "beyond.prototype.v1";
const seededMatches = ["amara"];
const inboundLikes = ["sana", "priya"];
const demoUserId = "you";
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
const initialState: AppState = {
  signedIn: false,
  displayName: "Jana",
  bio: "Looking for the little moments that turn into good stories.",
  city: "Brooklyn, NY",
  primaryPhoto: "",
  interests: ["Indie films", "Travel", "Cooking", "Live music"],
  mode: "Dating",
  liked: [],
  passed: [],
  matches: seededMatches,
  blocked: [],
  messages: { amara: starterMessages },
  quizAnswers: {},
  playlist: ["Garden Song"],
  watchlist: ["Before Sunrise"],
  timeline: [
    { id: "t1", title: "You met Amara", detail: "A mutual like opened the door to something new.", date: "October 24" },
    { id: "t2", title: "Your first conversation", detail: "A little talk about slow mornings and good coffee.", date: "October 25" },
    { id: "t3", title: "A song was shared", detail: "Garden Song by Phoebe Bridgers made it onto your shared playlist.", date: "October 26" },
  ],
  promptAnswer: "",
  promptVisibility: "Private",
  letters: [{
    id: "sample-letter-amara-1",
    conversationId: "amara",
    senderId: "amara",
    recipientId: demoUserId,
    subject: "A small thing I wanted to tell you",
    body: "Dear Jana,\n\nI saw your answer about a perfect Sunday and wanted to say that a long walk to find good coffee sounds like a lovely way to spend one. Lately, the small unplanned moments have been my favorite part of a week.\n\nWhat's a tiny ritual you look forward to?\n\nWarmly,\nAmara",
    createdAt: new Date("2026-10-25T10:00:00").getTime(),
    scheduledDeliveryAt: new Date("2026-10-25T10:12:00").getTime(),
    deliveredAt: new Date("2026-10-25T10:12:00").getTime(),
    readAt: null,
    status: "delivered",
    favorite: false,
    stampId: "pressed-flower",
    isDemoSample: true,
  }],
  letterDrafts: [],
  letterPreferences: defaultLetterPreferences,
  userStamps: [
    { stampId: "first-light", acquiredAt: 0 },
    { stampId: "pressed-flower", acquiredAt: 0 },
    { stampId: "little-postcard", acquiredAt: 0 },
  ],
};

type Store = {
  state: AppState;
  update: (patch: Partial<AppState> | ((current: AppState) => AppState)) => void;
};

const StoreContext = createContext<Store | null>(null);

function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("App state is unavailable.");
  return store;
}

function readSavedState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const saved = JSON.parse(raw) as Partial<AppState>;
    const savedPreferences = saved.letterPreferences;
    return {
      ...initialState,
      ...saved,
      letters: Array.isArray(saved.letters) ? saved.letters : initialState.letters,
      letterDrafts: Array.isArray(saved.letterDrafts) ? saved.letterDrafts : [],
      userStamps: Array.isArray(saved.userStamps) ? saved.userStamps : initialState.userStamps,
      letterPreferences: {
        ...defaultLetterPreferences,
        ...savedPreferences,
        deliveryTiers: {
          ...defaultLetterPreferences.deliveryTiers,
          ...savedPreferences?.deliveryTiers,
        },
      },
    };
  } catch (error) {
    console.error("Could not read the saved BEYOND demo state.", error);
    return initialState;
  }
}

function App() {
  const [state, setState] = useState<AppState>(readSavedState);
  const [arrivalMessage, setArrivalMessage] = useState("");
  const notifiedLetterIds = useRef(new Set<string>());
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Could not save the BEYOND demo state.", error);
    }
  }, [state]);

  useEffect(() => {
    const releaseDueLetters = () => {
      const now = Date.now();
      const { arrived } = deliverDueLetters(state.letters, now);
      if (!arrived.length) return;
      setState((current) => ({
        ...current,
        letters: deliverDueLetters(current.letters, now).letters,
      }));
      const newlyArrived = arrived.filter((letter) => {
        if (notifiedLetterIds.current.has(letter.id)) return false;
        notifiedLetterIds.current.add(letter.id);
        return true;
      });
      const receivedArrivals = newlyArrived.filter((letter) => letter.recipientId === demoUserId);
      if (!receivedArrivals.length) return;
      const preferences = state.letterPreferences;
      if (preferences.inAppArrivalNotifications && !isQuietHour(now, preferences)) {
        setArrivalMessage(receivedArrivals.length === 1 ? `A letter from ${profiles.find((profile) => profile.id === receivedArrivals[0].senderId)?.name ?? "a match"} has arrived.` : `${receivedArrivals.length} letters have arrived.`);
      }
    };
    releaseDueLetters();
    const timer = window.setInterval(releaseDueLetters, 5_000);
    return () => window.clearInterval(timer);
  }, [state.letters, state.letterPreferences]);

  const update = (patch: Partial<AppState> | ((current: AppState) => AppState)) => {
    setState((current) => typeof patch === "function" ? patch(current) : { ...current, ...patch });
  };

  return (
    <StoreContext.Provider value={{ state, update }}>
      {arrivalMessage && <div className="letter-arrival-toast" role="status"><span>{arrivalMessage}</span><button onClick={() => setArrivalMessage("")}>Dismiss</button></div>}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage register />} />
        <Route path="/about" element={<InfoPage title="More than a first impression." />} />
        <Route path="/safety" element={<InfoPage title="Connection should feel good." safety />} />
        <Route path="/app" element={<Navigate to="/app/discover" replace />} />
        <Route path="/app/*" element={state.signedIn ? <Application /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </StoreContext.Provider>
  );
}

function Landing() {
  const { state, update } = useStore();
  const navigate = useNavigate();
  const enter = () => {
    update({ signedIn: true });
    navigate("/app/discover");
  };
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link className="wordmark" to="/">BEYOND<span className="wordmark-dot">.</span></Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <Link to="/about">Our story</Link>
          <Link to="/safety">Safety</Link>
        </nav>
        <div className="landing-actions">
          <Link className="text-button" to={state.signedIn ? "/app/discover" : "/login"}>Log in</Link>
          <button className="button button-dark button-small" onClick={enter}>Start discovering</button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-line" /> A DIFFERENT KIND OF DATING</p>
          <h1>Your next connection is more than a <em>profile.</em></h1>
          <p className="hero-description">Meet people through personality, shared experiences, and conversations worth having.</p>
          <div className="hero-actions">
            <button className="button button-dark" onClick={enter}>Start discovering</button>
            <a className="text-link" href="#how-it-works">See how it works</a>
          </div>
          <div className="hero-note">
            <div className="mini-avatars" aria-hidden="true">
              {profiles.slice(0, 3).map((person) => <img key={person.id} src={person.photo} alt="" />)}
            </div>
            <span>For the stories that start after hello.</span>
          </div>
        </div>
        <div className="hero-art" aria-label="Meet some of the people you might connect with">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <article className="hero-person-card hero-card-main">
            <img src={profiles[2].photo} alt="Imani smiling outdoors" />
            <div className="hero-image-shade" />
            <div className="hero-card-tag">A little more than a photo</div>
            <div className="hero-person-info"><span>Imani, 26</span><small>Film, jazz & late dinners</small></div>
          </article>
          <article className="hero-person-card hero-card-top">
            <img src={profiles[0].photo} alt="Amara smiling" />
            <div className="hero-image-shade" />
            <div className="hero-person-info"><span>Amara, 27</span><small>Thoughtful & curious</small></div>
          </article>
          <article className="hero-person-card hero-card-bottom">
            <img src={profiles[1].photo} alt="Leo outdoors" />
            <div className="hero-image-shade" />
            <div className="hero-person-info"><span>Leo, 29</span><small>Always takes the scenic route</small></div>
          </article>
          <div className="hero-note-card"><span className="note-kicker">A GOOD PLACE TO BEGIN</span><span>What does a perfect Sunday look like to you?</span><small>And then the conversation begins.</small></div>
          <div className="hero-stamp">MORE<br />THAN<br />A MATCH</div>
        </div>
        <div className="hero-bottom-line"><span>01 — 06</span><span>People are more than their first impression.</span><span>SCROLL TO DISCOVER</span></div>
      </section>

      <section className="manifesto section-wrap" id="how-it-works">
        <div className="section-index">01 / THE IDEA</div>
        <div className="manifesto-body">
          <p className="eyebrow">THERE'S MORE TO YOU</p>
          <h2>There's more to you than a photo and a <em>bio.</em></h2>
          <p>Profiles are a starting point, not the whole story. BEYOND brings the things that make you you into the conversation, so a connection can begin somewhere more meaningful.</p>
          <a className="text-link" href="#discover">A little more about us</a>
        </div>
        <div className="manifesto-aside">
          <div className="quote-mark">“</div>
          <p>The best part of meeting someone is everything you couldn’t have guessed from their profile.</p>
          <span>THE BEYOND POINT OF VIEW</span>
        </div>
      </section>

      <section className="personality-section section-wrap">
        <div className="personality-copy">
          <p className="eyebrow">02 / GET TO KNOW YOURSELF</p>
          <h2>A little self-discovery goes a <em>long way.</em></h2>
          <p>A few thoughtful questions help you notice how you connect, communicate, and make room for the things that matter.</p>
          <button className="button button-outline" onClick={enter}>Meet your Personality DNA</button>
        </div>
        <div className="dna-card">
          <div className="dna-card-top"><span>YOUR PERSONALITY DNA</span><span>NOT A TEST. A STARTING POINT.</span></div>
          <h3>The way you connect</h3>
          <p>Small clues about the things that make a connection feel like yours.</p>
          {[
            ["Communication", 78],
            ["Curiosity", 91],
            ["Spontaneity", 64],
            ["Social energy", 72],
          ].map(([label, amount]) => (
            <div className="trait-meter" key={label}>
              <div><span>{label}</span><span>{amount}%</span></div>
              <div className="meter-track"><span style={{ width: `${amount}%` }} /></div>
            </div>
          ))}
          <small>Your answers, your interpretation. Always.</small>
        </div>
      </section>

      <section className="connection-section section-wrap" id="discover">
        <div className="connection-heading">
          <p className="eyebrow">03 / A BETTER FIRST HELLO</p>
          <h2>Meet beyond the <em>surface.</em></h2>
          <p>Shared interests can open the door. A thoughtful prompt can make you want to walk through it.</p>
        </div>
        <div className="prompt-preview">
          <div className="prompt-photo"><img src={profiles[4].photo} alt="Sana smiling" /></div>
          <div className="prompt-paper">
            <span className="note-kicker">SANA, 25 · JERSEY CITY</span>
            <h3>“A place that feels like me”</h3>
            <p>A tiny museum with nobody else in the room.</p>
            <span className="prompt-conversation">A lovely place to start a conversation.</span>
          </div>
        </div>
      </section>

      <section className="experiences-strip section-wrap">
        <div><p className="eyebrow">04 / CONVERSATIONS, IN FULL COLOR</p><h2>More than just <em>“hey”.</em></h2></div>
        <div className="experience-preview-grid">
          <ExperiencePreview number="01" title="Guess my answer" detail="How well were you listening?" theme="peach" />
          <ExperiencePreview number="02" title="A music date" detail="Trade a song with a story." theme="lilac" />
          <ExperiencePreview number="03" title="Movie night" detail="Find the one you both love." theme="cream" />
        </div>
      </section>

      <section className="final-cta">
        <p className="eyebrow">YOUR STORY STARTS HERE</p>
        <h2>Something real starts <em>beyond the profile.</em></h2>
        <p>Make room for the person, the conversation, and everything that comes next.</p>
        <button className="button button-light" onClick={enter}>Join BEYOND</button>
        <span className="final-cta-foot">MORE THAN A MATCH. A CHANCE TO MEET.</span>
      </section>

      <footer className="landing-footer">
        <Link className="wordmark" to="/">BEYOND<span className="wordmark-dot">.</span></Link>
        <span>For the stories that start after hello.</span>
        <div><Link to="/about">About</Link><Link to="/safety">Safety</Link><a href="mailto:hello@beyond.example">Contact</a></div>
        <small>© 2026 BEYOND. A prototype for meeting beyond the profile.</small>
      </footer>
    </main>
  );
}

function ExperiencePreview({ number, title, detail, theme }: { number: string; title: string; detail: string; theme: string }) {
  return <article className={`experience-preview ${theme}`}><span>{number} / EXPERIENCE</span><div className="preview-lines"><i /><i /><i /></div><h3>{title}</h3><p>{detail}</p></article>;
}

function AuthPage({ register = false }: { register?: boolean }) {
  const { update } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.includes("@") || password.length < 8) {
      setError("Enter a valid email address and a password of at least 8 characters.");
      return;
    }
    update({ signedIn: true, displayName: register ? email.split("@")[0] : "Jana" });
    navigate("/app/discover");
  };
  const demo = () => {
    update({ signedIn: true });
    navigate("/app/discover");
  };
  return (
    <main className="auth-page">
      <Link className="wordmark" to="/">BEYOND<span className="wordmark-dot">.</span></Link>
      <div className="auth-content">
        <p className="eyebrow">A GOOD PLACE TO BEGIN</p>
        <h1>{register ? "Make room for a new story." : "Welcome back to BEYOND."}</h1>
        <p className="auth-intro">This local prototype keeps your demo profile and activity in this browser.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
          <label>Password<input type="password" autoComplete={register ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark button-full" type="submit">{register ? "Create your demo profile" : "Continue"}</button>
        </form>
        <div className="auth-divider"><span /> OR <span /></div>
        <button className="button button-outline button-full" onClick={demo}>Enter the demo</button>
        <p className="auth-note">No email is sent. Authentication here is for prototype navigation only.</p>
        <p className="auth-switch">{register ? "Already have a profile?" : "New to BEYOND?"} <Link to={register ? "/login" : "/register"}>{register ? "Log in" : "Create a demo profile"}</Link></p>
      </div>
      <p className="auth-bottom">BEYOND — MORE THAN A MATCH</p>
    </main>
  );
}

function InfoPage({ title, safety = false }: { title: string; safety?: boolean }) {
  return (
    <main className="info-page">
      <Link className="wordmark" to="/">BEYOND<span className="wordmark-dot">.</span></Link>
      <div><p className="eyebrow">{safety ? "A LITTLE CARE GOES A LONG WAY" : "BEYOND THE PROFILE"}</p><h1>{title}</h1>
        <p>{safety ? "Your comfort matters. This prototype includes local controls to block a profile, manage what you share, and review privacy choices. It is a product demo, not a live safety or moderation service." : "We believe the best connections start when we make room for more of the person. BEYOND is a dating and social discovery prototype built around curiosity, shared experiences, and conversation."}</p>
        <Link className="button button-dark" to="/login">Explore the prototype</Link>
      </div>
      <Link className="back-home" to="/">Back to the beginning</Link>
    </main>
  );
}

const navigation = [
  { label: "Discover", path: "/app/discover" },
  { label: "Personality", path: "/app/personality" },
  { label: "Matches", path: "/app/matches" },
  { label: "Messages", path: "/app/messages" },
  { label: "Letters", path: "/app/letters" },
  { label: "Experiences", path: "/app/experiences" },
  { label: "My profile", path: "/app/profile" },
];

function Application() {
  const { state, update } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const active = navigation.find((item) => location.pathname.startsWith(item.path))?.label ?? "Discover";
  const signOut = () => {
    update({ signedIn: false });
    navigate("/login");
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="wordmark" to="/app/discover">BEYOND<span className="wordmark-dot">.</span></Link>
        <nav className="app-nav" aria-label="Application navigation">
          {navigation.map((item) => <Link key={item.path} className={active === item.label ? "active" : ""} to={item.path}>{item.label}</Link>)}
        </nav>
        <div className="app-header-right">
          <div className="mode-toggle" aria-label="Discovery mode">
            <button className={state.mode === "Dating" ? "selected" : ""} onClick={() => update({ mode: "Dating" })}>Dating</button>
            <button className={state.mode === "Friends" ? "selected" : ""} onClick={() => update({ mode: "Friends" })}>Friends</button>
          </div>
          <button className="avatar-button" onClick={() => navigate("/app/profile")} aria-label="Open your profile">{state.displayName.slice(0, 1).toUpperCase()}</button>
        </div>
      </header>
      <div className="prototype-notice"><span>DEMO SPACE</span><span>Profiles and activity are sample data saved only in this browser.</span><button onClick={signOut}>Exit demo</button></div>
      <main className="app-main">
        <Routes>
          <Route path="discover" element={<Discover />} />
          <Route path="personality" element={<Personality />} />
          <Route path="matches" element={<Matches />} />
          <Route path="messages" element={<Messages />} />
          <Route path="messages/:personId" element={<Messages />} />
          <Route path="letters/*" element={<Letters />} />
          <Route path="experiences/*" element={<Experiences />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/app/discover" replace />} />
        </Routes>
      </main>
      <footer className="app-footer"><span>BEYOND — MORE THAN A MATCH</span><div><Link to="/about">About</Link><Link to="/safety">Safety & privacy</Link><Link to="/app/settings">Settings</Link></div><span>Prototype build · {new Date().getFullYear()}</span></footer>
    </div>
  );
}

function Discover() {
  const { state, update } = useStore();
  const [intent, setIntent] = useState("Everyone");
  const [interest, setInterest] = useState("All interests");
  const [selected, setSelected] = useState<Profile | null>(null);
  useEffect(() => setIntent("Everyone"), [state.mode]);
  const eligible = useMemo(() => profiles.filter((person) =>
    canDiscoverProfile(person, state) &&
    (intent === "Everyone" || (state.mode === "Dating" ? person.intention.toLowerCase().includes(intent.toLowerCase()) : person.friendshipEligible)) &&
    (interest === "All interests" || person.interests.some((item) => item.toLowerCase().includes(interest.toLowerCase()))),
  ).sort((first, second) => compatibilityFor(second, state).score - compatibilityFor(first, state).score), [state, intent, interest]);
  const person = eligible[0];
  const compatibility = compatibilityFor(person ?? profiles[0], state);
  const canShowScore = compatibility.hasScore;
  const updateTimeline = (name: string) => ({
    id: `t-${Date.now()}`,
    title: name,
    detail: "A new moment from your BEYOND demo.",
    date: new Intl.DateTimeFormat("en", { month: "long", day: "numeric" }).format(new Date()),
  });
  const decide = (like: boolean) => {
    if (!person) return;
    if (!like) {
      update((current) => ({ ...current, passed: [...current.passed, person.id] }));
      return;
    }
    const isMutual = inboundLikes.includes(person.id);
    update((current) => ({
      ...current,
      liked: [...current.liked, person.id],
      matches: isMutual ? [...current.matches, person.id] : current.matches,
      timeline: isMutual ? [updateTimeline(`You and ${person.name} matched`), ...current.timeline] : current.timeline,
    }));
    if (isMutual) setSelected(person);
  };
  if (!person) return (
    <section className="empty-discover"><p className="eyebrow">THAT'S EVERYONE FOR NOW</p><h1>Good connections take their time.</h1><p>Try a different interest, or come back to this collection whenever you like.</p><button className="button button-outline" onClick={() => update({ passed: [], liked: [] })}>Start over with the demo profiles</button></section>
  );
  return (
    <>
      <div className="discover-head">
        <div><p className="eyebrow">{state.mode === "Dating" ? "A LITTLE MORE THAN A FIRST IMPRESSION" : "FRIENDSHIP, WITH A LITTLE MORE DEPTH"}</p><h1>{state.mode === "Dating" ? <>People worth <em>meeting.</em></> : <>People worth <em>knowing.</em></>}</h1><p>{state.mode === "Dating" ? "Thoughtful introductions, picked for the way you might connect." : "Meet people through shared interests, hobbies, and the conversations you both enjoy."}</p></div>
        <div className="discovery-count"><span>{String(eligible.length).padStart(2, "0")}</span><small>PEOPLE TO<br />DISCOVER</small></div>
      </div>
      <div className="filter-row">
        <label>{state.mode === "Dating" ? "Looking for" : "Discover"}
          <select value={intent} onChange={(event) => setIntent(event.target.value)}>{state.mode === "Dating" ? <><option>Everyone</option><option>Long-term</option><option>Exploring</option></> : <><option>Everyone</option><option>Creative friends</option></>}</select>
        </label>
        <label>Shared interest
          <select value={interest} onChange={(event) => setInterest(event.target.value)}><option>All interests</option><option>Music</option><option>films</option><option>Travel</option><option>Cooking</option><option>Books</option></select>
        </label>
        <span className="filter-explainer">Your age and location preferences are illustrative in this demo.</span>
      </div>
      <section className="discover-layout">
        <article className="discover-photo-card">
          <img key={person.id} className="discover-photo" src={person.photo} alt={`${person.name}, ${person.age}`} />
          <div className="photo-gradient" />
          <div className="photo-topline"><span>BEYOND THE PROFILE</span><span>{canShowScore ? `${compatibility.score}% COMPATIBILITY` : "A NEW INTRODUCTION"}</span></div>
          <div className="discover-photo-copy">
            <p>{person.city}</p><h2>{person.name}<span>, {person.age}</span></h2><p>{person.bio}</p>
            <div className="photo-tags">{person.traits.map((trait) => <span key={trait}>{trait}</span>)}</div>
          </div>
        </article>
        <aside className="discover-aside">
          <div className="compatibility-card">
            <p className="eyebrow">A REASON TO SAY HELLO</p><h3>A little common ground.</h3>
            <p>Your shared interests are a lovely place to start.</p>
            <div className="interest-list">{compatibility.shared.length ? compatibility.shared.map((item) => <span key={item}>{item}</span>) : <span>No shared interests yet</span>}</div>
            <div className="connection-score"><div className="score-ring"><strong>{canShowScore ? compatibility.score : "—"}</strong><small>{canShowScore ? "match" : "not scored"}</small></div><p>{canShowScore ? `${compatibility.shared.length} shared interest${compatibility.shared.length === 1 ? "" : "s"}${Object.keys(state.quizAnswers).length ? " and only the personality answers you've completed." : ". Complete Personality DNA to compare communication and lifestyle too."}` : "Complete Personality DNA to see a compatibility estimate based on your answers."}</p></div>
          </div>
          <div className="prompt-card">
            <span className="note-kicker">A QUESTION FOR {person.name.toUpperCase()}</span>
            <h3>{person.prompt}</h3><p>“{person.promptAnswer}”</p>
            <button className="prompt-start" onClick={() => setSelected(person)}>Read the full profile</button>
          </div>
          <div className="discovery-actions">
            <button className="button button-outline pass-button" onClick={() => decide(false)}>Pass for now</button>
            <button className="button button-dark like-button" onClick={() => decide(true)}>{state.mode === "Dating" ? `Like ${person.name}` : `Say hello to ${person.name}`}</button>
          </div>
          <button className="text-button profile-link" onClick={() => setSelected(person)}>Read {person.name}'s profile</button>
        </aside>
      </section>
      {selected && <ProfileModal person={selected} onClose={() => setSelected(null)} matched={state.matches.includes(selected.id)} />}
    </>
  );
}

function ProfileModal({ person, onClose, matched }: { person: Profile; onClose: () => void; matched?: boolean }) {
  const { state, update } = useStore();
  const navigate = useNavigate();
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><section className={`profile-modal ${matched ? "match-celebration" : ""}`} role="dialog" aria-modal="true" aria-label={matched ? "It's a connection" : `${person.name}'s profile`} onClick={(event) => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose}>Close</button><img src={person.photo} alt={`${person.name}`} /><div className="profile-modal-content">{matched ? <><p className="eyebrow">A MUTUAL CONNECTION</p><h2>It's a connection.</h2><p>You both wanted to know more about each other. This is a lovely place to begin.</p><div className="interest-list">{person.interests.slice(0, 3).map((interest) => <span key={interest}>{interest}</span>)}</div><button className="button button-dark" onClick={() => navigate(`/app/messages/${person.id}`)}>Send a message</button><button className="match-game-button" onClick={() => navigate("/app/experiences/chemistry")}>Play your first game</button><button className="match-keep-button" onClick={onClose}>Keep discovering</button></> : <><p className="eyebrow">{person.city.toUpperCase()}</p><h2>{person.name}, {person.age}</h2><p>{person.bio}</p><h3>A little about me</h3><div className="interest-list">{person.interests.map((interest) => <span key={interest}>{interest}</span>)}</div><h3>One way to say hello</h3><p className="modal-quote">“{person.promptAnswer}”</p><button className="button button-dark" onClick={() => {
      const mutual = inboundLikes.includes(person.id);
      update((current) => ({ ...current, liked: current.liked.includes(person.id) ? current.liked : [...current.liked, person.id], matches: mutual && !current.matches.includes(person.id) ? [...current.matches, person.id] : current.matches }));
      if (!mutual) onClose();
    }}>{state.mode === "Dating" ? `Like ${person.name}` : `Say hello to ${person.name}`}</button></>}</div>
  </section></div>;
}

function Personality() {
  const { state, update } = useStore();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [complete, setComplete] = useState(false);
  const answered = Object.keys(state.quizAnswers).length;
  const score = (index: number) => {
    const answer = state.quizAnswers[index];
    if (answer === undefined) return 50;
    return scorePersonalityAnswer(index, answer) ?? 50;
  };
  const begin = () => {
    setQuestionIndex(0);
    setComplete(false);
    setShowQuiz(true);
  };
  const answerQuestion = (answer: number) => {
    const next = { ...state.quizAnswers, [questionIndex]: answer };
    update({ quizAnswers: next });
    if (questionIndex === questions.length - 1) setComplete(true);
    else setQuestionIndex((index) => index + 1);
  };
  if (showQuiz && !complete) {
    const question = questions[questionIndex];
    return <section className="quiz-page">
      <button className="text-button quiz-exit" onClick={() => setShowQuiz(false)}>Exit questions</button>
      <div className="quiz-progress-label"><span>YOUR PERSONALITY DNA</span><span>{questionIndex + 1} OF {questions.length}</span></div>
      <div className="quiz-progress"><span style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} /></div>
      <p className="eyebrow">{question.dimension.toUpperCase()}</p><h1>{question.question}</h1><p className="quiz-hint">There are no right answers. Choose what feels most like you.</p>
      <div className="quiz-answers">{question.answers.map((answer, index) => <button key={answer} className="quiz-answer" onClick={() => answerQuestion(index)}><span className="answer-number">0{index + 1}</span><span>{answer}</span><span className="answer-select">Choose</span></button>)}</div>
    </section>;
  }
  if (complete) return <section className="quiz-complete"><p className="eyebrow">A LITTLE MORE YOU</p><h1>Your answers are part of your <em>story.</em></h1><p>Nothing here defines you. Think of it as a few thoughtful words for understanding how you like to connect.</p><div className="result-mini-grid">{questions.map((question, index) => <div key={question.dimension}><span>{question.dimension}</span><strong>{score(index)}<small>%</small></strong></div>)}</div><button className="button button-dark" onClick={() => { setShowQuiz(false); setComplete(false); }}>See your Personality DNA</button></section>;
  return <div className="personality-page">
    <div className="page-heading"><div><p className="eyebrow">A REFLECTION, NOT A LABEL</p><h1>Your Personality <em>DNA.</em></h1><p>A few clues about how you connect, communicate, and show up as yourself.</p></div><span className="results-count">{answered}/{questions.length}<small>QUESTIONS<br />ANSWERED</small></span></div>
    <div className="personality-columns"><section className="dna-results">
      <div className="results-title"><div><span className="eyebrow">THE WAY YOU CONNECT</span><h2>Your own kind of chemistry.</h2></div><span className="sample-tag">YOUR ANSWERS</span></div>
      {questions.map((question, index) => <div className="trait-meter app-meter" key={question.dimension}><div><span>{question.dimension}</span><span>{score(index)}%</span></div><div className="meter-track"><span style={{ width: `${score(index)}%` }} /></div></div>)}
      <p className="results-disclaimer">Your results are a playful reflection based on answers you choose to share, not a clinical assessment or compatibility guarantee.</p>
    </section><aside className="personality-aside"><p className="eyebrow">A LIVING PICTURE</p><h3>People change. Your answers can too.</h3><p>Take a short set of questions. Your responses stay in this browser and you can revisit them whenever you like.</p><button className="button button-dark button-full" onClick={begin}>{answered ? "Retake the questions" : "Start with 6 questions"}</button><small>Your results aren't shown to anyone unless you choose to share them.</small></aside></div>
    <div className="prompt-editor"><div><p className="eyebrow">UNSCRIPTED / TODAY'S PROMPT</p><h3>What's a small thing that instantly makes your day better?</h3></div><textarea value={state.promptAnswer} onChange={(event) => update({ promptAnswer: event.target.value })} placeholder="Write the answer you'd like someone to know…" maxLength={240} /><div className="prompt-editor-bottom"><label>Who can see your answer?<select value={state.promptVisibility} onChange={(event) => update({ promptVisibility: event.target.value as AppState["promptVisibility"] })}><option>Private</option><option>Matches</option><option>Profile</option></select></label><span>{state.promptAnswer.length}/240 · saved in this browser</span></div></div>
  </div>;
}

function Matches() {
  const { state, update } = useStore();
  const navigate = useNavigate();
  const matchedProfiles = profiles.filter((person) => state.matches.includes(person.id) && !state.blocked.includes(person.id));
  const unmatch = (id: string) => update((current) => ({ ...current, matches: current.matches.filter((match) => match !== id), messages: Object.fromEntries(Object.entries(current.messages).filter(([key]) => key !== id)) }));
  const block = (id: string) => update((current) => ({ ...current, blocked: [...new Set([...current.blocked, id])], matches: current.matches.filter((match) => match !== id) }));
  return <div className="matches-page">
    <div className="page-heading"><div><p className="eyebrow">THE BEGINNING OF SOMETHING</p><h1>Your <em>connections.</em></h1><p>A good conversation can start anywhere.</p></div><span className="results-count">{String(matchedProfiles.length).padStart(2, "0")}<small>GOOD REASONS<br />TO SAY HELLO</small></span></div>
    {matchedProfiles.length ? <div className="match-grid">{matchedProfiles.map((person) => <article className="match-card" key={person.id}><img src={person.photo} alt={person.name} /><div className="match-card-content"><span className="eyebrow">A MUTUAL CONNECTION</span><h2>{person.name}, {person.age}</h2><p>{person.interests.slice(0, 2).join(" · ")}</p><div className="match-card-actions"><button className="button button-dark" onClick={() => navigate(`/app/messages/${person.id}`)}>Open conversation</button><button className="text-button" onClick={() => navigate("/app/experiences/chemistry")}>Play together</button></div><details className="match-more"><summary>Connection options</summary><button onClick={() => unmatch(person.id)}>Unmatch</button><button onClick={() => block(person.id)}>Block this profile</button><Link to="/app/settings">Privacy and safety</Link></details></div></article>)}</div> : <EmptyState title="A good connection has room to grow." detail="When two people want to know more, you'll find your matches here." action="Discover people" onClick={() => navigate("/app/discover")} />}
    <section className="timeline-section"><div className="section-heading-row"><div><p className="eyebrow">LITTLE MOMENTS, KEPT</p><h2>Your connection timeline</h2></div><span>ONLY YOU CAN SEE THIS DEMO TIMELINE</span></div><div className="timeline-list">{state.timeline.map((item) => <article className="timeline-item" key={item.id}><span className="timeline-date">{item.date}</span><span className="timeline-dot" /><div><h3>{item.title}</h3><p>{item.detail}</p></div></article>)}</div><div className="passport-row"><div><span className="eyebrow">CONNECTION PASSPORT</span><h3>A collection of things you discover together.</h3></div><button className="button button-outline" onClick={() => navigate("/app/experiences")}>Explore experiences</button></div></section>
  </div>;
}

function EmptyState({ title, detail, action, onClick }: { title: string; detail: string; action: string; onClick: () => void }) {
  return <div className="empty-state"><span className="empty-rule" /><h2>{title}</h2><p>{detail}</p><button className="button button-outline" onClick={onClick}>{action}</button></div>;
}

function Messages() {
  const { personId = "amara" } = useParams();
  const { state, update } = useStore();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [gameOpen, setGameOpen] = useState(false);
  const [activity, setActivity] = useState("");
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [conversationQuery, setConversationQuery] = useState("");
  const person = profiles.find((item) => item.id === personId);
  const messages = state.messages[personId] ?? [];
  const conversationProfiles = profiles.filter((profile) => {
    const conversation = state.messages[profile.id] ?? [];
    const lastMessage = conversation.length ? conversation[conversation.length - 1].text : "";
    return state.matches.includes(profile.id) &&
      !state.blocked.includes(profile.id) &&
      `${profile.name} ${lastMessage}`.toLocaleLowerCase().includes(conversationQuery.trim().toLocaleLowerCase());
  });
  useEffect(() => { setDraft(""); }, [personId]);
  if (!person || !state.matches.includes(person.id) || state.blocked.includes(person.id)) return <EmptyState title="This conversation isn't available." detail="Your matched conversations will appear here." action="Back to matches" onClick={() => navigate("/app/matches")} />;
  const send = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > 1000) return;
    const message: ChatMessage = { id: `msg-${Date.now()}`, from: "you", text, time: new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date()) };
    update((current) => ({ ...current, messages: { ...current.messages, [personId]: [...(current.messages[personId] ?? []), message] } }));
    setDraft("");
  };
  const openGame = (name: string) => { setActivity(name); setAnswer(""); setRevealed(false); setGameOpen(true); };
  const completeGame = () => {
    setRevealed(true);
    const now = new Date();
    const result = `Demo activity completed: ${activity}. Your answer: ${answer}. The demo participant chose a slow Sunday and a really good book.`;
    const message: ChatMessage = { id: `activity-${now.getTime()}`, from: "you", text: result, time: new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(now) };
    update((current) => ({
      ...current,
      messages: { ...current.messages, [personId]: [...(current.messages[personId] ?? []), message] },
      timeline: [{ id: `t-${now.getTime()}`, title: `You played ${activity}`, detail: `You and ${person.name} compared answers in the BEYOND demo room.`, date: "Just now" }, ...current.timeline],
    }));
  };
  return <div className="messages-layout">
    <aside className="conversation-sidebar"><p className="eyebrow">YOUR CONVERSATIONS</p><h2>Messages</h2><label className="conversation-search"><span className="visually-hidden">Search conversations</span><input value={conversationQuery} onChange={(event) => setConversationQuery(event.target.value)} placeholder="Find a conversation" /></label>{conversationProfiles.map((profile) => { const conversation = state.messages[profile.id] ?? []; return <button key={profile.id} className={`conversation-row ${profile.id === personId ? "selected" : ""}`} onClick={() => navigate(`/app/messages/${profile.id}`)}><img src={profile.photo} alt="" /><span><strong>{profile.name}</strong><small>{conversation.length ? conversation[conversation.length - 1].text : "Start a new conversation"}</small></span></button>; })}{conversationProfiles.length === 0 && <p className="empty-inline">No conversations match that search.</p>}<button className="messages-browse" onClick={() => navigate("/app/matches")}>See all matches</button></aside>
    <section className="conversation-panel">
      <header className="conversation-header"><img src={person.photo} alt="" /><div><h2>{person.name}</h2><span>Matched through shared interests</span></div><button className="text-button" onClick={() => setGameOpen(true)}>Play together</button></header>
      <div className="conversation-context"><span className="context-line" /><p>YOU BOTH WANTED TO KNOW MORE</p><span className="context-line" /></div>
      <div className="message-list" aria-live="polite">{messages.map((message) => <article className={`message ${message.from === "you" ? "outgoing" : "incoming"}`} key={message.id}><p>{message.text}</p><time>{message.time}</time></article>)}{messages.length === 0 && <p className="first-message">A blank page. A good place to begin.</p>}</div>
      <div className="chat-action-row"><button onClick={() => setGameOpen(true)}>Play together</button><button onClick={() => navigate("/app/experiences/music")}>Music date</button><button onClick={() => navigate("/app/experiences/movies")}>Movie date</button><button onClick={() => setDraft("I have a question for you: ")}>Conversation prompt</button><button onClick={() => navigate(`/app/letters/compose?conversation=${person.id}`)}>Write a letter</button></div>
      <form className="message-composer" onSubmit={send}><label className="visually-hidden" htmlFor="message-input">Write a message</label><textarea id="message-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Write ${person.name} a message…`} maxLength={1000} rows={1} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="button button-dark" type="submit" disabled={!draft.trim()}>Send</button></form>
      <p className="chat-disclaimer">Demo messages are stored only in this browser. No other person receives them.</p>
    </section>
    {gameOpen && <div className="modal-backdrop" role="presentation" onClick={() => setGameOpen(false)}><section className="game-modal" role="dialog" aria-modal="true" aria-label="Play together" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setGameOpen(false)}>Close</button>{!activity ? <><p className="eyebrow">A LITTLE SOMETHING TO DO TOGETHER</p><h2>Play together.</h2><p>Pick a quick activity. You can always come back to the conversation.</p><div className="game-choice-list">{["Would You Rather", "Guess My Answer", "Two Truths and a Lie", "The Question Ladder"].map((game) => <button key={game} onClick={() => openGame(game)}><span>{game}</span><span>Start</span></button>)}</div><p className="simulation-note">These are single-browser demo activities. The other participant is a clearly labeled simulation.</p></> : <><p className="eyebrow">CHEMISTRY ROOM / DEMO ACTIVITY</p><h2>{activity}</h2><p className="demo-sim-label">You are playing with the BEYOND demo simulation.</p><p className="game-question">{activity === "Would You Rather" ? "A slow Sunday with a great book, or a spontaneous day trip?" : activity === "Guess My Answer" ? "Which setting would make your ideal first date?" : activity === "Two Truths and a Lie" ? "Pick a topic for your three statements." : "What is something you could talk about all evening?"}</p>{activity === "Would You Rather" ? <div className="game-options"><button className={answer === "A slow Sunday" ? "chosen" : ""} onClick={() => setAnswer("A slow Sunday")}>A slow Sunday with a great book</button><button className={answer === "A spontaneous trip" ? "chosen" : ""} onClick={() => setAnswer("A spontaneous trip")}>A spontaneous day trip</button></div> : <label className="game-answer-label">Your answer<input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Write what feels true for you" maxLength={240} /></label>}{revealed ? <div className="reveal-card"><span className="eyebrow">THE ANSWERS ARE IN</span><p>You chose <strong>{answer || "to pass this question"}</strong>. The demo participant chose <strong>a slow Sunday and a really good book</strong>.</p><small>Demo simulation answer — not a message from another person.</small></div> : <button className="button button-dark button-full" disabled={!answer.trim()} onClick={completeGame}>Submit my answer</button>}</>}</section></div>}
  </div>;
}

function Experiences() {
  const { state, update } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("Overview");
  useEffect(() => {
    const path = location.pathname;
    setActiveTab(path.endsWith("/chemistry") ? "Chemistry room" : path.endsWith("/music") ? "Music date" : path.endsWith("/movies") ? "Movie night" : "Overview");
  }, [location.pathname]);
  const playlist = songs.filter((song) => state.playlist.includes(song.title));
  const watched = movies.filter((movie) => state.watchlist.includes(movie.title));
  const addSong = (title: string) => update((current) => ({ ...current, playlist: current.playlist.includes(title) ? current.playlist : [...current.playlist, title], timeline: [{ id: `t-${Date.now()}`, title: "A song joined your playlist", detail: `${title} is now in your shared demo playlist.`, date: "Just now" }, ...current.timeline] }));
  const removeSong = (title: string) => update((current) => ({ ...current, playlist: current.playlist.filter((item) => item !== title) }));
  const toggleMovie = (title: string) => update((current) => ({ ...current, watchlist: current.watchlist.includes(title) ? current.watchlist.filter((item) => item !== title) : [...current.watchlist, title] }));
  return <div className="experiences-page">
    <div className="page-heading"><div><p className="eyebrow">THE GOOD STUFF HAPPENS TOGETHER</p><h1>Make a little <em>room.</em></h1><p>Small shared experiences. A new way to keep the conversation going.</p></div></div>
    <div className="experience-tabs" role="tablist">{["Overview", "Chemistry room", "Music date", "Movie night"].map((tab) => <button role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
    {(activeTab === "Overview" || activeTab === "Chemistry room") && <section className="chemistry-feature"><div className="chemistry-feature-copy"><p className="eyebrow">01 / CHEMISTRY ROOM</p><h2>Good questions. Better <em>conversations.</em></h2><p>A low-pressure way to find out what makes each other tick. Take turns, share your answer, then see what you have in common.</p><button className="button button-dark" onClick={() => navigate(`/app/messages/${state.matches[0] ?? "amara"}`)}>Choose a conversation partner</button><small>Single-browser demo. A simulated participant is clearly identified in each activity.</small></div><div className="chemistry-question"><span>ONE QUESTION TO START</span><h3>What's something you could talk about for hours?</h3><div className="chemistry-answers"><span>That tiny restaurant you found last month</span><span>A place you still dream about visiting</span></div><small>Answer first. Reveal together.</small></div></section>}
    {(activeTab === "Overview" || activeTab === "Music date") && <section className="media-section music-section"><div className="media-heading"><div><p className="eyebrow">02 / MUSIC DATE</p><h2>Trade a song. Tell its <em>story.</em></h2><p>A demo catalog for music sharing and playlist building. No playback is provided.</p></div><span className="sample-tag">DEMO CATALOG</span></div><div className="music-layout"><div className="song-catalog">{songs.map((song) => <article className="song-card" key={song.title}><div className={`album-art ${song.color}`}><span>{song.title.split(" ").map((word) => word[0]).join("")}</span></div><div className="song-info"><h3>{song.title}</h3><p>{song.artist}</p><small>{song.tone}</small></div><button className={`add-song ${state.playlist.includes(song.title) ? "in-playlist" : ""}`} onClick={() => state.playlist.includes(song.title) ? removeSong(song.title) : addSong(song.title)}>{state.playlist.includes(song.title) ? "Added" : "Add song"}</button></article>)}</div><aside className="playlist-panel"><p className="eyebrow">YOUR SHARED PLAYLIST</p><h3>The songs between you.</h3><p>{playlist.length} {playlist.length === 1 ? "song" : "songs"} collected together.</p>{playlist.length ? playlist.map((song) => <div className="playlist-track" key={song.title}><span>{song.title}</span><button onClick={() => removeSong(song.title)}>Remove</button></div>) : <div className="empty-inline">Pick a song to start collecting.</div>}<small>Music is metadata-only in this demo. Open songs in an official music service to listen.</small></aside></div></section>}
    {(activeTab === "Overview" || activeTab === "Movie night") && <section className="media-section movie-section"><div className="media-heading"><div><p className="eyebrow">03 / MOVIE NIGHT</p><h2>Find the film you both <em>love.</em></h2><p>A small demo watchlist, made for choosing what to watch next.</p></div><span className="sample-tag">DEMO FILM LIST</span></div><div className="movie-grid">{movies.map((movie) => <article className="movie-card" key={movie.title}><img src={movie.image} alt="" loading="lazy" /><div><small>{movie.detail}</small><h3>{movie.title}</h3><button className={`button ${state.watchlist.includes(movie.title) ? "button-dark" : "button-outline"}`} onClick={() => toggleMovie(movie.title)}>{state.watchlist.includes(movie.title) ? "On your list" : "Add to watchlist"}</button></div></article>)}</div><div className="watchlist-summary"><span>YOUR WATCHLIST</span><strong>{watched.length} {watched.length === 1 ? "film" : "films"} picked out</strong><small>Film details are sample metadata. This prototype does not stream movies.</small></div></section>}
    {activeTab === "Overview" && <section className="mystery-dates"><div><p className="eyebrow">04 / MYSTERY DATES</p><h2>Pick a feeling. Let the date <em>unfold.</em></h2></div><div className="date-type-row">{["Coffee and good questions", "Midnight talks", "A tiny adventure", "Dreaming up a future"].map((date, index) => <article className={`date-type date-type-${index}`} key={date}><span>0{index + 1} / DATE IDEA</span><h3>{date}</h3><p>{["Warm drinks, favorite memories, and a little room to laugh.", "The quieter, more thoughtful questions after dark.", "Make up a trip together and see where you end up.", "A playful look at the places and routines you love."][index]}</p><button onClick={() => setActiveTab("Chemistry room")}>Explore the idea</button></article>)}</div></section>}
  </div>;
}

function Letters() {
  const { state, update } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "travelling" | "received" | "sent" | "favorites" | "drafts">("all");
  const [visibleCount, setVisibleCount] = useState(10);
  const subpath = location.pathname.replace(/^\/app\/letters\/?/, "");
  const allLetters = state.letters.filter((letter) =>
    (letter.senderId === demoUserId || letter.recipientId === demoUserId) &&
    state.matches.includes(letter.conversationId) &&
    !state.blocked.includes(letter.conversationId),
  );
  const mutualMatches = profiles.filter((person) =>
    state.matches.includes(person.id) && !state.blocked.includes(person.id),
  );
  const letter = allLetters.find((item) => item.id === subpath);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const openLetter = (item: Letter) => {
    if (item.recipientId === demoUserId && item.status !== "travelling" && item.status !== "deleted" && item.status !== "read") {
      update((current) => ({
        ...current,
        letters: current.letters.map((saved) =>
          saved.id === item.id ? { ...saved, status: "read", readAt: Date.now() } : saved,
        ),
      }));
    }
    navigate(`/app/letters/${item.id}`);
  };

  const updateLetter = (id: string, patch: Partial<Letter>) => {
    update((current) => ({
      ...current,
      letters: current.letters.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  };

  if (subpath === "compose") {
    const conversation = new URLSearchParams(location.search).get("conversation") ?? "";
    return <LetterComposer
      conversationId={conversation}
      matches={mutualMatches}
      onCancel={() => navigate("/app/letters")}
      onSend={(recipient, subject, body, stampId, photoDataUrl) => {
        const createdAt = Date.now();
        const id = `letter-${crypto.randomUUID()}`;
        const item: Letter = {
          id,
          conversationId: recipient.id,
          senderId: demoUserId,
          recipientId: recipient.id,
          subject: subject.trim(),
          body: body.trim(),
          createdAt,
          scheduledDeliveryAt: calculateLetterDelivery(createdAt, id, state.letterPreferences),
          deliveredAt: null,
          readAt: null,
          status: "travelling",
          favorite: false,
          stampId,
          ...(photoDataUrl ? { photoDataUrl } : {}),
        };
        const existingIncoming = state.letters.some((saved) => saved.conversationId === recipient.id && saved.recipientId === demoUserId && saved.status !== "deleted");
        const hasEarned = state.userStamps.some((owned) => owned.stampId === "shared-chapter");
        update((current) => ({
          ...current,
          letters: [item, ...current.letters],
          letterDrafts: current.letterDrafts.filter((draft) => draft.conversationId !== recipient.id || draft.userId !== demoUserId),
          userStamps: existingIncoming && !hasEarned
            ? [...current.userStamps, { stampId: "shared-chapter", acquiredAt: createdAt }]
            : current.userStamps,
        }));
        navigate("/app/letters");
      }}
    />;
  }
  if (subpath === "settings") return <SlowDatingSettings />;
  if (subpath === "stamps") return <StampCollection />;
  if (subpath && letter) {
    const person = profiles.find((profile) => profile.id === letter.conversationId);
    if (!person || !canAccessLetter(letter, demoUserId, state)) {
      return <EmptyState title="This letter isn't available." detail="Letters are private and only available to matched participants in this demo." action="Back to letters" onClick={() => navigate("/app/letters")} />;
    }
    const isRecipient = letter.recipientId === demoUserId;
    const stamp = letterStamps.find((item) => item.id === letter.stampId);
    return <section className="letter-reading">
      <button className="text-button letter-back" onClick={() => navigate("/app/letters")}>Back to your letters</button>
      <article className={`letter-paper ${letter.status === "travelling" ? "letter-paper-travelling" : ""}`}>
        <div className="letter-paper-top"><span className="eyebrow">{isRecipient ? "A LETTER FOR YOU" : "A LETTER YOU SENT"}</span><button className={`letter-favorite ${letter.favorite ? "favorited" : ""}`} onClick={() => updateLetter(letter.id, { favorite: !letter.favorite })}>{letter.favorite ? "Remove favorite" : "Save to favorites"}</button></div>
        <div className={`letter-stamp-art stamp-${stamp?.id ?? "first-light"}`}><span>{stamp?.name ?? "First Light"}</span></div>
        {letter.status === "travelling" ? <LetterJourney letter={letter} now={now} recipientName={person.name} /> : <>
          {letter.isDemoSample && <span className="sample-tag">SEEDED DEMO LETTER</span>}
          <h1>{letter.subject || "A letter for you"}</h1>
          <p className="letter-byline">From {isRecipient ? person.name : "you"} · {new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(letter.createdAt)}</p>
          <div className="letter-body">{letter.body}</div>
          {letter.photoDataUrl && <img className="letter-photo-attachment" src={letter.photoDataUrl} alt="Photo attached to this private letter" />}
          <div className="letter-paper-footer">{letter.readAt ? `Read ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(letter.readAt)}` : "Take your time. This letter is yours to keep."}</div>
          <div className="letter-reading-actions">
            {isRecipient && <button className="button button-dark" onClick={() => navigate(`/app/letters/compose?conversation=${person.id}`)}>Write a reply</button>}
            {!isRecipient && <span className="letter-status-chip">{letter.status === "read" && state.letterPreferences.shareReadReceipts ? "Read by the recipient" : "Delivery simulation complete"}</span>}
            {!isRecipient && <button className="button button-outline" onClick={() => {
              if (!window.confirm("Remove this letter from your archive? The demo keeps a deletion marker in this browser.")) return;
              updateLetter(letter.id, { status: "deleted", body: "", subject: "" });
              navigate("/app/letters");
            }}>Delete my letter</button>}
          </div>
          <p className="letter-private-note">Private to this matched conversation. Not visible on either profile.</p>
        </>}
      </article>
    </section>;
  }

  const filtered = allLetters
    .filter((item) => item.status !== "deleted")
    .filter((item) => filter !== "drafts" && (filter === "all" ||
      (filter === "travelling" && item.status === "travelling") ||
      (filter === "received" && item.recipientId === demoUserId) ||
      (filter === "sent" && item.senderId === demoUserId) ||
      (filter === "favorites" && item.favorite)))
    .filter((item) => {
      const person = profiles.find((profile) => profile.id === item.conversationId);
      return `${item.subject} ${item.body} ${person?.name ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    })
    .sort((first, second) => second.createdAt - first.createdAt);
  const matchingDrafts = state.letterDrafts.filter((draft) =>
    `${draft.subject} ${draft.body} ${profiles.find((person) => person.id === draft.conversationId)?.name ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const unreadArrivals = allLetters.filter((item) => item.recipientId === demoUserId && item.status === "delivered");
  return <section className="letters-page">
    <div className="page-heading"><div><p className="eyebrow">A SLOWER WAY TO GET TO KNOW SOMEONE</p><h1>Letters, at your <em>own pace.</em></h1><p>A little more space to think. A little more to say.</p></div><div className="letter-page-actions"><button className="button button-outline" onClick={() => navigate("/app/letters/stamps")}>Your stamps</button><button className="button button-dark" onClick={() => navigate("/app/letters/settings")}>Slow Dating settings</button></div></div>
    <div className="letter-demo-boundary"><strong>LOCAL DEMO DELIVERY</strong><span>Arrival times here are simulated in this browser. Real server-enforced delivery and cross-device sync need a backend that this project does not have.</span></div>
    {unreadArrivals.length > 0 && state.letterPreferences.inAppArrivalNotifications && <div className="letter-arrival-banner" role="status"><span>{unreadArrivals.length === 1 ? `A letter from ${profiles.find((item) => item.id === unreadArrivals[0].senderId)?.name ?? "your match"} is waiting for you.` : `${unreadArrivals.length} letters are waiting for you.`}</span><span>Read when you're ready.</span></div>}
    <div className="letters-controls"><div className="letter-filters" role="tablist" aria-label="Filter letters">{(["all", "travelling", "received", "sent", "favorites", "drafts"] as const).map((value) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? "active" : ""} onClick={() => { setFilter(value); setVisibleCount(10); }}>{value === "all" ? "All letters" : value === "travelling" ? "On their way" : value[0].toUpperCase() + value.slice(1)}</button>)}</div><label className="letter-search"><span className="visually-hidden">Search your letters</span><input value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(10); }} placeholder="Search your own letters" /></label></div>
    {matchingDrafts.length > 0 && filter !== "travelling" && filter !== "received" && filter !== "sent" && filter !== "favorites" && <section className="letter-drafts-section"><div className="letter-section-heading"><h2>Letters still taking shape</h2><span>{matchingDrafts.length} saved draft{matchingDrafts.length === 1 ? "" : "s"}</span></div><div className="letter-list">{matchingDrafts.map((draft) => {
      const person = profiles.find((profile) => profile.id === draft.conversationId);
      if (!person) return null;
      return <article className="letter-list-card letter-draft-card" key={`draft-${draft.conversationId}`}><div className="letter-list-avatar"><img src={person.photo} alt="" /></div><div className="letter-list-content"><div className="letter-list-meta"><span>Draft for {person.name}</span><time>Saved {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(draft.updatedAt)}</time></div><h2>{draft.subject || "Untitled letter"}</h2><p>{draft.body.replace(/\s+/g, " ").slice(0, 130) || "Your first words are waiting here."}</p><span className="letter-status status-draft">Saved privately on this device</span></div><div className="draft-actions"><button className="button button-outline letter-open-button" onClick={() => navigate(`/app/letters/compose?conversation=${person.id}`)}>Continue draft</button><button className="draft-delete" onClick={() => update((current) => ({ ...current, letterDrafts: current.letterDrafts.filter((saved) => saved.conversationId !== draft.conversationId) }))}>Delete draft</button></div></article>;
    })}</div></section>}
    {filtered.length > 0 && <div className="letter-list">
      {filtered.slice(0, visibleCount).map((item) => {
        const person = profiles.find((profile) => profile.id === item.conversationId);
        if (!person) return null;
        const sentByYou = item.senderId === demoUserId;
        const waiting = item.status === "travelling" && item.scheduledDeliveryAt > now;
        const statusText = waiting ? "Travelling to your match" : sentByYou ? (item.status === "read" && state.letterPreferences.shareReadReceipts ? "Read by recipient" : "Delivery simulated in this browser") : item.status === "read" ? "Opened by you" : "Delivered";
        return <article className={`letter-list-card ${waiting ? "is-travelling" : ""}`} key={item.id}>
          <div className="letter-list-avatar"><img src={person.photo} alt="" /></div>
          <div className="letter-list-content"><div className="letter-list-meta"><span>{sentByYou ? `To ${person.name}` : `From ${person.name}`}</span><time>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(item.createdAt)}</time></div><h2>{item.subject || "A letter for you"}</h2><p>{waiting ? "A little note is making its way to them." : item.body.replace(/\s+/g, " ").slice(0, 130)}</p><span className={`letter-status status-${item.status}`}>{statusText}</span></div>
          {waiting ? <div className="letter-mini-journey" aria-label={`Estimated arrival ${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(item.scheduledDeliveryAt)}`}><span className="journey-track"><span style={{ width: `${Math.min(96, Math.max(8, (1 - (item.scheduledDeliveryAt - now) / Math.max(1, item.scheduledDeliveryAt - item.createdAt)) * 100))}%` }} /></span><small>Est. {new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(item.scheduledDeliveryAt)}</small><button className="letter-journey-link" onClick={() => openLetter(item)}>View journey</button></div> : <button className="button button-outline letter-open-button" onClick={() => openLetter(item)}>{item.recipientId === demoUserId ? "Open letter" : "View letter"}</button>}
        </article>;
      })}
      {filtered.length > visibleCount && <button className="button button-outline load-more-letters" onClick={() => setVisibleCount((count) => count + 10)}>Load more letters</button>}
    </div>}
    {filter === "drafts" && matchingDrafts.length === 0 && <div className="letter-empty"><p className="eyebrow">NO SAVED DRAFTS</p><h2>A good letter can take its time.</h2><p>Your drafts stay private on this device until you're ready to send.</p></div>}
    {filter !== "drafts" && filtered.length === 0 && (filter !== "all" || matchingDrafts.length === 0) && <div className="letter-empty"><span className="paper-rule" /><p className="eyebrow">{search ? "NO LETTERS FOUND" : "A LITTLE ROOM TO BEGIN"}</p><h2>{search ? "Nothing in your archive matches that search." : "A thoughtful letter can start anywhere."}</h2><p>{search ? "Try another name, subject, or phrase from one of your letters." : "Choose a prompt, or tell someone on your matches list something you haven't said yet."}</p>{!search && <><div className="letter-empty-prompts">{letterPrompts.map((prompt) => <button key={prompt} onClick={() => navigate(`/app/letters/compose?conversation=${mutualMatches[0]?.id ?? ""}&prompt=${encodeURIComponent(prompt)}`)}>{prompt}</button>)}</div><button className="button button-dark" onClick={() => navigate("/app/letters/compose")}>Write your first letter</button></>}</div>}
    <div className="letter-consent-note"><span>YOUR MATCHES</span>{mutualMatches.filter((person) => person.slowDatingEnabled).length} match{mutualMatches.filter((person) => person.slowDatingEnabled).length === 1 ? "" : "es"} has opted into Slow Dating in this demo. You can only write to a mutual match who has enabled it.</div>
  </section>;
}

function LetterComposer({ conversationId, matches, onCancel, onSend }: {
  conversationId: string;
  matches: Profile[];
  onCancel: () => void;
  onSend: (recipient: Profile, subject: string, body: string, stampId: string, photoDataUrl?: string) => void;
}) {
  const { state, update } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const availableMatches = matches.filter((person) => canSendLetter(person.id, state, profiles));
  const initialConversation = availableMatches.some((person) => person.id === conversationId) ? conversationId : availableMatches[0]?.id ?? "";
  const [selectedMatch, setSelectedMatch] = useState(initialConversation);
  const initialDraft = state.letterDrafts.find((draft) => draft.userId === demoUserId && draft.conversationId === initialConversation);
  const [subject, setSubject] = useState(initialDraft?.subject ?? "");
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [stampId, setStampId] = useState(initialDraft?.stampId ?? "first-light");
  const [photoDataUrl, setPhotoDataUrl] = useState(initialDraft?.photoDataUrl ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const draftTimer = useRef(0);
  const params = new URLSearchParams(location.search);
  const prompt = params.get("prompt");

  useEffect(() => {
    const draft = state.letterDrafts.find((item) => item.userId === demoUserId && item.conversationId === selectedMatch);
    setSubject(draft?.subject ?? "");
    setBody(draft?.body ?? "");
    setStampId(draft?.stampId ?? "first-light");
    setPhotoDataUrl(draft?.photoDataUrl ?? "");
  }, [selectedMatch]);

  useEffect(() => {
    if (!selectedMatch) return;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      if (!subject.trim() && !body.trim() && !photoDataUrl) {
        update((current) => ({ ...current, letterDrafts: current.letterDrafts.filter((item) => item.userId !== demoUserId || item.conversationId !== selectedMatch) }));
        return;
      }
      const draft: LetterDraft = { userId: demoUserId, conversationId: selectedMatch, subject, body, stampId, updatedAt: Date.now(), ...(photoDataUrl ? { photoDataUrl } : {}) };
      update((current) => ({
        ...current,
        letterDrafts: [
          ...current.letterDrafts.filter((item) => item.userId !== demoUserId || item.conversationId !== selectedMatch),
          draft,
        ],
      }));
    }, 350);
    return () => window.clearTimeout(draftTimer.current);
  }, [selectedMatch, subject, body, stampId, photoDataUrl]);

  useEffect(() => {
    if (!prompt || body || !selectedMatch) return;
    setBody(`${prompt}\n\n`);
  }, [prompt, selectedMatch]);

  if (!state.letterPreferences.slowDatingEnabled) return <div className="letter-compose-locked"><p className="eyebrow">SLOW DATING IS PAUSED</p><h1>Letters can wait.</h1><p>Turn Slow Dating back on when you'd like to start or continue writing letters. Your sent and received letters remain in your archive.</p><button className="button button-dark" onClick={() => navigate("/app/letters/settings")}>Open Slow Dating settings</button></div>;
  if (!availableMatches.length) return <EmptyState title="Letters start with mutual consent." detail="You need a match who has also opted into Slow Dating before you can write a private letter." action="Back to letters" onClick={onCancel} />;
  const recipient = availableMatches.find((person) => person.id === selectedMatch);
  const saveDraftNow = () => {
    if (!selectedMatch) return;
    window.clearTimeout(draftTimer.current);
    if (!subject.trim() && !body.trim() && !photoDataUrl) {
      update((current) => ({ ...current, letterDrafts: current.letterDrafts.filter((item) => item.userId !== demoUserId || item.conversationId !== selectedMatch) }));
      return;
    }
    const draft: LetterDraft = { userId: demoUserId, conversationId: selectedMatch, subject, body, stampId, updatedAt: Date.now(), ...(photoDataUrl ? { photoDataUrl } : {}) };
    update((current) => ({
      ...current,
      letterDrafts: [...current.letterDrafts.filter((item) => item.userId !== demoUserId || item.conversationId !== selectedMatch), draft],
    }));
  };
  const send = () => {
    if (submitting) return;
    if (!recipient) { setError("Choose a mutual match who has enabled Slow Dating."); return; }
    if (body.trim().length < 20) { setError("Write at least 20 characters so your letter has room to breathe."); return; }
    if (subject.trim().length > 80 || body.length > 5000) { setError("Your subject or letter is longer than the limit."); return; }
    setSubmitting(true);
    onSend(recipient, subject, body, stampId, photoDataUrl || undefined);
  };
  const attachPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPEG, PNG, or WebP image."); return; }
    if (file.size > 400_000) { setError("Letter photos must be smaller than 400 KB in this browser demo."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPhotoDataUrl(reader.result);
      else setError("This image could not be previewed.");
    };
    reader.onerror = () => setError("This image could not be read.");
    reader.readAsDataURL(file);
    event.target.value = "";
  };
  return <section className="letter-composer-page">
    <button className="text-button letter-back" onClick={() => { saveDraftNow(); onCancel(); }}>Back to your letters</button>
    <div className="letter-compose-heading"><p className="eyebrow">TAKE YOUR TIME</p><h1>Write a <em>letter.</em></h1><p>No rush to find the perfect words. Your draft saves as you write.</p></div>
    <article className="letter-composer-paper">
      <div className="composer-row composer-recipient"><label>Writing to<select value={selectedMatch} onChange={(event) => setSelectedMatch(event.target.value)}>{availableMatches.map((person) => <option value={person.id} key={person.id}>{person.name} · mutual match</option>)}</select></label><span>Letters stay private to your conversation.</span></div>
      <label className="subject-label">Subject <span>OPTIONAL · {subject.length}/80</span><input value={subject} onChange={(event) => setSubject(event.target.value.slice(0, 80))} placeholder="A small thought for you" maxLength={80} /></label>
      <label className="letter-body-label">Your letter<textarea value={body} onChange={(event) => setBody(event.target.value.slice(0, 5000))} placeholder="Begin wherever feels right…" maxLength={5000} rows={13} /><span>{body.length}/5,000 characters · saved automatically</span></label>
      <div className="letter-photo-field"><label className="upload-button">Add an optional photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={attachPhoto} /></label><small>JPEG, PNG, or WebP · up to 400 KB · private to this letter</small>{photoDataUrl && <div className="letter-photo-preview"><img src={photoDataUrl} alt="Letter attachment preview" /><button type="button" onClick={() => setPhotoDataUrl("")}>Remove photo</button></div>}</div>
      <div className="stamp-picker"><span className="note-kicker">CHOOSE A FREE STAMP</span><div>{state.userStamps.map((owned) => { const stamp = letterStamps.find((item) => item.id === owned.stampId); if (!stamp) return null; return <button type="button" className={stampId === stamp.id ? "selected" : ""} key={stamp.id} onClick={() => setStampId(stamp.id)}><span className={`letter-stamp-art stamp-${stamp.id}`}><span>{stamp.name}</span></span><small>{stamp.name}</small></button>; })}</div><button className="stamp-collection-link" onClick={() => navigate("/app/letters/stamps")}>See your collection</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!state.letterPreferences.slowDatingEnabled && <p className="form-error">Slow Dating is paused.</p>}
      <div className="letter-compose-footer"><span>Delivery timing uses a selected approximate demo tier. It is not server-enforced.</span><div><button className="button button-outline" onClick={() => { saveDraftNow(); onCancel(); }}>Keep as draft</button><button className="button button-dark" disabled={submitting} onClick={send}>{submitting ? "Sending…" : "Send letter"}</button></div></div>
    </article>
  </section>;
}

function LetterJourney({ letter, now, recipientName }: { letter: Letter; now: number; recipientName: string }) {
  const remaining = Math.max(0, letter.scheduledDeliveryAt - now);
  const progress = Math.min(96, Math.max(8, (1 - remaining / Math.max(1, letter.scheduledDeliveryAt - letter.createdAt)) * 100));
  const minutes = Math.ceil(remaining / 60_000);
  return <div className="letter-journey-view">
    <span className="journey-envelope" aria-hidden="true"><span /></span>
    <p className="eyebrow">A NOTE ON ITS WAY</p><h1>Your letter is travelling.</h1>
    <p>A little space to let a thoughtful note find its way to {recipientName}.</p>
    <div className="journey-route"><span>YOU</span><div className="journey-track"><span style={{ width: `${progress}%` }} /></div><span>{recipientName.toUpperCase()}</span></div>
    <div className="journey-arrival">Estimated arrival <strong>{new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(letter.scheduledDeliveryAt)}</strong><small>{minutes ? `About ${minutes} ${minutes === 1 ? "minute" : "minutes"} remaining` : "Almost there"}</small></div>
    <p className="letter-local-warning">This is a local prototype timer based on your selected distance tier. The recipient cannot be shown a server-verified arrival time until a backend is added.</p>
  </div>;
}

function SlowDatingSettings() {
  const { state, update } = useStore();
  const navigate = useNavigate();
  const preferences = state.letterPreferences;
  const setPreferences = (patch: Partial<LetterPreferences>) => update({ letterPreferences: { ...preferences, ...patch } });
  const setTier = (tier: "nearby" | "regional" | "international", field: "minimumMinutes" | "maximumMinutes", value: number) => {
    const safeValue = Math.min(180, Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1));
    const next = { ...preferences.deliveryTiers[tier], [field]: safeValue };
    if (field === "minimumMinutes" && next.minimumMinutes > next.maximumMinutes) next.maximumMinutes = next.minimumMinutes;
    if (field === "maximumMinutes" && next.maximumMinutes < next.minimumMinutes) next.minimumMinutes = next.maximumMinutes;
    setPreferences({ deliveryTiers: { ...preferences.deliveryTiers, [tier]: next } });
  };
  return <section className="slow-settings-page">
    <button className="text-button letter-back" onClick={() => navigate("/app/letters")}>Back to letters</button>
    <div className="letter-compose-heading"><p className="eyebrow">YOUR LETTERS, YOUR RHYTHM</p><h1>Slow Dating <em>settings.</em></h1><p>Choose how you like to connect. Your existing archive stays available if you pause letter writing.</p></div>
    <div className="slow-settings-list">
      <section className="slow-setting-card slow-setting-toggle"><div><span className="eyebrow">YOUR PARTICIPATION</span><h2>{preferences.slowDatingEnabled ? "Slow Dating is on." : "Slow Dating is paused."}</h2><p>When enabled, you can write to mutual matches who have also opted in. Pausing never deletes your archive.</p></div><label className="toggle-control"><span>Participate in Slow Dating</span><input type="checkbox" checked={preferences.slowDatingEnabled} onChange={(event) => setPreferences({ slowDatingEnabled: event.target.checked })} /><span className="toggle-track" /></label></section>
      <section className="slow-setting-card"><span className="eyebrow">YOUR CONVERSATION STYLE</span><label>How you'd like to connect<select value={preferences.preferredStyle} onChange={(event) => setPreferences({ preferredStyle: event.target.value as LetterPreferences["preferredStyle"] })}><option>Thoughtful letters</option><option>Letters and messages</option><option>Messages first</option></select></label><label>What you're looking for<select value={preferences.relationshipIntent} onChange={(event) => setPreferences({ relationshipIntent: event.target.value as LetterPreferences["relationshipIntent"] })}><option>Long-term</option><option>Exploring</option><option>Open to either</option></select></label></section>
      <section className="slow-setting-card"><span className="eyebrow">APPROXIMATE DELIVERY TIERS</span><p>These are configurable demo ranges in minutes, not measured distance. No GPS or precise location is collected.</p>{(["nearby", "regional", "international"] as const).map((tier) => <div className="tier-row" key={tier}><strong>{tier[0].toUpperCase() + tier.slice(1)}</strong><label>Minimum minutes<input type="number" min="1" max="180" value={preferences.deliveryTiers[tier].minimumMinutes} onChange={(event) => setTier(tier, "minimumMinutes", Number(event.target.value))} /></label><label>Maximum minutes<input type="number" min="1" max="180" value={preferences.deliveryTiers[tier].maximumMinutes} onChange={(event) => setTier(tier, "maximumMinutes", Number(event.target.value))} /></label></div>)}<label>When distance is unavailable, wait (minutes)<input type="number" min="1" max="180" value={preferences.defaultDeliveryDelayMinutes} onChange={(event) => setPreferences({ defaultDeliveryDelayMinutes: Math.min(180, Math.max(1, Number(event.target.value) || 1)) })} /></label><label>Demo distance tier<select value={preferences.distanceCategory} onChange={(event) => setPreferences({ distanceCategory: event.target.value as LetterPreferences["distanceCategory"] })}><option value="nearby">Nearby</option><option value="regional">Regional</option><option value="international">International</option><option value="unavailable">Unavailable — use default</option></select></label><small className="settings-prototype-note">In production, the server must calculate and store this schedule from consented approximate location. A browser preference is not a security control.</small></section>
      <section className="slow-setting-card"><span className="eyebrow">ARRIVAL NOTIFICATIONS & READ RECEIPTS</span><label className="checkbox-setting"><input type="checkbox" checked={preferences.inAppArrivalNotifications} onChange={(event) => setPreferences({ inAppArrivalNotifications: event.target.checked })} /> Show in-app arrival notices</label><label className="checkbox-setting"><input type="checkbox" checked={preferences.shareReadReceipts} onChange={(event) => setPreferences({ shareReadReceipts: event.target.checked })} /> Share when you have opened a letter</label><label className="checkbox-setting"><input type="checkbox" checked={preferences.quietHoursEnabled} onChange={(event) => setPreferences({ quietHoursEnabled: event.target.checked })} /> Respect quiet hours</label><div className="quiet-hours-row"><label>Quiet starts<input type="time" value={preferences.quietStart} onChange={(event) => setPreferences({ quietStart: event.target.value })} /></label><label>Quiet ends<input type="time" value={preferences.quietEnd} onChange={(event) => setPreferences({ quietEnd: event.target.value })} /></label></div><small>Only in-app notices are implemented in this prototype. Device push notifications are not configured.</small></section>
    </div>
  </section>;
}

function StampCollection() {
  const { state } = useStore();
  const navigate = useNavigate();
  const owned = new Set(state.userStamps.map((stamp) => stamp.stampId));
  return <section className="stamp-collection-page"><button className="text-button letter-back" onClick={() => navigate("/app/letters")}>Back to letters</button><div className="letter-compose-heading"><p className="eyebrow">A SMALL DETAIL, ALL YOURS</p><h1>Your stamp <em>collection.</em></h1><p>Cosmetic touches for your letters. Stamps never unlock paid features or matching privileges.</p></div><div className="stamp-collection-grid">{letterStamps.map((stamp) => <article className={`collection-stamp-card ${owned.has(stamp.id) ? "" : "stamp-locked"}`} key={stamp.id}><div className={`letter-stamp-art stamp-${stamp.id}`}><span>{stamp.name}</span></div><div><span className="eyebrow">{stamp.rarity.toUpperCase()}</span><h2>{stamp.name}</h2><p>{stamp.artwork}</p><small>{stamp.acquisitionMethod}</small>{owned.has(stamp.id) ? <span className="stamp-owned-label">In your collection</span> : <span className="stamp-owned-label">Earn through shared letter exchanges</span>}</div></article>)}</div><p className="stamp-fairness-note">You begin with three free stamps. The Shared Chapter stamp is earned after a mutual match exchanges a letter in the demo; there are no paid stamps or location-based rewards.</p></section>;
}

function ProfilePage() {
  const { state, update } = useStore();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [photo, setPhoto] = useState("");
  const [localError, setLocalError] = useState("");
  const availableInterests = ["Indie films", "Travel", "Cooking", "Live music", "Books", "Hiking", "Coffee", "Art", "Photography", "Nature"];
  const addPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalError("");
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLocalError("Choose an image file."); return; }
    if (file.size > 2_000_000) { setLocalError("For this browser demo, choose an image under 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") { setPhoto(reader.result); update({ primaryPhoto: reader.result }); }
      else setLocalError("This image could not be previewed.");
    };
    reader.onerror = () => setLocalError("This image could not be read.");
    reader.readAsDataURL(file);
  };
  return <div className="profile-page">
    <div className="page-heading"><div><p className="eyebrow">YOUR STORY, YOUR WAY</p><h1>Your <em>profile.</em></h1><p>A profile should feel like an invitation to get to know you.</p></div><button className="button button-dark" onClick={() => { setSaved(true); window.setTimeout(() => setSaved(false), 2500); }}>Save changes</button></div>
    <div className="profile-editor-layout">    <section className="profile-preview-card"><div className="profile-preview-image"><img src={photo || state.primaryPhoto || profiles[0].photo} alt={`${state.displayName}'s selected profile portrait`} /></div><div className="profile-preview-copy"><span className="eyebrow">YOUR PREVIEW</span><h2>{state.displayName}, 27</h2><p>{state.city}</p><p>{state.bio || "A little about you, in your own words."}</p><div className="interest-list">{state.interests.slice(0, 4).map((interest) => <span key={interest}>{interest}</span>)}</div></div></section><section className="profile-form">
      <div className="form-section"><p className="eyebrow">THE INTRODUCTION</p><label>Display name<input value={state.displayName} maxLength={40} onChange={(event) => update({ displayName: event.target.value })} /></label><label>City or neighborhood<input value={state.city} maxLength={60} onChange={(event) => update({ city: event.target.value })} /></label><label>A little about you<textarea value={state.bio} maxLength={300} rows={4} onChange={(event) => update({ bio: event.target.value })} /><small>{state.bio.length}/300</small></label></div>
      <div className="form-section"><p className="eyebrow">THE THINGS YOU LOVE</p><p>Choose the interests you want people to notice.</p><div className="interest-picker">{availableInterests.map((interest) => <button key={interest} className={state.interests.includes(interest) ? "selected" : ""} onClick={() => update({ interests: state.interests.includes(interest) ? state.interests.filter((item) => item !== interest) : [...state.interests, interest] })}>{interest}</button>)}</div></div>
      <div className="form-section"><p className="eyebrow">SLOW DATING</p><p>Let mutual matches know that you're open to thoughtful letters. You can still use regular messages at any time.</p><label className="profile-letter-toggle"><input type="checkbox" checked={state.letterPreferences.slowDatingEnabled} onChange={(event) => update({ letterPreferences: { ...state.letterPreferences, slowDatingEnabled: event.target.checked } })} /><span>I'm open to exchanging letters</span></label><p>Your style: {state.letterPreferences.preferredStyle} · Looking for: {state.letterPreferences.relationshipIntent}</p><button className="text-button" onClick={() => navigate("/app/letters/settings")}>Manage Slow Dating preferences</button></div>
      <div className="form-section"><p className="eyebrow">YOUR PHOTOS</p><p>Photos stay in this browser demo. Keep uploads under 2 MB.</p>{localError && <p className="form-error" role="alert">{localError}</p>}<label className="upload-button">Choose a profile photo<input type="file" accept="image/*" onChange={addPhoto} /></label></div>
      {saved && <p className="saved-message" role="status">Your profile changes are saved in this browser.</p>}
    </section></div>
  </div>;
}

function Settings() {
  const { state, update } = useStore();
  const navigate = useNavigate();
  const blocked = profiles.filter((profile) => state.blocked.includes(profile.id));
  return <div className="settings-page"><div className="page-heading"><div><p className="eyebrow">YOUR COMFORT, YOUR CALL</p><h1>Settings & <em>privacy.</em></h1><p>Prototype controls for what you share and who can reach you.</p></div></div><div className="settings-list">
    <section className="setting-card"><div><p className="eyebrow">PROFILE VISIBILITY</p><h2>Your prompt is {state.promptVisibility.toLowerCase()}.</h2><p>Choose who can read the answer you wrote in Personality DNA.</p></div><select value={state.promptVisibility} onChange={(event) => update({ promptVisibility: event.target.value as AppState["promptVisibility"] })}><option>Private</option><option>Matches</option><option>Profile</option></select></section>
    <section className="setting-card"><div><p className="eyebrow">BLOCKED PROFILES</p><h2>{blocked.length ? `${blocked.length} profile${blocked.length === 1 ? "" : "s"} blocked` : "No blocked profiles"}</h2><p>Blocked profiles are removed from discovery and matches in this browser.</p></div><div className="blocked-list">{blocked.map((person) => <button key={person.id} onClick={() => update({ blocked: state.blocked.filter((id) => id !== person.id) })}>Unblock {person.name}</button>)}</div></section>
    <section className="setting-card"><div><p className="eyebrow">YOUR DEMO DATA</p><h2>Everything stays on this device.</h2><p>This prototype uses browser storage only. It has no production authentication, messaging server, or moderation team.</p></div><button className="button button-outline" onClick={() => { localStorage.removeItem(STORAGE_KEY); update(initialState); navigate("/login"); }}>Reset demo data</button></section>
  </div><p className="safety-footnote">For a production dating service, safety reports, age assurance, privacy controls, and secure server-side authorization would need to be implemented and operated before launch. This prototype does not verify identities or ages.</p></div>;
}

export default App;
