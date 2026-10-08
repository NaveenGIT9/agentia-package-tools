import { homedir } from 'node:os';
import { basename, join } from 'node:path';

// Generated files go to the user's Downloads folder, not into the repo, so they cannot be committed by accident.
// The promotion name is in the file name, so files from different promotions do not overwrite each other.
export const downloadsDir = (): string => join(homedir(), 'Downloads');

export const packageFileFor = (promotion: string): string => join(downloadsDir(), `package-${promotion}.xml`);

export const zipFileFor = (promotion?: string): string => join(downloadsDir(), promotion ? `deployment-${promotion}.zip` : 'deployment.zip');

// "<anywhere>/package-P34277.xml" -> "P34277"; undefined for any other file name.
export function promotionFromManifestName(manifestPath: string): string | undefined {
  const m = /^package-(.+)\.xml$/i.exec(basename(manifestPath));
  return m ? m[1] : undefined;
}
