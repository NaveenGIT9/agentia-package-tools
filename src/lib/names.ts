import { basename } from 'node:path';

// Default file names carry the promotion name (P34277), so files from different promotions do not overwrite each other.
export const packageFileFor = (promotion: string): string => `manifest/package-${promotion}.xml`;

export const zipFileFor = (promotion?: string): string => (promotion ? `deployment-${promotion}.zip` : 'deployment.zip');

// "manifest/package-P34277.xml" -> "P34277"; undefined for any other file name.
export function promotionFromManifestName(manifestPath: string): string | undefined {
  const m = /^package-(.+)\.xml$/i.exec(basename(manifestPath));
  return m ? m[1] : undefined;
}
