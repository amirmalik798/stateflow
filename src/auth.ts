export interface SessionUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
}
type AuthListener = (user: SessionUser | null) => void;
let currentUser: SessionUser | null = null;
let initialized = false;
const listeners = new Set<AuthListener>();
let refreshPromise: Promise<SessionUser | null> | null = null;
const SESSION_PROFILE_KEY = 'stateflow-session-profile';
const authChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('stateflow-auth')
  : null;

function cachedUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_PROFILE_KEY);
    return raw ? JSON.parse(raw) as SessionUser : null;
  } catch {
    return null;
  }
}

function publish(user: SessionUser | null) {
  currentUser = user;
  initialized = true;
  try {
    if (user) localStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_PROFILE_KEY);
  } catch {
    // Profile caching is optional; the HttpOnly server session remains authoritative.
  }
  listeners.forEach((listener) => listener(user));
  try {
    authChannel?.postMessage({ type: 'session-changed' });
  } catch {
    // BroadcastChannel is an enhancement; the server session remains authoritative.
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || ('Request failed (' + response.status + ')'));
  }
  return response.json() as Promise<T>;
}

export async function getCurrentSessionUser(): Promise<SessionUser | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = request<{ user: SessionUser | null }>('/api/auth/me')
    .then(({ user }) => {
      currentUser = user;
      initialized = true;
      try {
        if (user) localStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(user));
        else localStorage.removeItem(SESSION_PROFILE_KEY);
      } catch {
        // Ignore unavailable localStorage.
      }
      return user;
    })
    .catch((error) => {
      initialized = true;
      const saved = currentUser ?? cachedUser();
      if (!navigator.onLine && saved) {
        currentUser = saved;
        return saved;
      }
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export function onSessionChanged(listener: AuthListener): () => void {
  listeners.add(listener);
  if (initialized) listener(currentUser);
  return () => listeners.delete(listener);
}

export function signInWithGoogle(): void {
  window.location.assign('/api/auth/google');
}

export async function signOutUser(): Promise<void> {
  try {
    await request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
  } finally {
    publish(null);
  }
}

export async function refreshSession(): Promise<SessionUser | null> {
  const user = await getCurrentSessionUser();
  publish(user);
  return user;
}

if (authChannel) {
  authChannel.onmessage = () => {
    void getCurrentSessionUser().then((user) => {
      currentUser = user;
      initialized = true;
      listeners.forEach((listener) => listener(user));
    }).catch(() => undefined);
  };
}
