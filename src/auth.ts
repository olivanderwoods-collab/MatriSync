import type { Auth } from "firebase/auth";
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const authConfigured = Object.values(config).every(Boolean);
let pending: Promise<Auth> | undefined;
export function authWasInitialized() {
  return !!pending;
}
// This module is side-effect free. Firebase is initialized only in account mode.
export function accountAuth(): Promise<Auth> {
  if (!authConfigured)
    return Promise.reject(Error("Authentication setup required"));
  if (!pending)
    pending = (async () => {
      const [
        { initializeApp },
        { initializeAuth, browserSessionPersistence, connectAuthEmulator },
      ] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      const auth = initializeAuth(initializeApp(config), {
        persistence: browserSessionPersistence,
      });
      const emulator = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL;
      if (emulator && ["localhost", "127.0.0.1"].includes(location.hostname)) {
        const url = new URL(emulator);
        if (!["localhost", "127.0.0.1"].includes(url.hostname))
          throw Error("Emulator must use loopback");
        connectAuthEmulator(auth, url.origin, { disableWarnings: true });
      }
      await auth.authStateReady();
      return auth;
    })();
  return pending;
}
export function authError(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const messages: Record<string, string> = {
    "auth/invalid-credential":
      "The email or password is incorrect. Please try again.",
    "auth/user-not-found":
      "The email or password is incorrect. Please try again.",
    "auth/wrong-password":
      "The email or password is incorrect. Please try again.",
    "auth/email-already-in-use":
      "An account already exists with this email. Try signing in.",
    "auth/weak-password": "Use a stronger password with at least 6 characters.",
    "auth/password-does-not-meet-requirements":
      "This password does not meet the project password policy. Choose a stronger password.",
    "auth/network-request-failed":
      "Unable to connect. Check your internet connection and try again.",
    "auth/too-many-requests":
      "Too many attempts. Please wait before trying again.",
    "auth/operation-not-allowed":
      "Email/password authentication is not enabled for this project.",
    "auth/invalid-api-key":
      "Authentication configuration needs attention. Guest demo is available.",
  };
  return (
    messages[code] ||
    "Authentication is unavailable. Please try again or continue as Guest."
  );
}
