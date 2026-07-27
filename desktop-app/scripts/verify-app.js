const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.resolve(process.argv[2] || '.');

for (const fileName of [
  'main.js',
  'renderer.js',
  'manager-renderer.js',
  'preload.js',
  'background-removal.js',
  'character-profile.js',
  'photo-character-analysis.js',
]) {
  const source = fs.readFileSync(path.join(sourcePath, fileName), 'utf8');
  new vm.Script(source, { filename: fileName });
}

const mainSource = fs.readFileSync(path.join(sourcePath, 'main.js'), 'utf8');
for (const [name, pattern] of [
  ['temporary update download directory', /downloadDirectory:\s*path\.join\(tempDirectory,\s*'photo-desktop-pet-updates'\)/],
  ['old-version uninstaller', /\$uninstallArguments\s*=\s*@\('\/S',\s*\('_\?='/],
  ['wait for uninstall', /Start-Process[^\r\n]+\$uninstallArguments[^\r\n]+-Wait/],
  ['wait for install', /Start-Process[^\r\n]+\$installerArguments[^\r\n]+-Wait/],
]) {
  if (!pattern.test(mainSource)) throw new Error(`Missing ${name} update behavior`);
}

function verifyDom(htmlName, rendererName) {
  const html = fs.readFileSync(path.join(sourcePath, htmlName), 'utf8');
  const renderer = fs.readFileSync(path.join(sourcePath, rendererName), 'utf8');
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const referencedIds = [...renderer.matchAll(/querySelector\('#([^']+)'\)/g)].map((match) => match[1]);
  const missingIds = referencedIds.filter((id) => !htmlIds.has(id));
  if (missingIds.length > 0) throw new Error(`${htmlName} missing DOM IDs: ${missingIds.join(', ')}`);
  return referencedIds.length;
}

const domReferences = verifyDom('index.html', 'renderer.js')
  + verifyDom('manager.html', 'manager-renderer.js');

for (const asset of ['icon.png', 'icon.ico', 'icon-macos.png', 'icon.icns']) {
  if (!fs.existsSync(path.join(sourcePath, 'assets', asset))) throw new Error(`Missing ${asset}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(sourcePath, 'package.json'), 'utf8'));
if (manifest.build?.mac?.icon !== 'assets/icon.icns') throw new Error('build.mac.icon must use assets/icon.icns');
if (manifest.build?.dmg?.icon !== 'assets/icon.icns') throw new Error('build.dmg.icon must use assets/icon.icns');

console.log(JSON.stringify({
  syntax: 'ok',
  domReferences,
  assets: 'ok',
  macIcon: 'ok',
  updateFlow: 'ok',
  version: manifest.version,
}));
