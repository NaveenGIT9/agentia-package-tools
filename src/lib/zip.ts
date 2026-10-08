import { ComponentSet, MetadataConverter } from '@salesforce/source-deploy-retrieve';

export interface ZipBuild {
  zip: Buffer;
  /** metadata type -> number of components packed */
  packed: Map<string, number>;
  /** components named in the manifest that have no source in the given folders */
  missing: string[];
}

const keyOf = (type: string, fullName: string): string => `${type}:${fullName}`;

// Builds a Metadata API deployment zip (package.xml + metadata files) from the components a package.xml lists,
// using the source files in `sourceDirs`. Nothing is deployed and no org is contacted.
export async function buildDeploymentZip(manifestPath: string, sourceDirs: string[]): Promise<ZipBuild> {
  const set = await ComponentSet.fromManifest({ manifestPath, resolveSourcePaths: sourceDirs });

  const found = new Set<string>();
  const packed = new Map<string, number>();
  for (const comp of set.getSourceComponents()) {
    found.add(keyOf(comp.type.name, comp.fullName));
    // a child (for example a custom field) is found through its parent's source
    for (const child of comp.getChildren()) found.add(keyOf(child.type.name, child.fullName));
    packed.set(comp.type.name, (packed.get(comp.type.name) ?? 0) + 1);
  }

  const missing: string[] = [];
  for (const comp of set.toArray()) {
    if (comp.fullName === '*') continue; // a wildcard member is satisfied by whatever source exists
    if (!found.has(keyOf(comp.type.name, comp.fullName))) missing.push(keyOf(comp.type.name, comp.fullName));
  }

  // Convert only what has source, so the zip's package.xml never names a component that is not in the zip.
  const packedSet = new ComponentSet(set.getSourceComponents().toArray());
  packedSet.apiVersion = set.apiVersion;
  const result = await new MetadataConverter().convert(packedSet, 'metadata', { type: 'zip' });
  if (!result.zipBuffer) throw new Error('The metadata converter returned no zip.');
  return { zip: result.zipBuffer, packed, missing: missing.sort() };
}
