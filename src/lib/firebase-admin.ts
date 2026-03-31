import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      projectId: "evoscout-bd7d1",
      credential: admin.credential.applicationDefault()
    });
  } catch (error) {
    console.warn("Falling back to unauthenticated Admin SDK (Missing Service Account)", error);
    try {
      // Fallback: allows compilation and limited execution without explicit keys
      admin.initializeApp({ projectId: "evoscout-bd7d1" });
    } catch (e) { }
  }
}

export const adminDb = admin.firestore();
