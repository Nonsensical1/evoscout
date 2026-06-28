const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

// Replace the dailyFeed backfill
code = code.replace(
`            try {
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
            } catch (e) {}`,
`            try {
              const detailRes = await fetch("/api/grant-details", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oppId })
              });
              if (detailRes.ok) {
                const detailData = await detailRes.json();
                if (detailData.estimatedFunding) {
                  const parsedAmount = parseInt(detailData.estimatedFunding, 10);
                  if (!isNaN(parsedAmount) && parsedAmount > 0) {
                    g.amount = \`$\${parsedAmount.toLocaleString()}\`;
                    feedChanged = true;
                  }
                }
              }
            } catch (e) {}`
);

// Replace the ledgerDocs backfill
code = code.replace(
`              try {
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
              } catch (e) {}`,
`              try {
                const detailRes = await fetch("/api/grant-details", {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ oppId })
                });
                if (detailRes.ok) {
                  const detailData = await detailRes.json();
                  if (detailData.estimatedFunding) {
                    const parsedAmount = parseInt(detailData.estimatedFunding, 10);
                    if (!isNaN(parsedAmount) && parsedAmount > 0) {
                      item.amount = \`$\${parsedAmount.toLocaleString()}\`;
                    }
                  }
                }
              } catch (e) {}`
);

fs.writeFileSync('src/app/page.tsx', code);
