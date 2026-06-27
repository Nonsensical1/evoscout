"use client";

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/app/providers';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { Trophy, Star, TrendingUp, Search } from 'lucide-react';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leaderboardData, setLeaderboardData] = useState<Record<string, any[]>>({});
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!user || hasFetched.current) return;
    hasFetched.current = true;

    async function loadLeaderboard() {
      try {
        // 1. Fetch user routing parameters
        const settingsSnap = await getDoc(doc(db, 'users', user!.uid, 'settings', 'config'));
        const settings = settingsSnap.exists() ? settingsSnap.data() : {};
        
        let rawTopics = "";
        if (settings.topics?.literature && settings.topics.literature.trim() !== '') {
          rawTopics = settings.topics.literature;
        } else {
          rawTopics = "CRISPR, Cas9, RNA, DNA, synthetic biology, gene editing, cancer, oncology, metabolism, computational, epigenetic, genomics, SunTag, prime edit, prime editing, base edit";
        }
        const topics = Array.from(new Set(rawTopics.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)));

        // 2. Fetch past 30 days of literature
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateLimit = thirtyDaysAgo.toISOString();

        const q = query(collection(db, 'users', user!.uid, 'ledger'), orderBy('date', 'desc'));
        const ledgerSnap = await getDocs(q);
        
        let allPapers: any[] = [];
        const seenIds = new Set();

        ledgerSnap.forEach(doc => {
          const data = doc.data();
          if (data.date >= dateLimit && data.literature) {
            data.literature.forEach((paper: any) => {
              if (!seenIds.has(paper.id)) {
                seenIds.add(paper.id);
                allPapers.push(paper);
              }
            });
          }
        });

        // 3. Format IDs for Semantic Scholar
        const ssIds: string[] = [];
        const paperMap: Record<string, any> = {};

        allPapers.forEach(p => {
          let ssId = null;
          if (p.id.startsWith("ARXIV-")) {
            ssId = `ARXIV:${p.id.replace("ARXIV-", "")}`;
          } else if (p.id.startsWith("PUBMED-")) {
            ssId = `PMID:${p.id.replace("PUBMED-", "")}`;
          } else if (p.id.startsWith("BIORXIV-")) {
            ssId = `DOI:${p.id.replace("BIORXIV-", "")}`;
          } else if (p.doi) {
            ssId = `DOI:${p.doi}`;
          }
          
          if (ssId) {
            ssIds.push(ssId);
            paperMap[ssId] = { ...p, citationCount: 0, influentialCitationCount: 0 };
          }
        });

        // 4. Batch query Semantic Scholar
        const CHUNK_SIZE = 500;
        for (let i = 0; i < ssIds.length; i += CHUNK_SIZE) {
          const chunk = ssIds.slice(i, i + CHUNK_SIZE);
          try {
            const res = await fetch("https://api.semanticscholar.org/graph/v1/paper/batch?fields=citationCount,influentialCitationCount", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: chunk })
            });
            if (res.ok) {
              const data = await res.json();
              data.forEach((item: any, idx: number) => {
                const requestedId = chunk[idx];
                if (item) {
                  paperMap[requestedId].citationCount = item.citationCount || 0;
                  paperMap[requestedId].influentialCitationCount = item.influentialCitationCount || 0;
                }
              });
            }
          } catch (e) {
            console.error("Semantic Scholar batch failed:", e);
          }
        }

        // 5. Group by topics
        const grouped: Record<string, any[]> = {};
        topics.forEach(t => grouped[t] = []);

        Object.values(paperMap).forEach(paper => {
          const content = `${paper.title || ''} ${paper.rawAbstract || ''}`.toLowerCase();
          topics.forEach(topic => {
            if (content.includes(topic)) {
              grouped[topic].push(paper);
            }
          });
        });

        // 6. Sort and slice top 10
        const finalData: Record<string, any[]> = {};
        topics.forEach(t => {
          if (grouped[t].length > 0) {
            finalData[t] = grouped[t]
              .sort((a, b) => b.influentialCitationCount - a.influentialCitationCount || b.citationCount - a.citationCount)
              .slice(0, 10);
          }
        });

        setLeaderboardData(finalData);
      } catch (err) {
        console.error("Failed to load leaderboard:", err);
      } finally {
        setLoading(false);
      }
    }

    loadLeaderboard();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center font-serif italic text-editorial-muted gap-4">
        <Trophy className="w-12 h-12 animate-pulse text-[#005587] dark:text-[#60a5fa]" />
        Aggregating live academic impact metrics...
      </div>
    );
  }

  const topicKeys = Object.keys(leaderboardData).sort();

  return (
    <div className="min-h-screen pt-24 pb-32 animate-in fade-in duration-500">
      <div className="max-w-[1600px] mx-auto px-6">
        <header className="mb-16 border-b border-editorial-border pb-8 text-center md:text-left">
          <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-4 mb-4">
            <Trophy className="w-10 h-10 text-[#005587] dark:text-[#60a5fa]" />
            <h1 className="text-4xl font-serif font-black tracking-tighter uppercase text-editorial-text">
              Monthly Impact Leaderboard
            </h1>
          </div>
          <p className="text-sm font-sans font-medium text-editorial-muted uppercase tracking-widest max-w-3xl mx-auto md:mx-0">
            Live velocity rankings for literature scraped over the past 30 days. Metrics are dynamically synced with the Semantic Scholar Open Graph API, emphasizing highly influential citations.
          </p>
        </header>

        {topicKeys.length === 0 ? (
          <div className="text-center py-20 border border-editorial-border bg-gray-50/50 dark:bg-black/20">
            <Search className="w-12 h-12 text-editorial-border mx-auto mb-4" />
            <p className="text-lg font-serif italic text-editorial-muted">No highly cited literature found in the past 30 days matching your parameters.</p>
          </div>
        ) : (
          <div className="space-y-24">
            {topicKeys.map((topic) => (
              <section key={topic}>
                <div className="mb-8 border-l-4 border-[#005587] dark:border-[#2563eb] pl-4">
                  <h2 className="text-2xl font-sans font-black uppercase tracking-widest text-editorial-text">
                    {topic}
                  </h2>
                  <p className="text-xs font-sans font-bold text-editorial-muted uppercase tracking-wider mt-1">
                    Top {leaderboardData[topic].length} Papers by Impact
                  </p>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {leaderboardData[topic].map((paper, idx) => {
                    const isGold = idx === 0;
                    const isSilver = idx === 1;
                    const isBronze = idx === 2;
                    
                    let badgeColor = "bg-gray-100 dark:bg-[#1a1a1a] text-editorial-muted";
                    let borderGlow = "border-editorial-border";
                    
                    if (isGold) {
                      badgeColor = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
                      borderGlow = "border-amber-300 dark:border-amber-700/50 shadow-[0_0_15px_rgba(251,191,36,0.1)]";
                    } else if (isSilver) {
                      badgeColor = "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                      borderGlow = "border-slate-300 dark:border-slate-600 shadow-[0_0_15px_rgba(148,163,184,0.1)]";
                    } else if (isBronze) {
                      badgeColor = "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
                      borderGlow = "border-orange-300 dark:border-orange-700/50 shadow-[0_0_15px_rgba(251,146,60,0.1)]";
                    }

                    return (
                      <div key={paper.id} className={`flex flex-col md:flex-row gap-6 p-6 border bg-white dark:bg-[#111111] transition-all hover:shadow-lg ${borderGlow}`}>
                        
                        <div className="flex-shrink-0 flex md:flex-col items-center justify-between md:justify-start gap-4 w-full md:w-32">
                          <div className={`flex items-center justify-center w-12 h-12 rounded-full font-serif font-black text-xl ${badgeColor}`}>
                            #{idx + 1}
                          </div>
                          <div className="flex flex-row md:flex-col gap-4 text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-2xl font-black font-sans text-editorial-text">{paper.influentialCitationCount}</span>
                              <span className="text-[9px] font-sans font-bold text-[#005587] dark:text-[#60a5fa] uppercase tracking-widest flex items-center gap-1">
                                <Star className="w-3 h-3" /> Influential
                              </span>
                            </div>
                            <div className="w-px h-8 bg-editorial-border md:w-8 md:h-px mx-auto"></div>
                            <div className="flex flex-col items-center">
                              <span className="text-xl font-black font-sans text-editorial-muted">{paper.citationCount}</span>
                              <span className="text-[9px] font-sans font-bold text-editorial-muted uppercase tracking-widest flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" /> Total
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex-grow flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <span className="px-2 py-0.5 bg-gray-100 dark:bg-[#1a1a1a] border border-editorial-border text-[9px] font-bold font-sans uppercase tracking-widest text-editorial-muted">
                                {paper.journal}
                              </span>
                              <span className="text-xs font-sans font-bold text-editorial-muted">
                                {new Date(paper.isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                            
                            <a href={paper.doi?.startsWith('http') ? paper.doi : (paper.doi ? `https://doi.org/${paper.doi}` : '#')} target="_blank" rel="noopener noreferrer" className="group block mb-3">
                              <h3 className="text-lg md:text-xl font-serif font-bold text-editorial-text group-hover:text-[#005587] dark:group-hover:text-[#60a5fa] leading-snug transition-colors">
                                {paper.title}
                              </h3>
                            </a>
                            
                            <p className="text-xs font-sans text-editorial-muted line-clamp-3 mb-4 leading-relaxed">
                              {paper.rawAbstract}
                            </p>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-auto">
                            <span className="text-[10px] font-sans font-bold text-editorial-text uppercase tracking-wider bg-gray-50 dark:bg-[#1a1a1a] px-2 py-1">
                              {paper.institution}
                            </span>
                            <span className="text-[10px] font-sans text-editorial-muted uppercase tracking-widest truncate max-w-xs">
                              {paper.authors}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
