// What goes into package.xml, and how a promotion's "Ignored changes" file removes components from it.
// The ignore rules are the same as the Salesforce quick action that generates package.xml on the Promotion record.

export interface Change {
  u?: string; // user story
  t?: string; // metadata type
  n?: string; // component name
  a?: string; // action: Add, SelectiveCommit, RetrieveOnly, Full, Delete
  [key: string]: unknown;
}

// Actions that go into package.xml (compared case-insensitively). Everything else is skipped and reported;
// in particular Delete: deletions are not part of the generated package or zip.
export const INCLUDED_ACTIONS = new Set(['add', 'selectivecommit', 'retrieveonly', 'full']);

export interface Selection {
  /** metadata type -> sorted, distinct member names */
  members: Map<string, string[]>;
  /** components in the promotion file with a type and a name */
  total: number;
  included: number;
  /** components left out because they are listed in "Ignored changes" */
  ignored: number;
  /** components left out because of their action, counted per action */
  skippedByAction: Record<string, number>;
  /** components Copado files under category "Other" (for example a QCP script, type "js"): not Salesforce metadata */
  nonMetadata: string[];
  /** the same component listed more than once (for example by several stories); it appears once in package.xml */
  duplicates: number;
}

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

// Keys: S|story|type|name (the ignored entry names a story), N|type|name (the ignored entry has no story),
// T|type|name (any ignored entry - used for promotion entries that carry no story).
export function buildIgnoredKeys(ignored: Change[]): Set<string> {
  const keys = new Set<string>();
  for (const comp of ignored) {
    const story = text(comp.u);
    const mdType = text(comp.t);
    const apiName = text(comp.n);
    if (!mdType.trim() || !apiName.trim()) continue;
    keys.add(`T|${mdType}|${apiName}`);
    keys.add(story.trim() ? `S|${story}|${mdType}|${apiName}` : `N|${mdType}|${apiName}`);
  }
  return keys;
}

export function isIgnored(comp: Change, keys: Set<string>): boolean {
  if (keys.size === 0) return false;
  const story = text(comp.u);
  const mdType = text(comp.t);
  const apiName = text(comp.n);
  if (keys.has(`N|${mdType}|${apiName}`)) return true;
  if (!story.trim()) return keys.has(`T|${mdType}|${apiName}`);
  return keys.has(`S|${story}|${mdType}|${apiName}`);
}

export function selectComponents(changes: Change[], ignored: Change[] | null, excludeIgnored: boolean): Selection {
  const ignoredKeys = excludeIgnored && ignored ? buildIgnoredKeys(ignored) : new Set<string>();
  const sets = new Map<string, Set<string>>();
  const skippedByAction: Record<string, number> = {};
  const nonMetadata: string[] = [];
  let total = 0;
  let included = 0;
  let ignoredCount = 0;
  let duplicates = 0;

  for (const comp of changes) {
    const mdType = text(comp.t);
    const apiName = text(comp.n);
    if (!mdType.trim() || !apiName.trim()) continue;
    total++;
    if (isIgnored(comp, ignoredKeys)) {
      ignoredCount++;
      continue;
    }
    if (text(comp.c).trim().toLowerCase() === 'other') {
      nonMetadata.push(`${mdType}:${apiName}`);
      continue;
    }
    const action = text(comp.a).trim();
    if (!INCLUDED_ACTIONS.has(action.toLowerCase())) {
      const label = action || '(no action)';
      skippedByAction[label] = (skippedByAction[label] ?? 0) + 1;
      continue;
    }
    if (!sets.has(mdType)) sets.set(mdType, new Set());
    if (sets.get(mdType)!.has(apiName)) duplicates++;
    else included++;
    sets.get(mdType)!.add(apiName);
  }

  const members = new Map<string, string[]>();
  for (const type of [...sets.keys()].sort()) members.set(type, [...sets.get(type)!].sort());
  return { members, total, included, ignored: ignoredCount, skippedByAction, nonMetadata, duplicates };
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function buildPackageXml(members: Map<string, string[]>, apiVersion: string): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';
  for (const [type, names] of members) {
    xml += '    <types>\n';
    for (const name of names) xml += `        <members>${escapeXml(name)}</members>\n`;
    xml += `        <name>${type}</name>\n    </types>\n`;
  }
  xml += `    <version>${apiVersion}</version>\n</Package>\n`;
  return xml;
}
