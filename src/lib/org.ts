import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AuthInfo, Connection, StateAggregator } from '@salesforce/core';

// The org to use: --target-org if given, else the sf CLI's default target org (project config, then global config).
export function resolveOrg(flagValue?: string): string {
  if (flagValue) return flagValue;

  const candidates = [
    join(process.cwd(), '.sf', 'config.json'),
    join(homedir(), '.sf', 'config.json'),
    join(homedir(), '.sfdx', 'sfdx-config.json'),
  ];
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue;
      const cfg = JSON.parse(readFileSync(p, 'utf8')) as Record<string, string>;
      const val = cfg['target-org'] ?? cfg['defaultusername'] ?? '';
      if (val) return val;
    } catch {
      /* try the next candidate */
    }
  }

  try {
    const r = spawnSync('sf', ['config', 'get', 'target-org', '--json'], { timeout: 20_000, encoding: 'utf8', shell: true });
    const parsed = JSON.parse(r.stdout ?? '') as { result?: Array<{ value?: string }> };
    const val = parsed?.result?.[0]?.value ?? '';
    if (val) return val;
  } catch {
    /* give up */
  }

  throw new Error('No target org found. Pass --target-org <alias> or set one with "sf config set target-org <alias>".');
}

// Connects with the credentials the sf CLI already stored for the alias or username.
export async function connect(aliasOrUsername: string): Promise<Connection> {
  let username = aliasOrUsername;
  try {
    const aggregator = await StateAggregator.getInstance();
    username = aggregator.aliases.getUsername(aliasOrUsername) ?? aliasOrUsername;
  } catch {
    /* use the value as a username */
  }
  try {
    const authInfo = await AuthInfo.create({ username });
    return await Connection.create({ authInfo });
  } catch (err) {
    throw new Error(`Could not connect to "${aliasOrUsername}": ${err instanceof Error ? err.message : String(err)}. Is the org authenticated? Run: sf org login web --alias ${aliasOrUsername}`);
  }
}
