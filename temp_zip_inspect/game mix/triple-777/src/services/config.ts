import { Preferences } from "@capacitor/preferences";

const KEYS = {
  serverUrl: "server_url",
  clientSeed: "client_seed",
  nonce: "nonce",
  token: "t777_token",
  tokenAt: "t777_token_at",
  authEmail: "t777_email",
  authPassword: "t777_password",
  soundOn: "t777_sound_on",
  hapticsOn: "t777_haptics_on",
} as const;

// Triple 777 has its own independent, self-contained backend
// (`triple-777/backend/main.py`, deployed as `triple-777-backend`), not the
// shared `deals-rummy-backend`. Default to the local dev backend while
// running `npm run dev`, so testing doesn't require a manual Settings change
// every session; production builds (`npm run build`) default to the deployed
// per-game service.
const DEFAULT_SERVER_URL = import.meta.env.DEV ? "http://localhost:8001" : "https://triple-777-backend.onrender.com";

export async function getServerUrl(): Promise<string> {
  const { value } = await Preferences.get({ key: KEYS.serverUrl });
  if (value == null) return DEFAULT_SERVER_URL;
  return value.trim();
}

export async function setServerUrl(url: string): Promise<void> {
  await Preferences.set({ key: KEYS.serverUrl, value: url.trim() });
  // A cached token is signed by whichever backend issued it — reusing it
  // against a *different* backend (e.g. switching from the deployed server
  // to a local dev one) fails signature verification there, surfacing as a
  // generic "could not load the game" error with no obvious cause. Clearing
  // just the token (not the guest email/password) forces `ensureAuth` to
  // re-login-or-register against whichever server is now configured; the
  // same guest email either logs in (if that DB already has it) or gets
  // freshly registered there.
  await Preferences.set({ key: KEYS.token, value: "" });
  await Preferences.set({ key: KEYS.tokenAt, value: "0" });
}

export async function getClientSeed(): Promise<string> {
  const { value } = await Preferences.get({ key: KEYS.clientSeed });
  if (value) return value;
  const seed = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await Preferences.set({ key: KEYS.clientSeed, value: seed });
  return seed;
}

export async function nextNonce(): Promise<number> {
  const { value } = await Preferences.get({ key: KEYS.nonce });
  const n = (value ? Number(value) : 0) + 1;
  await Preferences.set({ key: KEYS.nonce, value: String(n) });
  return n;
}

export async function getSoundOn(): Promise<boolean> {
  const { value } = await Preferences.get({ key: KEYS.soundOn });
  return value !== "false"; // default on
}

export async function setSoundOn(on: boolean): Promise<void> {
  await Preferences.set({ key: KEYS.soundOn, value: String(on) });
}

export async function getHapticsOn(): Promise<boolean> {
  const { value } = await Preferences.get({ key: KEYS.hapticsOn });
  return value !== "false"; // default on
}

export async function setHapticsOn(on: boolean): Promise<void> {
  await Preferences.set({ key: KEYS.hapticsOn, value: String(on) });
}

// ---- guest auth (persisted so re-launching the app reuses the same account) ----

export interface AuthState {
  token: string | null;
  tokenAt: number;
  email: string | null;
  password: string | null;
}

export async function getAuthState(): Promise<AuthState> {
  const [token, tokenAt, email, password] = await Promise.all([
    Preferences.get({ key: KEYS.token }).then((r) => r.value),
    Preferences.get({ key: KEYS.tokenAt }).then((r) => Number(r.value) || 0),
    Preferences.get({ key: KEYS.authEmail }).then((r) => r.value),
    Preferences.get({ key: KEYS.authPassword }).then((r) => r.value),
  ]);
  return { token, tokenAt, email, password };
}

export async function saveAuthState(state: AuthState): Promise<void> {
  await Promise.all([
    Preferences.set({ key: KEYS.token, value: state.token ?? "" }),
    Preferences.set({ key: KEYS.tokenAt, value: String(state.tokenAt) }),
    Preferences.set({ key: KEYS.authEmail, value: state.email ?? "" }),
    Preferences.set({ key: KEYS.authPassword, value: state.password ?? "" }),
  ]);
}
