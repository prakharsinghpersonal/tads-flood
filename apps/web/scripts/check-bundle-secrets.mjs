// S01: fail if the built bundle or frontend source references server-side
// credentials. Run after `npm run build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  [/OHSOME_API_KEY|CDSE_(CLIENT|SECRET|USER|PASS)|SH_CLIENT_SECRET|ANTHROPIC_API_KEY|OPENAI_API_KEY/, 'server credential name'],
  [/sk-[A-Za-z0-9_-]{20,}/, 'API key-like token'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/Bearer\s+[A-Za-z0-9._-]{20,}/, 'bearer token'],
  [/import\.meta\.env\.VITE_(?!API_BASE_URL\b)[A-Z_]+/, 'unexpected VITE_ variable'],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'test-results') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|ts|tsx|html|css|json|map)$/.test(name)) out.push(p);
  }
  return out;
}

const files = [...walk('dist'), ...walk('src')];
const hits = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const [re, label] of PATTERNS) if (re.test(text)) hits.push(`${f}: ${label}`);
}
if (hits.length) {
  console.error('Possible secrets found:\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`No credential patterns in ${files.length} built/source files.`);
