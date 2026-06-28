const fetch = require('node-fetch');
async function run() {
  const govRes = await fetch("https://apply07.grants.gov/grantsws/rest/opportunities/search/", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: "aging" })
  });
  const data = await govRes.json();
  const hits = data.oppHits || [];
  const top = hits.slice(0, 2);
  for (const h of top) {
    const detailRes = await fetch("https://apply07.grants.gov/grantsws/rest/opportunity/details", {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `oppId=${h.id}`
    });
    const detail = await detailRes.json();
    console.log(h.id, detail.synopsis?.estimatedFunding);
  }
}
run();
