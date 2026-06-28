const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

// Replace the buggy dailyFeed backfill patch with a sequential one
code = code.replace(
`      // BACKFILL PATCH: Fetch missing funding amounts for currently displayed grants
      let feedChanged = false;
      if (dailyFeed.openGovGrants && dailyFeed.openGovGrants.length > 0) {
        const backfillPromises = dailyFeed.openGovGrants.map(async (g: any) => {
          if (g.amount === "Details at Registry" && g.id.startsWith("GOV-")) {
            const oppId = g.id.split('-')[1];
            try {
              const detailRes = await fetch("https://apply07.grants.gov/grantsws/rest/opportunity/details", {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: \`oppId=\${oppId}\`
              });
              if (detailRes.ok) {
                const detailData = await detailRes.json();
                if (detailData.synopsis && detailData.synopsis.estimatedFunding) {
                  const parsedAmount = parseInt(detailData.synopsis.estimatedFunding, 10);
                  if (!isNaN(parsedAmount) && parsedAmount > 0) {
                    g.amount = \`$\${parsedAmount.toLocaleString()}\`;
                    feedChanged = true;
                  }
                }
              }
            } catch (e) {}
          }
        });
        await Promise.all(backfillPromises);
        if (feedChanged) {
          await setDoc(doc(db, 'users', user.uid, 'daily', 'feed'), dailyFeed, { merge: true });
        }
      }`,
`      // BACKFILL PATCH: Fetch missing funding amounts for currently displayed grants
      let feedChanged = false;
      if (dailyFeed.openGovGrants && dailyFeed.openGovGrants.length > 0) {
        for (const g of dailyFeed.openGovGrants) {
          if (g.amount === "Details at Registry" && g.id.startsWith("GOV-")) {
            const oppId = g.id.split('-')[1];
            try {
              const detailRes = await fetch("https://apply07.grants.gov/grantsws/rest/opportunity/details", {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: \`oppId=\${oppId}\`
              });
              if (detailRes.ok) {
                const detailData = await detailRes.json();
                if (detailData.synopsis && detailData.synopsis.estimatedFunding) {
                  const parsedAmount = parseInt(detailData.synopsis.estimatedFunding, 10);
                  if (!isNaN(parsedAmount) && parsedAmount > 0) {
                    g.amount = \`$\${parsedAmount.toLocaleString()}\`;
                    feedChanged = true;
                  }
                }
              }
            } catch (e) {}
          }
        }
        if (feedChanged) {
          await setDoc(doc(db, 'users', user.uid, 'daily', 'feed'), dailyFeed, { merge: true });
        }
      }`
);

// Now replace the Promise.all logic in ledgerDocs backfill
code = code.replace(
`        const backfillPromises: Promise<void>[] = [];
        const checkedOpps = new Set<string>();

        ledgerDocs.forEach(day => {
          (day.openGovGrants || []).forEach((item: any) => {
            if (item.amount === "Details at Registry" && item.id.startsWith("GOV-")) {
              const oppId = item.id.replace("GOV-", "");
              if (checkedOpps.has(oppId)) return;
              checkedOpps.add(oppId);
              
              backfillPromises.push(
                fetch("https://apply07.grants.gov/grantsws/rest/opportunity/details", {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: \`oppId=\${oppId}\`
                }).then(res => res.json()).then(detailData => {
                  if (detailData.synopsis && detailData.synopsis.estimatedFunding) {
                    const parsedAmount = parseInt(detailData.synopsis.estimatedFunding, 10);
                    if (!isNaN(parsedAmount) && parsedAmount > 0) {
                      item.amount = \`$\${parsedAmount.toLocaleString()}\`;
                    }
                  }
                }).catch(() => {})
              );
            }
          });
        });

        await Promise.all(backfillPromises);`,
`        const checkedOpps = new Set<string>();
        // Process sequentially to avoid Grants.gov rate limits dropping connections
        for (const day of ledgerDocs) {
          for (const item of (day.openGovGrants || [])) {
            if (item.amount === "Details at Registry" && item.id.startsWith("GOV-")) {
              const oppId = item.id.replace("GOV-", "");
              if (checkedOpps.has(oppId)) continue;
              checkedOpps.add(oppId);
              try {
                const detailRes = await fetch("https://apply07.grants.gov/grantsws/rest/opportunity/details", {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: \`oppId=\${oppId}\`
                });
                if (detailRes.ok) {
                  const detailData = await detailRes.json();
                  if (detailData.synopsis && detailData.synopsis.estimatedFunding) {
                    const parsedAmount = parseInt(detailData.synopsis.estimatedFunding, 10);
                    if (!isNaN(parsedAmount) && parsedAmount > 0) {
                      item.amount = \`$\${parsedAmount.toLocaleString()}\`;
                    }
                  }
                }
              } catch (e) {}
            }
          }
        }`
);

fs.writeFileSync('src/app/page.tsx', code);
