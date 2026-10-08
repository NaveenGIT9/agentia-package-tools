import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command, Flags } from '@oclif/core';
import { packageFileFor } from '../../lib/names.js';
import { connect, resolveOrg } from '../../lib/org.js';
import { buildPackageXml, selectComponents } from '../../lib/packageXml.js';
import { fetchPromotionFiles, promotionNameFromBranch } from '../../lib/promotion.js';
import { c, num, table } from '../../lib/render.js';

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
    output: Flags.string({ char: 'f', description: 'Where to write package.xml (default: your Downloads folder, as package-<promotion>.xml, for example package-P34277.xml)' }),
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
    this.log(c.dim(`Promotion ${name} | org ${org}`));

    const conn = await connect(org);
    const files = await fetchPromotionFiles(conn, name).catch((err: unknown) => this.error(err instanceof Error ? err.message : String(err), { exit: 1 }));
    if (!files) {
      this.error(`No promotion named "${name}" in ${org}. Is ${org} your Copado org?`, { exit: 1 });
    }
    if (!files.changes) {
      this.error(`Promotion ${files.promotion.name} has no "Copado Promotion changes" file, so there is nothing to build a package from.`, { exit: 1 });
    }

    const selection = selectComponents(files.changes, files.ignored, !flags['include-ignored']);
    const skippedCount = Object.values(selection.skippedByAction).reduce((a, b) => a + b, 0);
    if (selection.members.size === 0) {
      this.error(
        `No components left for package.xml (${selection.total} in the promotion, ${selection.ignored} ignored, ${skippedCount} skipped by action, ${selection.nonMetadata.length} not Salesforce metadata).`,
        { exit: 1 },
      );
    }

    const apiVersion = flags['api-version'] ?? defaultApiVersion();
    const outputPath = flags.output ?? packageFileFor(files.promotion.name);
    const target = resolve(process.cwd(), outputPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buildPackageXml(selection.members, apiVersion), 'utf8');

    const status = files.promotion.status ? `  |  status: ${files.promotion.status}` : '';
    this.log('');
    this.log(`${c.green('Done.')} ${c.bold(`Promotion ${files.promotion.name}`)}${c.dim(status)}`);
    this.log(`package.xml -> ${c.cyan(outputPath)}`);

    // How the promotion's components add up to what is in package.xml.
    this.log('');
    this.log(c.bold('Summary'));
    this.log(
      table(
        ['', 'Components'],
        [
          ['In the promotion file', String(selection.total)],
          ['Included in package.xml', num(selection.included, c.green)],
          ['Merged: listed more than once', num(selection.duplicates)],
          [flags['include-ignored'] ? 'Ignored changes (kept: --include-ignored)' : 'Left out: ignored changes', num(selection.ignored, c.yellow)],
          ['Left out: skipped by action', num(skippedCount, c.yellow)],
          ['Left out: not Salesforce metadata', num(selection.nonMetadata.length, c.yellow)],
        ],
        { rightAlign: [1], separatorBefore: [1] },
      ).join('\n'),
    );
    if (!files.ignored) this.log(c.dim('No "Ignored changes" file on this promotion.'));

    this.log('');
    this.log(c.bold('In package.xml'));
    const typeRows = [...selection.members].map(([type, members]) => [type, String(members.length)]);
    this.log(table(['Type', 'Components'], [...typeRows, ['Total', c.bold(String(selection.included))]], { rightAlign: [1], separatorBefore: [typeRows.length] }).join('\n'));

    if (selection.ignoredComponents.length > 0 && !flags['include-ignored']) {
      this.log('');
      this.log(c.bold('Left out: ignored changes'));
      const shown = selection.ignoredComponents.slice(0, 50);
      this.log(table(['Type', 'Name', 'Story'], shown.map((i) => [i.type, c.yellow(i.name), i.story || c.dim('-')])).join('\n'));
      if (selection.ignoredComponents.length > shown.length) this.log(c.dim(`... and ${selection.ignoredComponents.length - shown.length} more`));
    }

    if (skippedCount > 0) {
      this.log('');
      this.log(c.bold('Left out: skipped by action'));
      this.log(table(['Action', 'Components'], Object.entries(selection.skippedByAction).map(([action, n]) => [action, String(n)]), { rightAlign: [1] }).join('\n'));
    }

    if (selection.nonMetadata.length > 0) {
      this.log('');
      this.log(c.bold('Left out: not Salesforce metadata (category Other)'));
      this.log(table(['Type', 'Name'], selection.nonMetadata.map((k) => [k.split(':')[0], k.slice(k.indexOf(':') + 1)])).join('\n'));
    }
  }
}
