"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ExternalLink, Clock, Headphones } from 'lucide-react';
import { useAuth } from '@/app/providers';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, writeBatch, collection, addDoc, query, orderBy, limit as firestoreLimit, getDocs } from 'firebase/firestore';

export default function Home() {
  const { user } = useAuth();
  const [data, setData] = useState<any>({ grants: [], openGovGrants: [], news: [], literature: [], positions: [], podcastUrl: null, podcastScript: null });
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [quotaNotice, setQuotaNotice] = useState<string | null>(null);
  const scrapeInProgress = useRef(false);

  const imageIndices = useMemo(() => {
    if (data.news.length === 0) return new Set<number>();
    const count = Math.ceil(data.news.length / 2);
    const indices = new Set<number>();
    indices.add(0); // Keep the top news as hero banner
    while (indices.size < count) {
      indices.add(Math.floor(Math.random() * data.news.length));
    }
    return indices;
  }, [data.news]);

  const SCRAPE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

  const handleRunScraper = useCallback(async () => {
    if (!user || scrapeInProgress.current) return;
    scrapeInProgress.current = true;
    setQuotaNotice(null);
    setActionMessage("Extracting Context...");
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

      const [settingsSnap, historySnap, feedSnap] = await Promise.all([
         getDoc(doc(db, 'users', user.uid, 'settings', 'config')),
         getDoc(doc(db, 'users', user.uid, 'scouted', 'history')),
         getDoc(doc(db, 'users', user.uid, 'daily', 'feed'))
      ]);

      const settings = settingsSnap.exists() ? settingsSnap.data() : { newsLimit: 12, grantsLimit: 12, literatureLimit: 12, positionsLimit: 12, topics: {} };
      const historyArr = historySnap.exists() ? historySnap.data()?.hashes || [] : [];
      const history = new Set(historyArr);
      let dailyFeed: any = feedSnap.exists() ? feedSnap.data() : { date: today, grants: [], openGovGrants: [], news: [], literature: [], positions: [] };

      // Archive if new day
      let oldFeed: any = null;
      if (dailyFeed.date !== today) {
        const hasItems = dailyFeed.grants?.length || dailyFeed.news?.length || dailyFeed.literature?.length || dailyFeed.positions?.length;
        if (hasItems) {
           await addDoc(collection(db, 'users', user.uid, 'ledger'), dailyFeed);
        }
        oldFeed = JSON.parse(JSON.stringify(dailyFeed));
        dailyFeed = { date: today, grants: [], openGovGrants: [], news: [], literature: [], positions: [] };
      }

      setActionMessage("Harvesting Global Feeds...");
      const res = await fetch('/api/aggregate', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: settings.topics || {} })
      });
      const scrapRes = await res.json();
      
      if (!scrapRes.success || !scrapRes.liveData) {
        setActionMessage("Pipeline Error: Failed to gather external feeds.");
        scrapeInProgress.current = false;
        return;
      }
      const liveData = scrapRes.liveData;

      setActionMessage("Synchronizing & Filtering...");

      let addedCount = 0;
      let skippedCount = 0;

      const processCategory = (categoryItems: any[], categoryName: string, limit: number) => {
        let currentLen = dailyFeed[categoryName]?.length || 0;
        if (!dailyFeed[categoryName]) dailyFeed[categoryName] = [];
        
        for (const item of categoryItems) {
          if (!history.has(item.id)) {
            if (currentLen < limit) {
              dailyFeed[categoryName].push({ ...item, date: new Date().toISOString() });
              historyArr.push(item.id);
              history.add(item.id);
              addedCount++;
              currentLen++;
            } else { skippedCount++; }
          } else { skippedCount++; }
          if (currentLen >= limit) break;
        }
      };

      const newsLimit = settings.newsLimit || 12;
      const litLimit = settings.literatureLimit || 12;
      const grantsLimit = settings.grantsLimit || 12;

      processCategory(liveData.grants, 'grants', grantsLimit);
      if (liveData.openGovGrants) processCategory(liveData.openGovGrants, 'openGovGrants', grantsLimit);
      processCategory(liveData.news, 'news', newsLimit);
      processCategory(liveData.literature, 'literature', litLimit);
      // Positions are processed but NOT tracked in 'history.has' backfilling to avoid stale listings.
      // We always refresh positions entirely.
      dailyFeed.positions = liveData.positions ? liveData.positions.slice(0, settings.positionsLimit || 12) : [];

      // Backfill missing items from the previous feed to prevent slow-weekend empty states
      const needsBackfill = ['news', 'literature', 'grants', 'openGovGrants'].some(cat => {
         const limit = settings[`${cat}Limit`] || 12;
         return (!dailyFeed[cat] || dailyFeed[cat].length < limit);
      });

      if (needsBackfill) {
         let historicFeeds: any[] = [];
         if (oldFeed) historicFeeds.push(oldFeed);
         // If oldFeed isn't enough (e.g. yesterday was also an empty weekend), dip into the ledger
         try {
            const ledgerQuery = query(collection(db, 'users', user.uid, 'ledger'), orderBy('date', 'desc'), firestoreLimit(7));
            const ledgerSnaps = await getDocs(ledgerQuery);
            historicFeeds = [...historicFeeds, ...ledgerSnaps.docs.map(d => d.data())];
         } catch (e) {
            console.error("Ledger historic fallback failed", e);
         }

         ['news', 'literature', 'grants', 'openGovGrants'].forEach(cat => {
            const limit = settings[`${cat}Limit`] || 12;
            if (!dailyFeed[cat] || dailyFeed[cat].length < limit) {
               for (const historicFeed of historicFeeds) {
                  if (!historicFeed[cat] || historicFeed[cat].length === 0) continue;
                  
                  const needed = limit - (dailyFeed[cat]?.length || 0);
                  if (needed <= 0) break;

                  const existingIds = new Set((dailyFeed[cat] || []).map((i: any) => i.id));
                  const candidates = historicFeed[cat].filter((i: any) => !existingIds.has(i.id));
                  
                  if (!dailyFeed[cat]) dailyFeed[cat] = [];
                  dailyFeed[cat] = [...dailyFeed[cat], ...candidates.slice(0, needed)];
               }
            }
         });
      }

      // Compute quota-filled flags for the three participating categories
      const quotaFilled = {
        news: (dailyFeed.news?.length || 0) >= newsLimit,
        literature: (dailyFeed.literature?.length || 0) >= litLimit,
        grants: (dailyFeed.grants?.length || 0) >= grantsLimit,
      };

      // Write feed + timestamp + quota status
      dailyFeed.lastScrapeTimestamp = new Date().toISOString();
      dailyFeed.quotaFilled = quotaFilled;

      // If we added new news or literature, clear the old podcast to trigger a fresh synthesis
      if (addedCount > 0) {
        dailyFeed.podcastUrl = null;
        dailyFeed.podcastScript = null;
      }

      const batch = writeBatch(db);
      batch.set(doc(db, user.uid, 'daily', 'feed'), dailyFeed);
      batch.set(doc(db, user.uid, 'scouted', 'history'), { hashes: historyArr });
      await batch.commit();

      // Show notice if quota is not fully met
      const allFilled = quotaFilled.news && quotaFilled.literature && quotaFilled.grants;
      if (!allFilled) {
        setQuotaNotice("It's still early — some feeds haven't fully populated yet. EvoScout will attempt to gather more content on your next visit after the hourly cooldown.");
      } else {
        setQuotaNotice(null);
      }

      setActionMessage(`Scraper Complete: Added ${addedCount} items, skipped ${skippedCount} duplicates/over-quota.`);

    } catch (e: any) {
      console.error(e);
      setActionMessage("Error running scraper: " + e.message);
    } finally {
      scrapeInProgress.current = false;
    }
    setTimeout(() => setActionMessage(""), 5000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let hasFiredInitialScrapeCheck = false;
    
    // Listen to live database feed locally to auto-refresh the UI when scraper finishes!
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'daily', 'feed'), (docSnap) => {
      if (docSnap.exists()) {
        const feed = docSnap.data();
        const now = new Date();
        const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
        
        // Always update UI with current feed data first
        setData({
          grants: feed.grants || [],
          openGovGrants: feed.openGovGrants || [],
          news: feed.news || [],
          literature: feed.literature || [],
          positions: feed.positions || [],
          podcastUrl: feed.podcastUrl || null,
          podcastScript: feed.podcastScript || null
        });
        setLoading(false);

        // Only run scrape decision logic once per mount (not on every snapshot)
        if (hasFiredInitialScrapeCheck) return;
        hasFiredInitialScrapeCheck = true;

        // CASE 1: New day detected — archive and scrape fresh
        if (feed.date && feed.date !== today) {
          setActionMessage("New day detected. Initializing engine...");
          handleRunScraper();
          return;
        }

        // CASE 2: Same day — check if quota-filling cycle should trigger
        const qf = feed.quotaFilled || { news: false, literature: false, grants: false };
        const allFilled = qf.news && qf.literature && qf.grants;

        if (allFilled) {
          // All quotas met — done for the day
          setQuotaNotice(null);
          return;
        }

        // Quotas not filled — check cooldown
        const lastScrape = feed.lastScrapeTimestamp ? new Date(feed.lastScrapeTimestamp).getTime() : 0;
        const elapsed = Date.now() - lastScrape;

        if (elapsed >= SCRAPE_COOLDOWN_MS) {
          // Cooldown expired — re-scrape to try filling quota
          setActionMessage("Quota not yet met. Re-scanning feeds...");
          handleRunScraper();
        } else {
          // Cooldown active — show notice
          const minutesLeft = Math.ceil((SCRAPE_COOLDOWN_MS - elapsed) / 60000);
          setQuotaNotice(`It's still early — some feeds haven't fully populated yet. EvoScout will attempt to gather more content if you check back in ~${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`);
        }

      } else {
        // Document does not exist yet (first sign-in)
        hasFiredInitialScrapeCheck = true;
        handleRunScraper();
      }
    });

    return () => unsub();
  }, [user, handleRunScraper, SCRAPE_COOLDOWN_MS]);


  if (loading) return <div className="min-h-[50vh] flex items-center justify-center font-serif text-xl italic text-editorial-muted">Synchronizing encrypted database...</div>;

  return (
    <div className="animate-in fade-in duration-700">
      
      {/* Top Banner / Controls */}
      <section className="mb-10 border-b-2 border-editorial-border-dark pb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-serif font-bold text-editorial-text">Daily Scouting Briefing</h2>
            <p className="font-sans text-editorial-muted max-w-2xl text-base">
              Automated global aggregation of Microbiology, Cellular Sciences, and Synthetic Biology releases.
            </p>
            {actionMessage && <p className="text-sm font-sans font-medium text-blue-600 mt-2">{actionMessage}</p>}
          </div>
          <div className="flex gap-4">
            {user?.email === "elijahryal@gmail.com" && (
              <button 
                onClick={() => {
                  scrapeInProgress.current = false;
                  handleRunScraper();
                }}
                className="bg-red-900 hover:bg-red-800 text-white font-sans text-xs uppercase tracking-wider font-bold py-2 px-4 shadow-sm transition-colors"
              >
                Force Aggregate
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Podcast Audio Player */}
      {(data.podcastUrl || (data.news && data.news.length > 0)) && (
        <section className="mb-12 bg-white border border-editorial-border p-8 shadow-[8px_8px_0px_#f0f0f0] relative overflow-hidden transition-all duration-500">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#005587]"></div>
          
          <div className="flex flex-col md:flex-row gap-8 items-start md:items-center justify-between">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <span className="bg-[#005587] text-white text-[10px] font-sans font-black px-2 py-0.5 tracking-tighter uppercase">Exclusive</span>
                <h3 className="text-2xl font-serif font-black uppercase tracking-tight text-[#005587] flex items-center gap-2">
                  <Headphones className="w-6 h-6 opacity-90" /> The Deep Dive
                </h3>
              </div>
              <p className="font-sans text-sm text-editorial-muted max-w-xl leading-relaxed">
                An AI-generated conversational briefing by <strong>Al</strong> and <strong>Matt</strong>, covering today's most crucial synthetic biology breakthroughs and industry reports.
              </p>
            </div>

            {data.podcastUrl ? (
              <div className="w-full md:w-auto bg-[#fafafa] p-4 border border-gray-200 shadow-inner flex flex-col items-center gap-2">
                <audio controls className="w-full md:w-80 h-10 outline-none">
                  <source src={data.podcastUrl} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
                <span className="text-[9px] font-sans font-bold text-gray-400 uppercase tracking-widest">Signed Secure Access Link</span>
              </div>
            ) : (
              <div className="w-full md:w-auto flex flex-col items-center gap-3 py-4 px-8 border-2 border-dashed border-gray-200 rounded-lg">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"></div>
                </div>
                <span className="text-xs font-sans font-bold text-[#005587] uppercase tracking-widest animate-pulse">Synthesis in Progress...</span>
                <p className="text-[10px] font-sans text-editorial-muted text-center max-w-[150px]">Today's briefing is being generated by the AI hosts.</p>
              </div>
            )}
          </div>
          
          {data.podcastScript && (
             <details className="mt-6 pt-6 border-t border-gray-200 cursor-pointer group">
               <summary className="font-sans text-xs font-black uppercase tracking-[0.2em] text-[#005587] hover:text-[#003d61] list-none flex items-center gap-2 transition-all group-open:mb-4">
                 <span className="group-open:rotate-90 transition-transform">▸</span> View Full Transcript
               </summary>
               <div className="space-y-4 max-h-80 overflow-y-auto pr-6 custom-scrollbar scroll-smooth">
                 {data.podcastScript.map((line: any, idx: number) => (
                   <div key={idx} className={`p-4 rounded-sm font-sans text-sm relative ${line.speaker === 'Al' ? 'bg-[#f0f7ff] border-l-4 border-[#005587]' : 'bg-[#f9f9f9] border-l-4 border-gray-300'}`}>
                     <span className={`font-black uppercase text-[9px] tracking-[0.15em] block mb-2 ${line.speaker === 'Al' ? 'text-[#005587]' : 'text-gray-500'}`}>
                       {line.speaker}
                     </span>
                     <span className="text-gray-800 leading-relaxed font-serif text-base italic">{line.text}</span>
                   </div>
                 ))}
               </div>
             </details>
          )}
        </section>
      )}

      {/* Quota Notice Banner */}
      {quotaNotice && (
        <section className="mb-8 animate-in fade-in duration-500">
          <div className="flex items-start gap-4 px-6 py-4 bg-[#fffbeb] border border-[#f5d98c] text-[#7c6a1a] font-sans text-sm leading-relaxed">
            <Clock className="w-5 h-5 mt-0.5 flex-shrink-0 opacity-70" />
            <p>
              <span className="font-bold uppercase tracking-wider text-xs block mb-1">Content Still Accumulating</span>
              {quotaNotice}
            </p>
          </div>
        </section>
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 relative">
        
        {/* Left Column: Editor's Picks (News & Literature) */}
        <div className="lg:col-span-8 flex flex-col gap-10">
          
          {/* Breaking News Section */}
          <section>
            <div className="flex items-baseline justify-between mb-6 border-b border-editorial-border pb-2">
              <h3 className="text-2xl font-serif font-black uppercase tracking-tight">Industry & Scientific News</h3>
              <span className="text-xs font-sans font-bold text-editorial-muted uppercase tracking-wider">
                {data.news.length} Reports
              </span>
            </div>
            
            {data.news.length === 0 ? (
               <p className="font-serif italic text-editorial-muted px-4 border-l-2 border-gray-200">The wire is quiet.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10 md:grid-flow-dense">
                  {data.news.map((n: any, i: number) => {
                    const isHero = i === 0;
                    const hasImage = imageIndices.has(i);
                    const isTall = hasImage && !isHero;
                    
                    return (
                      <a href={n.url || "#"} target="_blank" key={n.id} className={`block outline-none h-full ${isHero ? 'md:col-span-2' : ''} ${isTall ? 'md:row-span-2' : ''}`}>
                        <article className={`article-card group cursor-pointer relative flex flex-col h-full ${hasImage ? 'border-b border-editorial-border pb-6' : 'border-b border-gray-200 pb-4'}`}>
                          {hasImage && n.image && (
                             <div className={`relative mb-4 overflow-hidden rounded-sm w-full ${isHero ? 'h-64' : 'h-48 md:h-auto md:flex-grow min-h-[220px]'}`}>
                               <img src={n.image} alt="Article Thumbnail" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                               <div className="absolute inset-0 border border-black/10"></div>
                             </div>
                          )}
                          <div className={`flex items-center gap-2 mb-2 opacity-80 ${isTall ? 'mt-auto' : ''}`}>
                             <span className="text-[10px] uppercase font-sans font-bold tracking-widest text-[#005587]">{n.source}</span>
                             <div className="flex-grow border-t border-editorial-text hidden md:block"></div>
                          </div>
                          <h4 className={`font-serif font-bold leading-snug group-hover:text-gray-600 transition-colors group-hover:underline decoration-[1.5px] underline-offset-4 text-xl ${hasImage ? 'md:text-2xl' : 'md:text-xl'} leading-tight`}>{n.title}</h4>
                          <p className={`font-serif text-editorial-muted text-sm italic mt-2 ${hasImage ? 'line-clamp-3' : 'line-clamp-2'}`}>{n.summary}</p>
                        </article>
                      </a>
                    );
                  })}
                </div>
            )}
          </section>

          <hr className="border-t-4 border-editorial-border-dark" />

          {/* Key Literature */}
          <section>
            <div className="flex items-baseline justify-between mb-6 border-b border-editorial-border pb-2">
              <h3 className="text-2xl font-serif font-black uppercase tracking-tight">Latest Pre-Prints & Literature</h3>
               <span className="text-xs font-sans font-bold text-editorial-muted uppercase tracking-wider">
                {data.literature.length} Publications
              </span>
            </div>
            
            {data.literature.length === 0 ? (
               <p className="font-serif italic text-editorial-muted px-4 border-l-2 border-gray-200">No scholarly literature integrated today.</p>
            ) : (
            <div className="flex flex-col gap-8">
              {data.literature.map((paper: any) => (
                <article key={paper.id} className="group grid grid-cols-1 md:grid-cols-4 gap-4 border-b border-gray-100 pb-8 last:border-0 last:pb-0 cursor-pointer">
                  <div className="md:col-span-3 space-y-2 pr-0 md:pr-4">
                     <h4 className="font-serif font-bold text-2xl leading-tight group-hover:text-blue-800 transition-colors group-hover:underline decoration-[1.5px] underline-offset-4">{paper.title}</h4>
                     <p className="font-serif text-editorial-muted italic text-base">{paper.authors}</p>
                     <p className="font-sans text-sm text-editorial-text leading-relaxed mt-2">{paper.summary}</p>
                  </div>
                  <div className="md:col-span-1 flex flex-col items-start md:items-end justify-start gap-4 border-l-0 md:border-l border-editorial-border md:pl-5">
                     <span className="text-[10px] font-sans font-bold uppercase tracking-widest bg-gray-100 px-2 py-1 text-center border border-gray-200">{paper.journal}</span>
                     <a href={`https://doi.org/${paper.doi}`} className="hover-underline text-xs font-sans font-bold flex items-center gap-1 mt-auto whitespace-nowrap text-editorial-muted">
                       View Registry <ExternalLink className="w-3 h-3" />
                     </a>
                  </div>
                </article>
              ))}
            </div>
            )}
          </section>
        </div>

        {/* Separator Line */}
        <div className="hidden lg:block absolute top-0 bottom-0 right-[33.33%] w-[1px] bg-editorial-border"></div>

        {/* Right Column: Grants & Positions */}
        <div className="lg:col-span-4 flex flex-col gap-10 pl-0 lg:pl-6">
          
          {/* Grants Section */}
          <section>
             <div className="mb-6 border-b-2 border-editorial-border-dark pb-2 text-center">
              <h3 className="font-serif font-black text-lg uppercase tracking-widest">Funding Specs</h3>
            </div>
            
            {data.grants.length === 0 ? (
               <p className="font-serif text-sm italic text-editorial-muted text-center border border-dashed border-gray-200 py-4 bg-gray-50">No funding updates.</p>
            ) : (
                <div className="flex flex-col gap-6">
                  {data.grants.map((grant: any) => (
                    <a href={grant.url} target="_blank" rel="noopener noreferrer" key={grant.id} className="block outline-none group cursor-pointer border-b border-editorial-border pb-6 last:border-0">
                      <article>
                        <div className="flex items-center justify-center gap-2 mb-2">
                           <div className="w-4 border-t border-editorial-text"></div>
                           <span className="text-[9px] uppercase font-sans font-bold tracking-widest text-[#005587] text-center">{grant.agency}</span>
                           <div className="w-4 border-t border-editorial-text"></div>
                        </div>
                        <h4 className="text-xl font-serif font-bold text-center leading-snug group-hover:underline decoration-1 underline-offset-4">{grant.title}</h4>
                        <div className="text-sm font-sans font-bold mt-4 text-center bg-gray-50 py-2 border border-gray-200 group-hover:bg-[#005587] group-hover:text-white transition-colors">
                           {grant.amount}
                        </div>
                      </article>
                    </a>
                  ))}
                </div>
            )}
          </section>

          {/* Active GovGrants Section */}
          <section>
             <div className="mb-6 border-b-2 border-editorial-border-dark pb-2 text-center mt-8">
              <h3 className="font-serif font-black text-lg uppercase tracking-widest text-editorial-text">Active Postings</h3>
            </div>
            
            {!data.openGovGrants || data.openGovGrants.length === 0 ? (
               <p className="font-serif text-sm italic text-editorial-muted text-center border border-dashed border-gray-200 py-4 bg-gray-50">No urgent postings detected.</p>
            ) : (
                <div className="flex flex-col gap-6">
                  {data.openGovGrants.map((grant: any) => (
                    <a href={grant.url} target="_blank" rel="noopener noreferrer" key={grant.id} className="block outline-none group cursor-pointer border-b border-editorial-border pb-6 last:border-0">
                      <article>
                        <div className="flex items-center justify-center gap-2 mb-2">
                           <div className="w-4 border-t border-editorial-text"></div>
                           <span className="text-[9px] uppercase font-sans font-bold tracking-widest text-[#005587] text-center">{grant.agency}</span>
                           <div className="w-4 border-t border-editorial-text"></div>
                        </div>
                        <h4 className="text-xl font-serif font-bold text-center leading-snug group-hover:underline decoration-1 underline-offset-4">{grant.title}</h4>
                        <div className="text-sm font-sans font-bold mt-4 text-center bg-gray-50 py-2 border border-gray-200 group-hover:bg-[#005587] group-hover:text-white transition-colors">
                           {grant.amount}
                        </div>
                      </article>
                    </a>
                  ))}
                </div>
            )}
          </section>

          {/* Open Positions */}
          <section className="bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] bg-[#fafafa] border border-editorial-border p-6 shadow-[4px_4px_0px_#e5e5e5]">
            <div className="mb-5 border-b border-editorial-border pb-2 text-center">
              <h3 className="font-serif font-black text-sm uppercase tracking-widest">Open Classifieds</h3>
            </div>
            {data.positions.length === 0 ? (
               <p className="font-serif text-sm italic text-center text-editorial-muted">No listings.</p>
            ) : (
             <ul className="flex flex-col divide-y divide-editorial-border">
              {data.positions.map((job: any) => (
                <li key={job.id} className="py-4 group cursor-pointer block">
                  <a href={job.url} target="_blank" className="flex flex-col items-center text-center">
                     <h4 className="text-md font-serif font-bold group-hover:underline decoration-1 underline-offset-2 text-[#b02a2a]">{job.title}</h4>
                     <p className="text-[10px] font-sans text-editorial-muted mt-2 uppercase tracking-widest font-bold">{job.institution}</p>
                  </a>
                </li>
              ))}
             </ul>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
