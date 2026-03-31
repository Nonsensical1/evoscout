import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCX7xDp9TkTk6YeZCVaClwzxQwlpWladW4",
  authDomain: "evoscout-bd7d1.firebaseapp.com",
  projectId: "evoscout-bd7d1",
  storageBucket: "evoscout-bd7d1.firebasestorage.app",
  messagingSenderId: "399892053261",
  appId: "1:399892053261:web:d7f0406a9d75cec0540444",
  measurementId: "G-DCZV9NKX5V"
};

// Initialize Firebase only if it hasn't been initialized already
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const db = getFirestore(app);
// Connect to local emulator (Disabled by user request for Live db)
// if (typeof window !== "undefined" && window.location.hostname === "localhost") {
//   connectFirestoreEmulator(db, '127.0.0.1', 8080);
// }
const auth = getAuth(app);

export { app, db, auth };
