import { NextResponse } from 'next/server';
import Parser from 'rss-parser';

// Utility to shuffle array
function shuffleArray(array: any[]) {
  return array.sort(() => 0.5 - Math.random());
}

async function fetchLiveData(topicsMap: any = {}) {
  const parseTopics = (str: string | undefined, fallback: string[]) => str ? str.split(',').map((s: string) => s.trim()).filter(Boolean) : fallback;
  const parser = new Parser();
  const results: any = { grants: [], openGovGrants: [], news: [], literature: [], positions: [] };
  const usedImages = new Set<string>(); // Global pool to prevent duplicate photos

  const getProminentWord = (title: string) => {
    const preferredWords = ['CRISPR', 'Cas9', 'Cas12', 'RNA', 'DNA', 'gene', 'cell', 'cancer', 'tumor', 'bacteria', 'virus', 'molecular', 'synthetic', 'epigenetic', 'genetics', 'pathology', 'brain', 'immune', 'protein', 'proteomics', 'metabolism', 'quantum', 'neuro', 'biology', 'microbiome', 'therapy', 'zoology'];
    const titleLower = (title || "").toLowerCase();

    for (const pref of preferredWords) {
      const regex = new RegExp(`\\b${pref.toLowerCase()}\\b`);
      if (regex.test(titleLower)) {
        return pref;
      }
    }

    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'of', 'about', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'may', 'might', 'must', 'new', 'how', 'why', 'what', 'where', 'when', 'who', 'which', 'study', 'research', 'scientists', 'discover', 'discovery', 'finds', 'findings', 'shows', 'reveals', 'uncovers', 'identifies', 'novel', 'allows', 'using', 'during', 'expression', 'mechanism', 'analysis', 'through', 'between', 'human', 'their', 'these', 'those', 'that', 'this', 'than', 'then']);
    const words = (title || "").replace(/[^a-zA-Z0-9 -]/g, '').split(/[ -]+/);
    let longest = "biology";
    let maxLen = 0;
    for (const w of words) {
      const lower = w.toLowerCase();
      if (!stopWords.has(lower) && w.length > maxLen) {
        longest = w;
        maxLen = w.length;
      }
    }
    return longest;
  };

  try {
    const todayVal = new Date();
    const thirtyDaysAgo = new Date(todayVal.getTime() - 30 * 24 * 60 * 60 * 1000);
    const formatDateNSF = (date: Date) => `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
    const formatDateNIH = (date: Date) => date.toISOString().split('T')[0];

    const nsfTopics = parseTopics(topicsMap.grants, [
      "molecular+biology", "bioinformatics", "proteomics", "genomics",
      "epigenetics", "translational+science", "pathology", "zoology"
    ]);
    const nihTopics = parseTopics(topicsMap.grants, [
      "molecular biology", "bioinformatics", "proteomics", "genomics",
      "epigenetics", "translational science", "pathology", "zoology"
    ]);

    const topicIdx = Math.floor(Math.random() * nsfTopics.length);
    const randomKeywordNSF = nsfTopics[topicIdx];
    const randomKeywordNIH = nihTopics[topicIdx % nihTopics.length];

    let allGrants: any[] = [];

    // NSF Scrape
    try {
      const nsfRes = await fetch(`https://api.nsf.gov/services/v1/awards.json?keyword=${randomKeywordNSF}&printFields=id,title,awardeeName,fundsObligatedAmt&dateStart=${formatDateNSF(thirtyDaysAgo)}`);
      if (nsfRes.ok) {
        const nsfData = await nsfRes.json();
        const awards = nsfData.response?.award || [];
        const mappedNSF = awards.map((a: any) => ({
          id: `NSF-${a.id}`,
          title: a.title,
          agency: a.awardeeName || "National Science Foundation",
          amount: a.fundsObligatedAmt ? `$${Number(a.fundsObligatedAmt).toLocaleString()}` : "N/A",
          url: `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${a.id}`
        }));
        allGrants = allGrants.concat(mappedNSF);
      }
    } catch (e) { console.error("NSF Grant Fetch Error:", e); }

    // NIH Scrape
    try {
      const nihRes = await fetch(`https://api.reporter.nih.gov/v2/projects/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criteria: {
            advanced_text_search: { search_text: randomKeywordNIH },
            project_start_date: {
              from_date: formatDateNIH(thirtyDaysAgo),
              to_date: formatDateNIH(todayVal)
            }
          },
          offset: 0,
          limit: 30
        })
      });

      if (nihRes.ok) {
        const nihData = await nihRes.json();
        const awards = nihData.results || [];
        const mappedNIH = awards.map((a: any) => ({
          id: `NIH-${a.appl_id}`,
          title: a.project_title,
          agency: a.organization?.org_name || "NIH Research Institute",
          amount: a.award_amount ? `$${Number(a.award_amount).toLocaleString()}` : "N/A",
          url: a.project_detail_url || `https://reporter.nih.gov/project-details/${a.appl_id}`
        }));
        allGrants = allGrants.concat(mappedNIH);
      }
    } catch (e) { console.error("NIH Grant Fetch Error:", e); }

    results.grants = shuffleArray(allGrants);

    // GovGrants Scrape (Expanding Window)
    try {
      let activeGovGrants: any[] = [];
      const intervals = [48, 7 * 24, 14 * 24]; // hours limit
      const govTopics = parseTopics(topicsMap.openGovGrants, nihTopics);
      const randomKeywordGov = govTopics[Math.floor(Math.random() * govTopics.length)];
      
      for (const hours of intervals) {
        const timeLimit = Date.now() - hours * 60 * 60 * 1000;
        
        const govRes = await fetch(`https://apply07.grants.gov/grantsws/rest/opportunities/search/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: randomKeywordGov })
        });
        
        if (govRes.ok) {
          const govData = await govRes.json();
          const hits = govData.oppHits || [];
          
          const recentOpen = hits.filter((h: any) => {
            if (h.oppStatus !== 'posted') return false;
            if (!h.openDate) return false;
            const openDate = new Date(h.openDate).getTime();
            return openDate >= timeLimit;
          });
          
          if (recentOpen.length > 0) {
            activeGovGrants = recentOpen.map((h: any) => ({
              id: `GOV-${h.id}`,
              title: h.title,
              agency: h.agencyCode || h.agency || "Grants.gov",
              amount: "Details at Registry", // GovGrants search doesn't natively expose discrete obligation totals
              url: `https://www.grants.gov/search-results-detail/${h.id}`
            }));
            break; // Stop expanding window
          }
        }
      }
      results.openGovGrants = shuffleArray(activeGovGrants);
    } catch (e) { console.error("Gov Grants Fetch Error:", e); }

  } catch (e) { console.error("Master Grant Pipeline Error:", e); }

  try {
    const rssFeeds = [
      { url: 'https://www.nature.com/nature.rss', source: 'Nature' },
      { url: 'https://www.science.org/rss/news_current.xml', source: 'Science Mag' },
      { url: 'https://phys.org/rss-feed/biology-news/', source: 'Phys.org' },
      { url: 'https://www.cell.com/cell/inpress.rss', source: 'Cell Press' }
    ];
    let allNews: any[] = [];
    const newsTermsSafe = topicsMap.news ? topicsMap.news.split(',').map((s:string)=>s.trim()).filter(Boolean).join('|') : "CRISPR|Cas9|Cas12|gene|cell|RNA|proteomics|synthetic biology|epigenetic|microbiome|cancer|pathology|zoology";
    const biologicalTerms = new RegExp(newsTermsSafe, 'i');
    const twentyFourHoursAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

    for (const feedConfig of rssFeeds) {
      try {
        const feed = await parser.parseURL(feedConfig.url);
        const filteredNews = feed.items.filter((item: any) => {
          const isBioMatch = biologicalTerms.test(item.title || '') || biologicalTerms.test(item.contentSnippet || '');
          const isRecent = item.isoDate ? (new Date(item.isoDate).getTime() > twentyFourHoursAgo) : true;
          return isBioMatch && isRecent;
        });

        const mapped = await Promise.all(filteredNews.map(async (item: any, i: number) => {
          let image = "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?ixlib=rb-1.2.1&auto=format&fit=crop&w=1200&q=80";
          if (item.enclosure?.url) {
            image = item.enclosure.url;
          } else {
            try {
              const searchKeyword = getProminentWord(item.title);
              const KeywordQuery = searchKeyword + " science"
              const pexelsRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(KeywordQuery)}&per_page=15`, {
                headers: { Authorization: "c5w6mctmy3dgyaA69iUsDjgccGUojIlKEa3Y8JtsLU2yJm2HUp2gjQy6" }
              });
              if (pexelsRes.ok) {
                const pexelsData = await pexelsRes.json();
                if (pexelsData.photos && pexelsData.photos.length > 0) {
                  const availablePhotos = pexelsData.photos.filter((p: any) => !usedImages.has(p.src.large));
                  if (availablePhotos.length > 0) {
                    const randomIdx = Math.floor(Math.random() * availablePhotos.length);
                    image = availablePhotos[randomIdx].src.large;
                    usedImages.add(image);
                  } else if (!usedImages.has(pexelsData.photos[0].src.large)) {
                    image = pexelsData.photos[0].src.large;
                    usedImages.add(image);
                  }
                }
              }
            } catch (e) { }
          }
          return {
            id: `NEWS-${feedConfig.source.substring(0, 3).toUpperCase()}-${item.guid || item.link || i}`.replace(/[^a-zA-Z0-9-]/g, ''),
            title: item.title || "Science Update",
            source: feedConfig.source,
            url: item.link || "",
            image: image,
            rawSnippet: item.contentSnippet
          };
        }));
        allNews = allNews.concat(mapped);
      } catch (e) { console.error(`News Fetch Error for ${feedConfig.source}:`, e); }
    }

    results.news = shuffleArray(allNews);
  } catch (e) { console.error("Top-level News Fetch Error:", e); }

  try {
    let end = new Date();
    let start = new Date();
    const dStr = (d: Date) => d.toISOString().split('T')[0];
    
    let bioRes = await fetch(`https://api.biorxiv.org/details/biorxiv/${dStr(start)}/${dStr(end)}`);
    let bioText = await bioRes.text();
    
    // BioRxiv crashes and returns HTML if you query a UTC date that hasn't started in the US yet.
    if (bioText.startsWith('<')) {
        end.setDate(end.getDate() - 1);
        start.setDate(start.getDate() - 1);
        bioRes = await fetch(`https://api.biorxiv.org/details/biorxiv/${dStr(start)}/${dStr(end)}`);
        bioText = await bioRes.text();
    }
    
    if (bioRes.ok && !bioText.startsWith('<')) {
      const bioData = JSON.parse(bioText);
      let papers = bioData.collection || [];
      const litTermsSafe = topicsMap.literature ? topicsMap.literature.split(',').map((s:string)=>s.trim()).filter(Boolean).join('|') : "CRISPR|Cas9|RNA|DNA|synthetic biology|gene editing|cancer|oncology|metabolism|computational|epigenetic|genomics|SunTag|prime edit|base edit";
      const advancedTopics = new RegExp(litTermsSafe, 'i');
      let filtered = papers.filter((p: any) => advancedTopics.test(p.title || '') || advancedTopics.test(p.abstract || ''));
      if (filtered.length < 5) filtered = papers;

      const uniquePapers = Array.from(new Map(filtered.map((p: any) => [p.doi, p])).values()) as any[];
      results.literature = shuffleArray(uniquePapers).map((p: any) => ({
        id: `LIT-${p.doi}`,
        title: p.title,
        authors: p.authors || "Various Authors",
        journal: "bioRxiv",
        doi: p.doi,
        rawAbstract: p.abstract
      }));
    }
  } catch (e) { console.error("Lit Fetch Error:", e); }

  try {
    const defaultPortals = [
      { i: "Broad Institute", u: "https://broadinstitute.wd1.myworkdayjobs.com/broad_institute_careers?q=biology" },
      { i: "HHMI Janelia", u: "https://www.hhmi.org/careers" },
      { i: "Wyss Institute", u: "https://wyss.harvard.edu/about/careers/" },
      { i: "Ginkgo Bioworks", u: "https://www.ginkgobioworks.com/careers/" },
      { i: "Dana-Farber", u: "https://careers.dana-farber.org/" },
      { i: "NIH", u: "https://hr.nih.gov/jobs/search/scientific" },
      { i: "Cold Spring Harbor", u: "https://cshl.edu/careers/" },
      { i: "Nature Careers", u: "https://www.nature.com/naturecareers/jobs/biology" },
      { i: "Science Careers", u: "https://jobs.sciencecareers.org/jobs/biology/" },
      { i: "Scripps Research", u: "https://careers.scripps.edu/" },
      { i: "Salk Institute", u: "https://www.salk.edu/about/careers/" }
    ];

    const requestedInstitutions = parseTopics(topicsMap.careerInstitutions, defaultPortals.map(p => p.i));
    const requestedTitles = parseTopics(topicsMap.careerTitles, ["Entry-Level Biology", "Genomics Research", "Postdoctoral Fellow"]);

    const curatedJobs: any[] = [];
    
    // Mix and match user-requested topics or fallback to the live portal mappings
    requestedInstitutions.forEach(inst => {
      const portal = defaultPortals.find(p => p.i.toLowerCase() === inst.toLowerCase());
      const jobDomainUrl = portal ? portal.u : `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(inst + " science")}`;
      
      requestedTitles.forEach(t => {
         curatedJobs.push({
            t: `Active Openings: ${t}`,
            i: inst,
            l: "See posting",
            u: jobDomainUrl
         });
      });
    });

    results.positions = shuffleArray(curatedJobs).map((item: any) => {
      const stableId = `JOB-${item.t}-${item.i}`.replace(/[^a-zA-Z0-9]/g, '');
      return {
        id: stableId,
        title: item.t,
        institution: item.i,
        location: item.l,
        url: item.u,
        dateAdded: new Date().toISOString()
      };
    });
  } catch (e) { console.error("Job Custom Fetch Error:", e); }

  try {
    const summarizedItems = [
      ...results.news.map((n: any) => ({ id: n.id, text: n.rawSnippet || "" })),
      ...results.literature.map((l: any) => ({ id: l.id, text: l.rawAbstract || "" }))
    ].filter(item => item.text.length > 50);

    const chunkArray = (arr: any[], size: number) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
         chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const batches = chunkArray(summarizedItems, 20);
    const masterSummaryDict: any = {};

    const batchPromises = batches.map(async (batch) => {
      try {
        const prompt = `Summarize the following scientific articles into a 2-3 sentence AI summary. Return ONLY a strict JSON object mapping the article 'id' to the 'summary' string. Do not use markdown wrappers. Articles: ${JSON.stringify(batch)}`;
        const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyAXG4wjpWKj7eMng9ClEA27vmCRVUZnWPM`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        });
        
        if (!gRes.ok) throw new Error(`Gemini API Error: ${gRes.status}`);
        const gData = await gRes.json();
        const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const parsed = JSON.parse(rawText);
        Object.assign(masterSummaryDict, parsed);
      } catch (e) {
        console.error("Gemini batch failure:", e);
      }
    });
    
    await Promise.all(batchPromises);

    results.news = results.news.map((n: any) => ({
      ...n,
      summary: masterSummaryDict[n.id] || (n.rawSnippet ? n.rawSnippet.substring(0, 150) + "..." : "Special editorial reporting on sector advancements, diving deep into technical feasibility.")
    }));

    results.literature = results.literature.map((l: any) => ({
      ...l,
      summary: masterSummaryDict[l.id] || (l.rawAbstract ? l.rawAbstract.substring(0, 150) + "..." : "Early reviews indicate substantial progress in targeted methodologies, potentially altering widespread paradigms.")
    }));
  } catch(e) { console.error("Gemini pipeline error:", e); }

  return results;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const liveData = await fetchLiveData(body.topics);

    return NextResponse.json({
      success: true,
      liveData
    });
  } catch (err: any) {
    console.error("Scraper Proxy Error:", err);
    return NextResponse.json({ error: "Pipeline Failure", msg: err.message }, { status: 500 });
  }
}
