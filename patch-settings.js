const fs = require('fs');
let code = fs.readFileSync('src/app/settings/page.tsx', 'utf8');

// 1. Add new state
code = code.replace(
  `const [podcastEnabled, setPodcastEnabled] = useState(false);`,
  `const [podcastEnabled, setPodcastEnabled] = useState(false);
  const [autoScrapeEnabled, setAutoScrapeEnabled] = useState(false);
  const [autoScrapeHours, setAutoScrapeHours] = useState<number[]>([]);`
);

// 2. Load settings
code = code.replace(
  `if (snap.data().podcastEnabled !== undefined) {
            setPodcastEnabled(snap.data().podcastEnabled);
          }`,
  `if (snap.data().podcastEnabled !== undefined) {
            setPodcastEnabled(snap.data().podcastEnabled);
          }
          if (snap.data().autoScrapeEnabled !== undefined) {
            setAutoScrapeEnabled(snap.data().autoScrapeEnabled);
          }
          if (snap.data().autoScrapeHours !== undefined) {
            setAutoScrapeHours(snap.data().autoScrapeHours);
          }`
);

// 3. Save settings
code = code.replace(
  `ttsEngine,
        customModalUrl,
        theme,
        podcastEnabled
      }, { merge: true });`,
  `ttsEngine,
        customModalUrl,
        theme,
        podcastEnabled,
        autoScrapeEnabled,
        autoScrapeHours
      }, { merge: true });

      // Save to root collection for cron job
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await setDoc(doc(db, 'autoScrapeSchedules', user.uid), {
        enabled: autoScrapeEnabled,
        localHours: autoScrapeHours,
        timezone: timezone
      }, { merge: true });`
);

// 4. Add UI element
// Let's insert the UI below the podcast toggle, which is around "Podcast Summaries"
code = code.replace(
  `<div className="border-t border-editorial-border my-8"></div>

          <div className="flex items-center gap-3 mb-6">`,
  `<div className="border border-editorial-border p-6 mb-8 bg-[#f9f9f9] dark:bg-[#1a1a1a]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold font-serif uppercase tracking-wider text-editorial-text">Background Auto-Scrape</h2>
                <p className="text-sm font-sans text-editorial-muted">Automatically fetch research daily without opening the dashboard.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={autoScrapeEnabled} onChange={(e) => setAutoScrapeEnabled(e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-black dark:peer-checked:bg-white"></div>
              </label>
            </div>
            
            {autoScrapeEnabled && (
              <div className="mt-4 pt-4 border-t border-editorial-border">
                <p className="text-xs font-bold uppercase tracking-widest text-editorial-muted mb-3">Select local hours (suggested: 8 AM)</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {Array.from({length: 24}).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (autoScrapeHours.includes(i)) {
                          setAutoScrapeHours(autoScrapeHours.filter(h => h !== i));
                        } else {
                          setAutoScrapeHours([...autoScrapeHours, i].sort((a,b) => a-b));
                        }
                      }}
                      className={\`py-2 text-xs font-bold rounded-sm border \${autoScrapeHours.includes(i) ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white' : 'bg-transparent text-editorial-text border-editorial-border hover:bg-gray-100 dark:hover:bg-[#262626]'}\`}
                    >
                      {i === 0 ? '12 AM' : i < 12 ? \`\${i} AM\` : i === 12 ? '12 PM' : \`\${i-12} PM\`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-editorial-border my-8"></div>

          <div className="flex items-center gap-3 mb-6">`
);

fs.writeFileSync('src/app/settings/page.tsx', code);
