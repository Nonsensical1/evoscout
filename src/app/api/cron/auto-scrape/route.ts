import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { fetchLiveData } from '../../aggregate/route';

export const maxDuration = 300; // Allow up to 5 mins on Vercel Pro if available

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    // If you want to protect this cron via Vercel Cron Secret
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return new NextResponse('Unauthorized', { status: 401 });
    // }

    const now = new Date();
    const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

    // 1. Fetch all enabled schedules
    const schedulesSnap = await adminDb.collection('autoScrapeSchedules').where('enabled', '==', true).get();
    
    if (schedulesSnap.empty) {
      return NextResponse.json({ message: "No active auto-scrape schedules." });
    }

    const tasks = schedulesSnap.docs.map(async (docSnap) => {
      const schedule = docSnap.data();
      const uid = docSnap.id;

      // Ensure required data exists
      if (!schedule.timezone || !Array.isArray(schedule.localHours)) return;

      // 2. Check if current hour in user's timezone matches their scheduled hours
      try {
        const localHourString = new Intl.DateTimeFormat('en-US', {
          timeZone: schedule.timezone,
          hour: 'numeric',
          hourCycle: 'h23'
        }).format(now);
        
        const currentLocalHour = parseInt(localHourString, 10);
        
        if (!schedule.localHours.includes(currentLocalHour)) {
          return; // Not scheduled for this hour
        }
      } catch (e) {
        console.error("Timezone parsing error for user", uid, e);
        return;
      }

      console.log(`Running auto-scrape for user: ${uid}`);

      // 3. Fetch user configs and states
      const [settingsSnap, historySnap, feedSnap] = await Promise.all([
        adminDb.doc(`users/${uid}/settings/config`).get(),
        adminDb.doc(`users/${uid}/scouted/history`).get(),
        adminDb.doc(`users/${uid}/daily/feed`).get()
      ]);

      const settings = settingsSnap.exists ? settingsSnap.data()! : { newsLimit: 12, grantsLimit: 12, literatureLimit: 12, positionsLimit: 12, topics: {} };
      const historyArr = historySnap.exists ? historySnap.data()?.hashes || [] : [];
      const history = new Set(historyArr);
      let dailyFeed: any = feedSnap.exists ? feedSnap.data() : { date: today, grants: [], openGovGrants: [], news: [], literature: [], positions: [], paddingCache: {} };

      // 4. Archive old feed if new day
      if (dailyFeed.date !== today) {
        const hasItems = dailyFeed.grants?.length || dailyFeed.news?.length || dailyFeed.literature?.length || dailyFeed.positions?.length;
        if (hasItems) {
          const ledgerData = { ...dailyFeed };
          delete ledgerData.display;
          delete ledgerData.paddingCache;
          delete ledgerData.lastScrapeTimestamp;
          delete ledgerData.quotaFilled;
          await adminDb.collection(`users/${uid}/ledger`).add(ledgerData);
        }
        
        const oldFeed = JSON.parse(JSON.stringify(dailyFeed));
        const newPaddingCache = {
          news: [...(oldFeed.news || []), ...(oldFeed.paddingCache?.news || [])].slice(0, 40),
          literature: [...(oldFeed.literature || []), ...(oldFeed.paddingCache?.literature || [])].slice(0, 40),
          grants: [...(oldFeed.grants || []), ...(oldFeed.paddingCache?.grants || [])].slice(0, 40),
          openGovGrants: [...(oldFeed.openGovGrants || []), ...(oldFeed.paddingCache?.openGovGrants || [])].slice(0, 40),
          positions: [...(oldFeed.positions || []), ...(oldFeed.paddingCache?.positions || [])].slice(0, 40)
        };
        dailyFeed = { date: today, grants: [], openGovGrants: [], news: [], literature: [], positions: [], paddingCache: newPaddingCache };
      }

      // 5. Fetch Live Data!
      const liveDataResult: any = await fetchLiveData(settings.topics || {}, settings.newsLimit || 12);
      
      const liveData = {
         grants: liveDataResult.grants || [],
         openGovGrants: liveDataResult.openGovGrants || [],
         news: liveDataResult.news || [],
         literature: liveDataResult.literature || [],
         positions: liveDataResult.positions || [],
         historyEvents: liveDataResult.historyEvents || []
      };

      let addedCount = 0;
      const processCategory = (categoryItems: any[], categoryName: string, limit: number) => {
        if (!dailyFeed[categoryName]) dailyFeed[categoryName] = [];
        const existingIds = new Set(dailyFeed[categoryName].map((i: any) => i.id));
        let combined = [...dailyFeed[categoryName]];
        
        for (const item of categoryItems) {
          if (!existingIds.has(item.id)) {
            combined.push({ ...item, date: new Date().toISOString() });
            if (!history.has(item.id)) {
              historyArr.push(item.id);
              history.add(item.id);
              addedCount++;
            }
          } else {
            const idx = combined.findIndex((i: any) => i.id === item.id);
            if (idx !== -1) combined[idx] = { ...combined[idx], ...item };
          }
        }
        
        combined.sort((a, b) => new Date(b.isoDate || b.date).getTime() - new Date(a.isoDate || a.date).getTime());
        dailyFeed[categoryName] = combined.slice(0, limit);
      };

      const newsLimit = settings.newsLimit || 12;
      const litLimit = settings.literatureLimit || 12;
      const grantsLimit = settings.grantsLimit || 12;

      processCategory(liveData.grants, 'grants', grantsLimit);
      processCategory(liveData.openGovGrants, 'openGovGrants', grantsLimit);
      processCategory(liveData.news, 'news', newsLimit);
      processCategory(liveData.literature, 'literature', litLimit);
      dailyFeed.positions = liveData.positions.slice(0, settings.positionsLimit || 12);

      const populateDisplay = (active: any[], padding: any[], limit: number) => {
        const out = [...(active || [])];
        const ids = new Set(out.map(i => i.id));
        const padSrc = padding || [];
        for (const p of padSrc) {
          if (out.length >= limit) break;
          if (!ids.has(p.id)) {
            out.push(p);
            ids.add(p.id);
          }
        }
        return out;
      };

      dailyFeed.display = {
        news: populateDisplay(dailyFeed.news, dailyFeed.paddingCache?.news, newsLimit),
        literature: populateDisplay(dailyFeed.literature, dailyFeed.paddingCache?.literature, litLimit),
        grants: populateDisplay(dailyFeed.grants, dailyFeed.paddingCache?.grants, grantsLimit),
        openGovGrants: populateDisplay(dailyFeed.openGovGrants, dailyFeed.paddingCache?.openGovGrants, grantsLimit),
        positions: dailyFeed.positions || []
      };

      if (liveData.historyEvents && liveData.historyEvents.length > 0) {
        dailyFeed.historyEvents = liveData.historyEvents;
      }

      const isFresh = (item: any) => (Date.now() - new Date(item.isoDate || item.date).getTime()) < 24 * 60 * 60 * 1000;
      
      dailyFeed.quotaFilled = {
        news: (dailyFeed.news?.filter(isFresh).length || 0) >= newsLimit,
        literature: (dailyFeed.literature?.filter(isFresh).length || 0) >= litLimit,
        grants: (dailyFeed.grants?.length || 0) >= grantsLimit,
      };
      
      dailyFeed.lastScrapeTimestamp = new Date().toISOString();
      
      if (addedCount > 0) {
        dailyFeed.podcastUrl = null;
        dailyFeed.podcastScript = null;
      }

      // 6. Save back to Firestore using Batch
      const batch = adminDb.batch();
      batch.set(adminDb.doc(`users/${uid}/daily/feed`), dailyFeed);
      batch.set(adminDb.doc(`users/${uid}/scouted/history`), { hashes: historyArr });
      await batch.commit();

    });

    // We process sequentially or await Promise.all
    // Since Vercel has limits, we can just Promise.all to maximize parallel I/O.
    await Promise.all(tasks);

    return NextResponse.json({ success: true, processed: tasks.length });

  } catch (error: any) {
    console.error("Cron Error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
