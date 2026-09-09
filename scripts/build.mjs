import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'src');
const targets = [
  { name: 'chrome', manifest: 'manifest.chrome.json' },
  { name: 'firefox', manifest: 'manifest.firefox.json' }
];
const sharedFiles = [
  'api.js',
  'background.js',
  'config.js',
  'fingerprint.js',
  'platform.js',
  'sidepanel.html',
  'sidepanel.js',
  'storage.js',
  'styles.css',
  'sync.js'
];

const parserSource = await readFile(join(source, 'parser.js'), 'utf8');
const contentSource = await readFile(join(source, 'content.js'), 'utf8');
const contentBundle = `(() => {\n${parserSource.replace(/^export /gm, '')}\n${contentSource.replace(/^import .*parser\.js';\n/m, '')}\n})();\n`;

for (const target of targets) {
  const output = join(root, 'dist', target.name);
  await mkdir(output, { recursive: true });
  await cp(join(root, target.manifest), join(output, 'manifest.json'));
  await Promise.all(sharedFiles.map(file => cp(join(source, file), join(output, file))));
  await writeFile(join(output, 'content-bundle.js'), contentBundle);
  console.log(`Built ${target.name}: ${output}`);
}
