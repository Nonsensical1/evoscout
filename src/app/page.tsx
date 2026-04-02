"use client";

import { useState, useEffect, useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '@/app/providers';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, writeBatch, collection, addDoc } from 'firebase/firestore';

export default function Home() {
  const { user } = useAuth();
  const [data, setData] = useState({ grants: [], openGovGrants: [], news: [], literature: [], positions: [] });
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");

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

  const handleRunScraper = async () => {
    if (!user) return;
    setActionMessage("Extracting Context...");
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

      const [settingsSnap, historySnap, feedSnap] = await Promise.all([
         getDoc(doc(db, 'users', user.uid, 'settings', 'config')),
         getDoc(doc(db, 'users', user.uid, 'scouted', 'history')),
         getDoc(doc(db, 'users', user.uid, 'daily', 'feed'))
      ]);

      const settings = settingsSnap.exists() ? settingsSnap.data() : { newsLimit: 50, grantsLimit: 50, literatureLimit: 50, positionsLimit: 50, topics: {} };
      const historyArr = historySnap.exists() ? historySnap.data()?.hashes || [] : [];
      const history = new Set(historyArr);
      let dailyFeed: any = feedSnap.exists() ? feedSnap.data() : { date: today, grants: [], openGovGrants: [], news: [], literature: [], positions: [] };

      // Archive if new day
      if (dailyFeed.date !== today) {
        const hasItems = dailyFeed.grants?.length || dailyFeed.news?.length || dailyFeed.literature?.length || dailyFeed.positions?.length;
        if (hasItems) {
           await addDoc(collection(db, 'users', user.uid, 'ledger'), dailyFeed);
        }
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

      processCategory(liveData.grants, 'grants', settings.grantsLimit || 50);
      if (liveData.openGovGrants) processCategory(liveData.openGovGrants, 'openGovGrants', settings.grantsLimit || 50);
      processCategory(liveData.news, 'news', settings.newsLimit || 50);
      processCategory(liveData.literature, 'literature', settings.literatureLimit || 50);
      processCategory(liveData.positions, 'positions', settings.positionsLimit || 50);

      const batch = writeBatch(db);
      batch.set(doc(db, 'users', user.uid, 'daily', 'feed'), dailyFeed);
      batch.set(doc(db, 'users', user.uid, 'scouted', 'history'), { hashes: historyArr });
      await batch.commit();

      setActionMessage(`Scraper Complete: Added ${addedCount} items, skipped ${skippedCount} duplicates/over-quota.`);

    } catch (e: any) {
      console.error(e);
      setActionMessage("Error running scraper: " + e.message);
    }
    setTimeout(() => setActionMessage(""), 5000);
  };

  useEffect(() => {
    if (!user) return;
    
    // Listen to live database feed locally to auto-refresh the UI when scraper finishes!
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'daily', 'feed'), (docSnap) => {
      if (docSnap.exists()) {
        const feed = docSnap.data();
        const now = new Date();
        const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
        
        if (feed.date && feed.date !== today) {
           setActionMessage("New day detected. Initializing engine...");
           handleRunScraper();
        } else {
           setData({
             grants: feed.grants || [],
             openGovGrants: feed.openGovGrants || [],
             news: feed.news || [],
             literature: feed.literature || [],
             positions: feed.positions || []
           });
           setLoading(false);
        }
      } else {
        // Document does not exist yet (first sign-in)
        handleRunScraper();
      }
    });

    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);


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
          </div>
        </div>
      </section>

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
