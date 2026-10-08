import { spawnSync } from 'node:child_process';
import { registry } from '@salesforce/source-deploy-retrieve';

// Where a component's metadata file would sit in the source folder, for example
// ("CustomTab", "ecosystems_svcs__VMO", "force-app") -> "force-app/main/default/tabs/ecosystems_svcs__VMO.tab-meta.xml".
// Undefined when the type is unknown.
export function expectedSourcePath(type: string, fullName: string, sourceDir: string): string | undefined {
  const meta = registry.types[type.toLowerCase()];
  if (!meta?.directoryName) return undefined;
  const file = meta.suffix ? `${fullName}.${meta.suffix}-meta.xml` : fullName;
  return `${sourceDir.replace(/\\/g, '/').replace(/\/+$/, '')}/main/default/${meta.directoryName}/${file}`;
}

// True when this repo's own .gitignore ignores the component's file. Such a component is not kept in git on purpose
// (for example a managed-package class), so having no source for it is expected. When the repo does NOT ignore it, a
// missing file is a real gap: the file is not on the checked-out branch.
export function isIgnoredByRepo(type: string, fullName: string, sourceDir: string, cwd: string = process.cwd()): boolean {
  const path = expectedSourcePath(type, fullName, sourceDir);
  if (!path) return false;
  const r = spawnSync('git', ['check-ignore', '-q', '--', path], { cwd });
  return r.status === 0; // 0 = ignored, 1 = not ignored, anything else = could not tell
}
