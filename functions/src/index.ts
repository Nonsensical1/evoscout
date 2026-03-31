import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

export const dailyAggregationJob = functions.scheduler.onSchedule("every 24 hours", async (event) => {
  console.log("Starting daily aggregation job run:", event.scheduleTime);
  
  // 1. Fetch data from APIs (Mocked implementation below)
  const mockedGrants = [
    { title: "NSF Biology Grant 2026", id: "NSF-2026-A1", url: "https://grants.gov/dummy-1", type: "grant" }
  ];

  const batch = db.batch();
  
  for (const item of mockedGrants) {
    // 2. Novelty Constraint: Check if item is already in ScoutedHistory
    const historyRef = db.collection("ScoutedHistory").doc(item.id);
    const historyDoc = await historyRef.get();
    
    if (!historyDoc.exists) {
      // 3. Add to DailyFeed
      const dailyFeedRef = db.collection("DailyFeed").doc();
      batch.set(dailyFeedRef, {
        date: admin.firestore.FieldValue.serverTimestamp(),
        grants: [item],
      });
      
      // 4. Mark as scouted
      batch.set(historyRef, {
        originalId: item.id,
        url: item.url,
        type: item.type,
        scoutedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      console.log(`Item ${item.id} already exists in history. Skipping.`);
    }
  }

  await batch.commit();
  console.log("Daily aggregation job complete.");
});
