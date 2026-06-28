const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

// Import useIsMobile
code = code.replace(
  `import { CurrentDate } from './CurrentDate';`,
  `import { CurrentDate } from './CurrentDate';\nimport { useIsMobile } from '@/hooks/useIsMobile';`
);

// Add isMobile state
code = code.replace(
  `const [data, setData] = useState<any>({ date: '', news: [], literature: [], grants: [], openGovGrants: [], positions: [], historyEvents: [] });`,
  `const [data, setData] = useState<any>({ date: '', news: [], literature: [], grants: [], openGovGrants: [], positions: [], historyEvents: [] });\n  const isMobile = useIsMobile();`
);

// Slice arrays on render
code = code.replace(
  `{data.news.map((n: any, i: number) => {`,
  `{(isMobile ? data.news.slice(0, 4) : data.news).map((n: any, i: number) => {`
);
code = code.replace(
  `{data.literature.map((paper: any) => (`,
  `{(isMobile ? data.literature.slice(0, 4) : data.literature).map((paper: any) => (`
);
code = code.replace(
  `{data.grants.map((grant: any) => (`,
  `{(isMobile ? data.grants.slice(0, 4) : data.grants).map((grant: any) => (`
);
code = code.replace(
  `{data.openGovGrants.map((grant: any) => (`,
  `{(isMobile ? data.openGovGrants.slice(0, 4) : data.openGovGrants).map((grant: any) => (`
);
code = code.replace(
  `{data.positions.map((job: any) => (`,
  `{(isMobile ? data.positions.slice(0, 4) : data.positions).map((job: any) => (`
);

fs.writeFileSync('src/app/page.tsx', code);
