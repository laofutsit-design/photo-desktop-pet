const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const sourcePath = path.resolve(process.argv[2] || '.');
const mainSource = fs.readFileSync(path.join(sourcePath, 'main.js'), 'utf8');

function extractFunction(name) {
  const start = mainSource.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const next = mainSource.indexOf('\nfunction ', start + 1);
  return mainSource.slice(start, next < 0 ? mainSource.length : next).trim();
}

const context = {
  app: { getPath: () => 'C:\\Users\\Test User\\AppData\\Local\\Temp' },
  path,
  process: { execPath: '', pid: 1234 },
};
vm.createContext(context);
vm.runInContext([
  'const fs = {};',
  extractFunction('parseReleaseVersion'),
  extractFunction('resolveUpdatePaths'),
  extractFunction('quotePowerShellLiteral'),
  extractFunction('buildUpdateInstallScript'),
  'this.resolveUpdatePaths = resolveUpdatePaths;',
  'this.buildUpdateInstallScript = buildUpdateInstallScript;',
].join('\n'), context);

const executablePath = 'C:\\Users\\Test User\\AppData\\Local\\Programs\\照片桌宠\\照片桌宠.exe';
const installerPath = 'C:\\Users\\Test User\\AppData\\Local\\Temp\\photo-desktop-pet-updates\\photo-desktop-pet-1.2.2-Windows-x64.exe';
const paths = context.resolveUpdatePaths({
  executablePath,
  tempDirectory: 'C:\\Users\\Test User\\AppData\\Local\\Temp',
});
if (paths.downloadDirectory !== 'C:\\Users\\Test User\\AppData\\Local\\Temp\\photo-desktop-pet-updates') {
  throw new Error(`Installer must download outside the app directory: ${paths.downloadDirectory}`);
}

const { script } = context.buildUpdateInstallScript(installerPath, '1.2.2', {
  executablePath,
  tempDirectory: 'C:\\Users\\Test User\\AppData\\Local\\Temp',
});
for (const required of [
  '正在删除旧版本',
  "$uninstallArguments = @('/S', ('_?=' + $installDirectory))",
  '-ArgumentList $uninstallArguments -PassThru -Wait',
  '-ArgumentList $installerArguments -PassThru -Wait',
  '正在验证新版本',
]) {
  if (!script.includes(required)) throw new Error(`Generated update script is missing: ${required}`);
}

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-desktop-pet-update-'));
const scriptPath = path.join(testDirectory, 'install-update.ps1');
fs.writeFileSync(scriptPath, script, 'utf16le');
const parseResult = spawnSync('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  `$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile('${scriptPath.replaceAll("'", "''")}', [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }`,
], { encoding: 'utf8' });
fs.rmSync(testDirectory, { recursive: true, force: true });
if (parseResult.status !== 0) {
  throw new Error(parseResult.stderr || parseResult.stdout || 'PowerShell parser failed');
}

console.log(JSON.stringify({
  updateScript: 'ok',
  downloadDirectory: paths.downloadDirectory,
  uninstallOldVersion: true,
  installNewVersion: true,
}));
