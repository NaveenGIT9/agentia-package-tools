import { ComponentSet, MetadataConverter } from '@salesforce/source-deploy-retrieve';

export interface PackedCount {
  /** components of this type that are in the zip, counted the way package.xml lists them */
  total: number;
  /** of those, how many are not a file of their own but sit inside their parent object's file (the whole object is in the package) */
  insideParent: number;
}

export interface ZipBuild {
  zip: Buffer;
  /** metadata type -> counts; the totals match what package.xml lists (minus anything missing) */
  packed: Map<string, PackedCount>;
  /** components named in the manifest that have no source in the given folders */
  missing: string[];
}

const keyOf = (type: string, fullName: string): string => `${type}:${fullName}`;

// Builds a Metadata API deployment zip (package.xml + metadata files) from the components a package.xml lists,
// using the source files in `sourceDirs`. Nothing is deployed and no org is contacted.
export async function buildDeploymentZip(manifestPath: string, sourceDirs: string[]): Promise<ZipBuild> {
  const set = await ComponentSet.fromManifest({ manifestPath, resolveSourcePaths: sourceDirs });

  const found = new Set<string>();
  for (const comp of set.getSourceComponents()) {
    found.add(keyOf(comp.type.name, comp.fullName));
    // a child (for example a custom field) is found through its parent's source
    for (const child of comp.getChildren()) found.add(keyOf(child.type.name, child.fullName));
  }

  // Count what package.xml lists, so the numbers can be compared with the promotion. A field listed next to its whole
  // object is not a separate file in the zip (it is inside the object's file), so it is counted and marked as such.
  const packed = new Map<string, PackedCount>();
  const missing: string[] = [];
  for (const comp of set.toArray()) {
    if (comp.fullName === '*') continue; // a wildcard member is satisfied by whatever source exists
    const type = comp.type.name;
    if (!found.has(keyOf(type, comp.fullName))) {
      missing.push(keyOf(type, comp.fullName));
      continue;
    }
    const entry = packed.get(type) ?? { total: 0, insideParent: 0 };
    entry.total++;
    const parentName = comp.fullName.includes('.') ? comp.fullName.split('.')[0] : '';
    if (parentName && type !== 'CustomObject' && set.has({ type: 'CustomObject', fullName: parentName })) entry.insideParent++;
    packed.set(type, entry);
  }

  // Convert only what has source, so the zip's package.xml never names a component that is not in the zip.
  const packedSet = new ComponentSet(set.getSourceComponents().toArray());
  packedSet.apiVersion = set.apiVersion;
  const result = await new MetadataConverter().convert(packedSet, 'metadata', { type: 'zip' });
  if (!result.zipBuffer) throw new Error('The metadata converter returned no zip.');
  return { zip: result.zipBuffer, packed, missing: missing.sort() };
}
