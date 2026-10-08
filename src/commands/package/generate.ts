import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command, Flags } from '@oclif/core';
import { connect, resolveOrg } from '../../lib/org.js';
import { buildPackageXml, selectComponents } from '../../lib/packageXml.js';
import { fetchPromotionFiles, promotionNameFromBranch } from '../../lib/promotion.js';

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string) => (s: string): string => (useColor ? `\u001b[${code}m${s}\u001b[0m` : s);
const dim = paint('2');
const green = paint('32');
const yellow = paint('33');

// API version for package.xml: the project's sourceApiVersion when there is one, else 67.0 (this org's version).
function defaultApiVersion(): string {
  try {
    const p = resolve(process.cwd(), 'sfdx-project.json');
    if (existsSync(p)) {
      const v = (JSON.parse(readFileSync(p, 'utf8')) as { sourceApiVersion?: string }).sourceApiVersion;
      if (v) return v;
    }
  } catch {
    /* fall through */
  }
  return '67.0';
}

export default class PackageGenerate extends Command {
  static summary = 'Generate package.xml from a Copado promotion';
  static description =
    'Finds the promotion for the checked-out promotion branch (promotion/P12345 -> P12345) in your default (Copado) org, ' +
    'reads its "Copado Promotion changes" and "Ignored changes" files, and writes a package.xml. ' +
    'Components with action Add, SelectiveCommit, RetrieveOnly or Full are included; deletions are skipped. ' +
    'Components listed in "Ignored changes" are left out.';
  static examples = [
    '<%= config.bin %> package generate',
    '<%= config.bin %> package generate -p P34231 -f out/package.xml',
    '<%= config.bin %> package generate --target-org CopadoGov --include-ignored',
  ];
  static flags = {
    promotion: Flags.string({ char: 'p', description: 'Promotion name, e.g. P34231 (default: taken from the checked-out branch promotion/<name>)' }),
    'target-org': Flags.string({ char: 'o', description: 'Copado org alias or username (default: sf target-org)' }),
    output: Flags.string({ char: 'f', default: 'manifest/package.xml', description: 'Where to write package.xml' }),
    'include-ignored': Flags.boolean({ description: 'Keep components that are listed in "Ignored changes" (they are left out by default)' }),
    'api-version': Flags.string({ description: 'API version in package.xml (default: sourceApiVersion from sfdx-project.json, else 67.0)' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PackageGenerate);

    const name = flags.promotion ?? promotionNameFromBranch();
    if (!name) {
      this.error('The checked-out branch is not a promotion branch (promotion/<name>). Check out the promotion branch, or pass --promotion <name>.', { exit: 1 });
    }

    const org = resolveOrg(flags['target-org']);
    this.log(dim(`Promotion ${name} | org ${org}`));

    const conn = await connect(org);
    const files = await fetchPromotionFiles(conn, name).catch((err: unknown) => this.error(err instanceof Error ? err.message : String(err), { exit: 1 }));
    if (!files) {
      this.error(`No promotion named "${name}" in ${org}. Is ${org} your Copado org?`, { exit: 1 });
    }
    if (!files.changes) {
      this.error(`Promotion ${files.promotion.name} has no "Copado Promotion changes" file, so there is nothing to build a package from.`, { exit: 1 });
    }

    const selection = selectComponents(files.changes, files.ignored, !flags['include-ignored']);
    if (selection.members.size === 0) {
      this.error(
        `No components left for package.xml (${selection.total} in the promotion, ${selection.ignored} ignored, ${Object.values(selection.skippedByAction).reduce((a, b) => a + b, 0)} skipped by action).`,
        { exit: 1 },
      );
    }

    const apiVersion = flags['api-version'] ?? defaultApiVersion();
    const target = resolve(process.cwd(), flags.output);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buildPackageXml(selection.members, apiVersion), 'utf8');

    this.log(`${green('Done.')} ${selection.included} component${selection.included === 1 ? '' : 's'} in ${selection.members.size} type${selection.members.size === 1 ? '' : 's'} -> ${flags.output}`);
    const width = Math.max(...[...selection.members.keys()].map((t) => t.length));
    for (const [type, members] of selection.members) this.log(`  ${type.padEnd(width)}  ${members.length}`);

    const status = files.promotion.status ? ` (status: ${files.promotion.status})` : '';
    this.log(dim(`Promotion ${files.promotion.name}${status}: ${selection.total} component${selection.total === 1 ? '' : 's'} in the file.`));
    if (!files.ignored) this.log(dim('No "Ignored changes" file on this promotion.'));
    else if (flags['include-ignored']) this.log(dim('Ignored changes were kept (--include-ignored).'));
    else {
      this.log(dim(`Ignored (left out): ${selection.ignored}`));
      const shown = selection.ignoredComponents.slice(0, 50);
      const typeWidth = Math.max(0, ...shown.map((i) => i.type.length));
      for (const i of shown) this.log(yellow(`  ${i.type.padEnd(typeWidth)}  ${i.name}`) + (i.story ? dim(`  (${i.story})`) : ''));
      if (selection.ignoredComponents.length > shown.length) this.log(dim(`  ... and ${selection.ignoredComponents.length - shown.length} more`));
    }

    if (selection.duplicates > 0) this.log(dim(`Listed more than once, merged: ${selection.duplicates}`));

    const skipped = Object.entries(selection.skippedByAction);
    if (skipped.length > 0) {
      this.log(yellow(`Skipped by action: ${skipped.map(([action, n]) => `${n} ${action}`).join(', ')}`));
    }
    if (selection.nonMetadata.length > 0) {
      this.log(yellow(`Left out, not Salesforce metadata (category Other): ${selection.nonMetadata.join(', ')}`));
    }
  }
}
