"use client";

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/app/providers';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { Trophy, Star, TrendingUp, Search } from 'lucide-react';
import { LiteratureCard } from '@/app/LiteratureCard';

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
          if (data.date >= dateLimit && data.news) {
            data.news.forEach((newsItem: any) => {
              if (!seenIds.has(newsItem.id)) {
                seenIds.add(newsItem.id);
                // Capture the exact date it was scraped into the database
                newsItem.scrapedDate = data.date;
                allPapers.push(newsItem);
              }
            });
          }
        });

        // 3. Chronological sorting and aggressive slicing (Fix for infinite loading)
        // Sort by recency to prioritize the absolute freshest breaking news
        allPapers.sort((a, b) => new Date(b.isoDate || b.dateAdded || 0).getTime() - new Date(a.isoDate || a.dateAdded || 0).getTime());
        const recentNews = allPapers.slice(0, 100);

        // Format payload for Reverse Mapping API
        const newsPayload = recentNews.map(p => ({
          id: p.id,
          title: p.title,
          doi: p.doi || "",
          snippet: p.rawSnippet || p.summary || "",
          url: p.url || ""
        }));

        const paperMap: Record<string, any> = {};

        // 4. Batch query Semantic Scholar proxy for Reverse Mapping
        const CHUNK_SIZE = 15; // API caps at 15 items per batch
        for (let i = 0; i < newsPayload.length; i += CHUNK_SIZE) {
          const chunk = newsPayload.slice(i, i + CHUNK_SIZE);
          try {
            const res = await fetch("/api/leaderboard-batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: chunk })
            });
            if (res.ok) {
              const data = await res.json();
              data.forEach((mappedPaper: any) => {
                if (mappedPaper && mappedPaper.paperId) {
                  // Find the original item to retrieve the scraped date
                  const originalNews = recentNews.find(n => n.id === mappedPaper.originalId);
                  
                  paperMap[mappedPaper.paperId] = {
                    id: mappedPaper.originalId,
                    title: mappedPaper.title,
                    authors: mappedPaper.authors,
                    journal: "Semantic Scholar",
                    doi: mappedPaper.paperId,
                    rawAbstract: mappedPaper.abstract,
                    url: mappedPaper.url,
                    citationCount: mappedPaper.citationCount || 0,
                    influentialCitationCount: mappedPaper.influentialCitationCount || 0,
                    scrapedDate: originalNews?.scrapedDate,
                    isoDate: new Date().toISOString()
                  };
                }
              });
            }
          } catch (e) {
            console.error("Reverse mapping batch failed:", e);
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
          finalData[t] = grouped[t]
            .sort((a, b) => b.influentialCitationCount - a.influentialCitationCount || b.citationCount - a.citationCount)
            .slice(0, 10);
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
    <div className="min-h-screen pt-24 pb-32 animate-in fade-in duration-700 relative overflow-hidden">
      {/* Background Aesthetic Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#005587]/10 dark:bg-[#60a5fa]/5 blur-[120px] rounded-full pointer-events-none mix-blend-multiply dark:mix-blend-screen" />
      <div className="absolute top-[20%] right-[-10%] w-[30%] h-[50%] bg-blue-400/10 dark:bg-blue-600/10 blur-[150px] rounded-full pointer-events-none mix-blend-multiply dark:mix-blend-screen" />

      <div className="max-w-[1200px] mx-auto px-6 relative z-10">
        <header className="mb-20 text-center md:text-left">
          <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-4 mb-6">
            <div className="p-3 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50">
              <Trophy className="w-8 h-8 text-[#005587] dark:text-[#60a5fa]" />
            </div>
            <h1 className="text-4xl md:text-5xl font-serif font-black tracking-tighter uppercase bg-gradient-to-r from-gray-900 via-[#005587] to-gray-900 dark:from-white dark:via-[#60a5fa] dark:to-gray-300 bg-clip-text text-transparent pb-1">
              Impact Leaderboard
            </h1>
          </div>
          <div className="backdrop-blur-sm bg-white/40 dark:bg-black/20 border border-gray-200/50 dark:border-gray-800/50 rounded-xl p-6 md:p-8 max-w-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)]">
            <p className="text-sm md:text-base font-sans font-medium text-editorial-text/80 dark:text-editorial-muted leading-relaxed">
              Live velocity rankings computing real-world academic impact. We aggregate all science journalism from the past 30 days and algorithmically reverse-map news articles to their underlying primary papers using the Semantic Scholar Open Graph API.
            </p>
          </div>
        </header>

        {topicKeys.length === 0 ? (
          <div className="text-center py-32 backdrop-blur-md bg-white/30 dark:bg-black/20 rounded-2xl border border-dashed border-gray-300 dark:border-gray-800">
            <Search className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4 animate-pulse" />
            <p className="text-lg font-serif italic text-editorial-muted">No highly cited literature found in the past 30 days matching your parameters.</p>
          </div>
        ) : (
          <div className="space-y-32">
            {topicKeys.map((topic) => (
              <section key={topic} className="relative">
                {/* Sticky Glassmorphism Header */}
                <div className="sticky top-16 z-20 backdrop-blur-xl bg-white/70 dark:bg-[#111111]/70 py-6 border-b border-gray-200/50 dark:border-gray-800/50 mb-10 -mx-6 px-6 md:mx-0 md:px-0 rounded-b-xl shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-[#005587] dark:bg-[#60a5fa] shadow-[0_0_10px_rgba(0,85,135,0.8)] dark:shadow-[0_0_10px_rgba(96,165,250,0.8)] animate-pulse" />
                    <div>
                      <h2 className="text-2xl font-sans font-black uppercase tracking-widest text-gray-900 dark:text-white">
                        {topic}
                      </h2>
                      <p className="text-[10px] md:text-xs font-sans font-bold text-[#005587] dark:text-[#60a5fa] uppercase tracking-[0.2em] mt-1">
                        Top {leaderboardData[topic].length} Papers by Impact
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col space-y-12 pl-0 md:pl-6 relative">
                  {/* Decorative Timeline Line */}
                  <div className="hidden md:block absolute left-[-1px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-transparent via-gray-200 dark:via-gray-800 to-transparent" />
                  
                  {leaderboardData[topic].length > 0 ? (
                    leaderboardData[topic].map((paper, idx) => (
                      <div key={paper.id} className="relative group/card">
                        {/* Timeline Node */}
                        <div className="hidden md:block absolute left-[-29px] top-4 w-2 h-2 rounded-full border-2 border-white dark:border-[#111] bg-gray-300 dark:bg-gray-700 group-hover/card:bg-[#005587] dark:group-hover/card:bg-[#60a5fa] group-hover/card:scale-150 transition-all duration-300" />
                        
                        <div className="bg-white/40 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/40 p-6 md:p-8 rounded-2xl border border-gray-100 dark:border-[#222] transition-all duration-500 hover:shadow-xl hover:shadow-blue-900/5 dark:hover:shadow-blue-500/5 hover:-translate-y-1">
                          <LiteratureCard
                            paper={paper}
                            rank={idx + 1}
                            citationCount={paper.citationCount}
                            influentialCitationCount={paper.influentialCitationCount}
                            hideAbstract={true}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-12 rounded-2xl border border-dashed border-gray-300/50 dark:border-gray-800/50 text-center backdrop-blur-sm bg-gray-50/30 dark:bg-black/10">
                      <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                        <span className="text-gray-400 dark:text-gray-500 text-lg">/</span>
                      </div>
                      <p className="text-sm font-serif italic text-gray-500 dark:text-gray-400">
                        No high-impact news coverage was found reversing to primary literature for this topic in the past 30 days.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
