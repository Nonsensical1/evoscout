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
  const [topicScores, setTopicScores] = useState<Record<string, number>>({});
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
        if (settings.topics?.news && settings.topics.news.trim() !== '') {
          rawTopics = settings.topics.news;
        } else {
          rawTopics = "CRISPR, Cas9, Cas12, gene, cell, RNA, proteomics, synthetic biology, epigenetic, microbiome, cancer, DNA, pathology, zoology";
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

        // 3. Group by topics BEFORE slicing to guarantee articles per topic!
        const preGrouped: Record<string, any[]> = {};
        topics.forEach(t => preGrouped[t] = []);
        const addedPre = new Set<string>();

        allPapers.forEach(paper => {
          if (paper.matchedTopic) {
             const topicMatched = topics.find(t => t.toLowerCase() === paper.matchedTopic.toLowerCase());
             if (topicMatched) {
                if (!addedPre.has(paper.id)) {
                  preGrouped[topicMatched].push(paper);
                  addedPre.add(paper.id);
                }
                return;
             }
          }
          const content = `${paper.title || ''} ${paper.summary || ''}`.toLowerCase();
          for (const topic of topics) {
            if (content.includes(topic)) {
              if (!addedPre.has(paper.id)) {
                preGrouped[topic].push(paper);
                addedPre.add(paper.id);
                break;
              }
            }
          }
        });

        // 4. Extract the top 15 most recent articles FOR EACH TOPIC
        const payloadItems: any[] = [];
        const payloadIds = new Set();

        topics.forEach(topic => {
          preGrouped[topic].sort((a, b) => new Date(b.isoDate || b.dateAdded || 0).getTime() - new Date(a.isoDate || a.dateAdded || 0).getTime());
          const top15 = preGrouped[topic].slice(0, 15);
          top15.forEach(p => {
             if (!payloadIds.has(p.id)) {
                payloadIds.add(p.id);
                payloadItems.push(p);
             }
          });
        });

        // Format payload for Reverse Mapping API
        const newsPayload = payloadItems.map(p => ({
          id: p.id,
          title: p.title,
          doi: p.doi || "",
          snippet: p.rawSnippet || p.summary || "",
          url: p.url || ""
        }));

        const paperMap: Record<string, any> = {};

        // 5. Batch query Semantic Scholar proxy for Reverse Mapping
        const CHUNK_SIZE = 15; 
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
                  const originalNews = payloadItems.find(n => n.id === mappedPaper.originalId);
                  if (!paperMap[mappedPaper.paperId]) {
                    paperMap[mappedPaper.paperId] = {
                      id: mappedPaper.originalId,
                      title: mappedPaper.title,
                      authors: mappedPaper.authors,
                      journal: originalNews?.source || "Semantic Scholar",
                      doi: mappedPaper.paperId,
                      rawAbstract: mappedPaper.abstract,
                      url: originalNews?.url || mappedPaper.url,
                      citationCount: mappedPaper.citationCount || 0,
                      influentialCitationCount: mappedPaper.influentialCitationCount || 0,
                      scrapedDate: originalNews?.scrapedDate,
                      isoDate: new Date().toISOString(),
                      newsCoverageCount: 1, // Track collisions as native velocity
                      matchedTopic: originalNews?.matchedTopic || ""
                    };
                  } else {
                    // This specific DOI was reported on by multiple independent news outlets!
                    paperMap[mappedPaper.paperId].newsCoverageCount += 1;
                  }
                }
              });
            }
          } catch (e) {
            console.error("Reverse mapping batch failed:", e);
          }
        }

        // 6. Map the resolved semantic scholar papers back into their topics
        const finalGrouped: Record<string, any[]> = {};
        topics.forEach(t => finalGrouped[t] = []);
        const addedFinal = new Set<string>();

        Object.values(paperMap).forEach(paper => {
          if (paper.matchedTopic) {
             const topicMatched = topics.find(t => t.toLowerCase() === paper.matchedTopic.toLowerCase());
             if (topicMatched) {
                if (!addedFinal.has(paper.doi)) {
                  finalGrouped[topicMatched].push(paper);
                  addedFinal.add(paper.doi);
                }
                return;
             }
          }
          const content = `${paper.title || ''} ${paper.rawAbstract || ''}`.toLowerCase();
          for (const topic of topics) {
            if (content.includes(topic)) {
              if (!addedFinal.has(paper.doi)) {
                finalGrouped[topic].push(paper);
                addedFinal.add(paper.doi);
                break;
              }
            }
          }
        });

        // 7. Sort papers within topics, and tally up the total citations per topic
        const finalData: Record<string, any[]> = {};
        const newScores: Record<string, number> = {};

        topics.forEach(t => {
          finalData[t] = finalGrouped[t]
            .sort((a, b) => 
               (b.newsCoverageCount || 0) - (a.newsCoverageCount || 0) || 
               b.influentialCitationCount - a.influentialCitationCount || 
               b.citationCount - a.citationCount
            )
            .slice(0, 10); // Ensure max 10 rendered per topic

          // Sum news coverage (weighted heavily) + citations for this topic to determine section rendering order
          newScores[t] = finalData[t].reduce((sum, paper) => sum + ((paper.newsCoverageCount || 0) * 100) + (paper.citationCount || 0) + (paper.influentialCitationCount || 0), 0);
        });

        setLeaderboardData(finalData);
        setTopicScores(newScores);
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

  const topicKeys = Object.keys(leaderboardData).sort((a, b) => (topicScores[b] || 0) - (topicScores[a] || 0));

  return (
    <div className="animate-in fade-in duration-700">
        {/* Newspaper Header */}
        <header className="mb-16 text-center border-b-[3px] border-black dark:border-white pb-6">
          <div className="flex flex-col md:flex-row justify-between items-center border-y-[1.5px] border-black dark:border-white py-3 mt-4 gap-4 md:gap-0">
            <span className="font-sans text-xs md:text-sm font-black uppercase tracking-[0.2em] text-black dark:text-white w-full md:w-1/3 text-center md:text-left">
            </span>
            <span className="font-sans text-xs md:text-sm font-black uppercase tracking-[0.2em] text-black dark:text-white w-full md:w-1/3 text-center">
              LIVE MONTHLY RANKINGS
            </span>
            <span className="font-serif italic text-sm md:text-base font-bold text-[#005587] dark:text-[#60a5fa] uppercase tracking-widest w-full md:w-1/3 text-center md:text-right">
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          </div>
          <p className="font-sans text-base text-editorial-muted mt-8 max-w-2xl mx-auto leading-relaxed">
            An algorithmic aggregation of all global science journalism from the past thirty days, strictly reverse-mapped to their underlying primary academic publications to measure real-world velocity.
          </p>
        </header>

        {topicKeys.length === 0 ? (
          <div className="text-center py-32 border-[1.5px] border-black dark:border-white bg-[#f4f3f0] dark:bg-[#151515]">
            <p className="text-2xl font-serif italic text-black dark:text-white">No highly cited literature recorded for this volume.</p>
          </div>
        ) : (
          <div className="space-y-24">
            {topicKeys.map((topic) => (
              <section key={topic} className="border-t-[4px] border-black dark:border-white pt-8">
                {/* Classic Section Header */}
                <div className="flex flex-col md:flex-row justify-between items-baseline mb-12 border-b-[1.5px] border-black dark:border-white pb-4">
                  <h3 className="text-2xl font-serif font-black uppercase tracking-tight text-black dark:text-white">
                    {topic}
                  </h3>
                  <span className="text-xs font-sans font-bold uppercase tracking-[0.25em] text-[#005587] dark:text-[#60a5fa]">
                    Top {leaderboardData[topic].length} Papers
                  </span>
                </div>

                <div className="flex flex-col space-y-0">
                  {leaderboardData[topic].length > 0 ? (
                    leaderboardData[topic].map((paper, idx) => (
                      <div key={paper.id} className="flex flex-col lg:flex-row gap-6 lg:gap-12 border-b border-gray-300 dark:border-[#333] pb-10 mb-10 last:border-0 last:pb-0 last:mb-0">
                        {/* Newspaper NO. 01 style Typography */}
                        <div className="lg:w-32 shrink-0 flex items-start pt-2">
                          <span className="font-sans font-black text-2xl md:text-3xl tracking-tighter text-black dark:text-white opacity-90">
                            NO. {(idx + 1).toString().padStart(2, '0')}
                          </span>
                        </div>
                        
                        <div className="flex-1">
                          <LiteratureCard
                            paper={paper}
                            rank={idx + 1}
                            citationCount={paper.citationCount}
                            influentialCitationCount={paper.influentialCitationCount}
                            newsCoverageCount={paper.newsCoverageCount}
                            hideAbstract={true}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-16 border-[1.5px] border-black dark:border-white text-center bg-[#f4f3f0] dark:bg-[#151515]">
                      <p className="text-xl font-serif italic text-black dark:text-white">
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
  );
}
