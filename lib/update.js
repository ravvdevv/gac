import fs from 'fs/promises';
import chalk from 'chalk';
import ora from 'ora';

export async function checkForUpdates() {
  try {
    const pkgPath = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    const currentVersion = pkg.version;

    const response = await fetch('https://registry.npmjs.org/gac-cli/latest', { 
        signal: AbortSignal.timeout(2000) 
    });
    
    if (!response.ok) return;

    const data = await response.json();
    const latestVersion = data.version;

    if (isNewer(latestVersion, currentVersion)) {
      return latestVersion;
    }
  } catch (e) {
    // Silently fail update checks to avoid interrupting user flow
  }
}

function isNewer(latest, current) {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (l[i] > c[i]) return true;
    if (l[i] < c[i]) return false;
  }
  return false;
}
