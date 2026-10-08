import { spawnSync } from 'node:child_process';
import type { Connection } from '@salesforce/core';
import type { Change } from './packageXml.js';

// "promotion/P34231" -> "P34231". Undefined when the current branch is not a promotion branch.
export function promotionNameFromBranch(cwd: string = process.cwd()): string | undefined {
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) return undefined;
  const m = /^promotion\/(.+)$/.exec((r.stdout ?? '').trim());
  return m ? m[1] : undefined;
}

export interface PromotionFiles {
  promotion: { id: string; name: string; status?: string };
  /** "Copado Promotion changes" file; null when the promotion has none */
  changes: Change[] | null;
  /** "Ignored changes" file; null when the promotion has none */
  ignored: Change[] | null;
}

interface PromotionRecord { Id: string; Name: string; copado__Status__c?: string }
interface VersionRecord { Id: string; Title: string }

// Reads the two JSON files Copado keeps on a promotion record (files linked to it). Returns undefined when no
// promotion has that name.
export async function fetchPromotionFiles(conn: Connection, name: string): Promise<PromotionFiles | undefined> {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`"${name}" is not a valid promotion name.`);
  const promos = await conn.query<PromotionRecord>(`SELECT Id, Name, copado__Status__c FROM copado__Promotion__c WHERE Name = '${name}' LIMIT 2`);
  if (promos.records.length === 0) return undefined;
  const promo = promos.records[0];

  // ContentDocumentLink cannot be used in a semi-join, so the linked file ids are loaded first.
  const links = await conn.query<{ ContentDocumentId: string }>(`SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId = '${promo.Id}'`);
  const docIds = links.records.map((l) => `'${l.ContentDocumentId}'`).join(',');

  const readJson = async (titlePrefix: string): Promise<Change[] | null> => {
    if (!docIds) return null;
    const versions = await conn.query<VersionRecord>(
      `SELECT Id, Title FROM ContentVersion WHERE ContentDocumentId IN (${docIds}) ` +
        `AND Title LIKE '${titlePrefix}%' AND IsLatest = true ORDER BY LastModifiedDate DESC LIMIT 1`,
    );
    if (versions.records.length === 0) return null;
    // The file body comes back as text (or already parsed when Salesforce labels it JSON).
    const body: unknown = await conn.request({ method: 'GET', url: `/services/data/v${conn.version}/sobjects/ContentVersion/${versions.records[0].Id}/VersionData` });
    const parsed: unknown = typeof body === 'string' ? JSON.parse(body) : body;
    if (!Array.isArray(parsed)) throw new Error(`The "${titlePrefix}" file is not a JSON list.`);
    return parsed as Change[];
  };

  return {
    promotion: { id: promo.Id, name: promo.Name, status: promo.copado__Status__c },
    changes: await readJson('Copado Promotion changes'),
    ignored: await readJson('Ignored changes'),
  };
}
