"use client";

import { ThemeProvider } from "next-themes";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Init settings if new user (will fail gracefully if Firestore rules aren't set yet)
          const settingsRef = doc(db, 'users', user.uid, 'settings', 'config');
          const snap = await getDoc(settingsRef);
          if (!snap.exists()) {
            await setDoc(settingsRef, {
              newsLimit: 12,
              literatureLimit: 12,
              grantsLimit: 12
            }, { merge: true });
          }
        } catch (err) {
          console.error("Firestore Init Error (Safe to ignore if setting up fresh):", err);
        }
      }
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    setAuthError("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Sign-in error:", err);
      const msg = err.message || String(err);
      if (msg.toLowerCase().includes("initial state") || msg.toLowerCase().includes("popup") || msg.toLowerCase().includes("redirect")) {
        setAuthError("Mobile Browser Blocked: Please tap the compass/menu icon and select 'Open in Safari' or 'Open in Chrome'. In-app browsers block secure login!");
      } else {
        setAuthError(msg);
      }
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {loading ? (
        <div className="min-h-screen bg-[#fafafa] dark:bg-[#1e1e1e] flex items-center justify-center font-serif text-editorial-text">
          Initializing secure database connection...
        </div>
      ) : !user ? (
        <div className="min-h-screen bg-[#fafafa] dark:bg-[#1e1e1e] bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] flex items-center justify-center p-4">
          <div className="max-w-md w-full border-2 border-editorial-border p-8 text-center bg-white dark:bg-[#121212] shadow-sm">
            <h1 className="text-3xl font-serif font-black mb-2 uppercase tracking-tight text-editorial-text">EvoScout Auth</h1>
            <div className="w-16 h-1 bg-editorial-text mx-auto mb-6"></div>
            <p className="font-serif italic text-editorial-muted mb-8">
              Sign in to access your secure, personalized research aggregation pipeline.
            </p>
            <button 
              onClick={signIn}
              className="w-full bg-[#171717] dark:bg-black hover:bg-black dark:hover:bg-[#262626] text-white py-3 px-6 font-bold font-sans uppercase tracking-widest text-sm transition-colors"
            >
              Sign In with Google
            </button>
            {authError && (
              <p className="mt-4 text-xs text-red-600 font-sans break-words bg-red-50 border border-red-200 p-2 text-left">
                <strong>Authentication Blocked:</strong><br/>
                {authError.includes("Mobile Browser Blocked") ? (
                   <span className="text-sm font-bold block mt-2">{authError}</span>
                ) : (
                   <>
                     It looks like this domain isn't authorized in your Firebase console yet, or you are using an embedded browser.<br/><br/>
                     Log into Firebase &rarr; Build &rarr; Authentication &rarr; Settings &rarr; Authorized Domains. Add your exact Vercel URL to the list.<br/><br/>
                     Raw Error: {authError}
                   </>
                )}
              </p>
            )}
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
