const fetch = require('node-fetch');
async function run() {
  const govRes = await fetch("https://apply07.grants.gov/grantsws/rest/opportunities/search/", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: "aging" })
  });
  const data = await govRes.json();
  const hits = data.oppHits || [];
  let countWith = 0;
  let countWithout = 0;
  for (const h of hits) {
    if (h.oppStatus !== 'posted') continue;
    const detailRes = await fetch("https://apply07.grants.gov/grantsws/rest/opportunity/details", {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `oppId=${h.id}`
    });
    const detail = await detailRes.json();
    if (detail.synopsis && detail.synopsis.estimatedFunding) {
      countWith++;
    } else {
      countWithout++;
      console.log('No funding for:', h.id, h.title);
    }
  }
  console.log(`With: ${countWith}, Without: ${countWithout}`);
}
run();
