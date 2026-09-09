import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const releasesDir = join(root, 'releases');

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const targets = [
  { name: 'chrome', zip: `ruminote-weread-chrome-v${version}.zip` },
  { name: 'firefox', zip: `ruminote-weread-firefox-v${version}.zip` }
];

await mkdir(releasesDir, { recursive: true });

for (const target of targets) {
  const source = join(distDir, target.name);
  const output = join(releasesDir, target.zip);
  await rm(output, { force: true });

  // -r 递归，-X 去除额外属性，从 dist/<target> 内部打包，使清单位于压缩包根目录
  execFileSync('zip', ['-r', '-X', output, '.'], { cwd: source, stdio: 'inherit' });
  console.log(`Packaged ${target.name}: ${output}`);
}
