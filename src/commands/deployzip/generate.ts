import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command, Flags } from '@oclif/core';
import { isIgnoredByRepo } from '../../lib/gitignore.js';
import { isManagedPackageComponent } from '../../lib/managed.js';
import { packageFileFor, promotionFromManifestName, zipFileFor } from '../../lib/names.js';
import { promotionNameFromBranch } from '../../lib/promotion.js';
import { c, num, table } from '../../lib/render.js';
import { buildDeploymentZip } from '../../lib/zip.js';

// Source folders from sfdx-project.json, else force-app.
function defaultSourceDirs(): string[] {
  try {
    const p = resolve(process.cwd(), 'sfdx-project.json');
    if (existsSync(p)) {
      const dirs = (JSON.parse(readFileSync(p, 'utf8')) as { packageDirectories?: Array<{ path?: string }> }).packageDirectories ?? [];
      const paths = dirs.map((d) => d.path).filter((x): x is string => Boolean(x));
      if (paths.length > 0) return paths;
    }
  } catch {
    /* fall through */
  }
  return ['force-app'];
}

const git = (args: string[]): { ok: boolean; out: string } => {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
};

export default class DeployzipGenerate extends Command {
  static summary = 'Generate a deployment zip from a package.xml and the local branch';
  static description =
    'Reads the components listed in a package.xml and packs their source files from your local checkout into a Metadata API ' +
    'deployment zip (package.xml + metadata). Only generates the zip: nothing is deployed and no org is contacted.';
  static examples = [
    '<%= config.bin %> deployzip generate',
    '<%= config.bin %> deployzip generate -x manifest/package-P34277.xml -f deployment-P34277.zip',
    '<%= config.bin %> deployzip generate -x C:/temp/package.xml --allow-missing',
  ];
  static flags = {
    manifest: Flags.string({ char: 'x', description: 'package.xml to build the zip from, any path (default: package-<promotion>.xml in your Downloads folder for the checked-out promotion branch, else manifest/package.xml)' }),
    output: Flags.string({ char: 'f', description: 'Where to write the zip (default: your Downloads folder, as deployment-<promotion>.zip, for example deployment-P34277.zip)' }),
    'source-dir': Flags.string({ char: 'd', multiple: true, description: 'Source folder(s) to read from (default: packageDirectories of sfdx-project.json, else force-app)' }),
    'allow-missing': Flags.boolean({ description: 'Write the zip even if some components in package.xml have no source in this checkout' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DeployzipGenerate);

    // Which package.xml: the one given, else the one "package generate" wrote for this promotion branch (Downloads), else
    // an older copy in the repo's manifest folder.
    const branchPromotion = promotionNameFromBranch();
    const candidates = [
      ...(branchPromotion ? [packageFileFor(branchPromotion), `manifest/package-${branchPromotion}.xml`] : []),
      'manifest/package.xml',
    ];
    const manifestPath = flags.manifest ?? candidates.find((cand) => existsSync(resolve(process.cwd(), cand)));
    if (!manifestPath) this.error(`No package.xml given and none found (looked for ${candidates.join(', ')}). Run "agentia package generate" first, or pass --manifest <path>.`, { exit: 1 });
    const manifest = resolve(process.cwd(), manifestPath);
    if (!existsSync(manifest)) this.error(`package.xml not found: ${manifest}`, { exit: 1 });
    // The zip is named after the promotion in the package.xml's name, else after the checked-out promotion branch.
    const outputPath = flags.output ?? zipFileFor(promotionFromManifestName(manifestPath) ?? branchPromotion);

    const sourceDirs = (flags['source-dir']?.length ? flags['source-dir'] : defaultSourceDirs()).map((d) => resolve(process.cwd(), d));
    const missingDirs = sourceDirs.filter((d) => !existsSync(d));
    if (missingDirs.length > 0) this.error(`Source folder not found: ${missingDirs.join(', ')}. Run this from the repo root, or pass --source-dir.`, { exit: 1 });

    // The zip is made from the files on disk, so say when they are not what the remote branch has.
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch.ok) {
      this.log(c.dim(`Branch ${branch.out} | manifest ${manifestPath}`));
      const behind = git(['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
      const m = /^(\d+)\s+(\d+)$/.exec(behind.out);
      if (behind.ok && m && Number(m[2]) > 0) {
        this.log(c.yellow(`Your branch is ${m[2]} commit(s) behind its remote (as of your last fetch). Run "git pull" first if the zip should include them.`));
      }
      const dirty = git(['status', '--porcelain', '--', ...sourceDirs]);
      if (dirty.ok && dirty.out) {
        this.log(c.yellow(`${dirty.out.split('\n').length} uncommitted change(s) in the source folders; the zip uses your working files.`));
      }
    }

    const build = await buildDeploymentZip(manifest, sourceDirs).catch((err: unknown) => this.error(err instanceof Error ? err.message : String(err), { exit: 1 }));

    // Per type: what package.xml lists, what is in the zip, and what has no source.
    const missingByType = new Map<string, number>();
    for (const key of build.missing) {
      const type = key.slice(0, key.indexOf(':'));
      missingByType.set(type, (missingByType.get(type) ?? 0) + 1);
    }
    const types = [...new Set([...build.packed.keys(), ...missingByType.keys()])].sort((a, b) => a.localeCompare(b));
    const totals = { listed: 0, inZip: 0, inside: 0, missing: 0 };
    const rows = types.map((type) => {
      const packed = build.packed.get(type) ?? { total: 0, insideParent: 0 };
      const missing = missingByType.get(type) ?? 0;
      totals.listed += packed.total + missing;
      totals.inZip += packed.total;
      totals.inside += packed.insideParent;
      totals.missing += missing;
      return [type, String(packed.total + missing), String(packed.total), num(packed.insideParent), num(missing, c.red)];
    });
    const totalRow = [c.bold('Total'), c.bold(String(totals.listed)), c.bold(String(totals.inZip)), num(totals.inside), num(totals.missing, c.red)];
    const headers = ['Type', 'In package.xml', 'In the zip', 'inside their object', 'Not in the zip'];

    // Some components are expected to have no source: ones this repo's .gitignore keeps out of git, and components of an
    // installed managed package (the package is installed in the target org before the deployment). They are left out of
    // the zip and listed, but do not block it. Anything else without source is a real gap: the file is not on the
    // checked-out branch, so that blocks unless --allow-missing.
    const toRow = (key: string): string[] => [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const reasonFor = (key: string): string | undefined => {
      const type = key.slice(0, key.indexOf(':'));
      const name = key.slice(key.indexOf(':') + 1);
      if (isManagedPackageComponent(type, name)) return 'managed package (installed in the org before deploy)';
      if (isIgnoredByRepo(type, name, sourceDirs[0])) return "kept out of git by the repo's .gitignore";
      return undefined;
    };
    const expected = build.missing.filter((key) => reasonFor(key) !== undefined);
    const noSource = build.missing.filter((key) => !expected.includes(key));

    if (expected.length > 0) {
      this.log('');
      this.log(c.yellow(`${expected.length} component(s) left out of the zip, as expected (no source to pack):`));
      this.log(table(['Type', 'Name', 'Why'], expected.slice(0, 30).map((key) => [...toRow(key), reasonFor(key) ?? ''])).join('\n'));
      if (expected.length > 30) this.log(c.dim(`... and ${expected.length - 30} more`));
    }

    if (noSource.length > 0) {
      this.log('');
      this.log(c.yellow(`${noSource.length} component(s) in package.xml have no source in this checkout:`));
      const shown = noSource.slice(0, 30).map(toRow);
      this.log(table(['Type', 'Name'], shown).join('\n'));
      if (noSource.length > shown.length) this.log(c.dim(`... and ${noSource.length - shown.length} more`));
      if (!flags['allow-missing']) {
        this.log(c.dim('Check out the promotion branch (and pull), or use --allow-missing to build the zip without them.'));
        this.log('');
        this.log(table(headers, [...rows, totalRow], { rightAlign: [1, 2, 3, 4], separatorBefore: [rows.length] }).join('\n'));
        this.error('Zip not written.', { exit: 1 });
      }
    }

    const target = resolve(process.cwd(), outputPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, build.zip);

    this.log('');
    this.log(`${c.green('Done.')} ${c.bold(String(totals.inZip))} of ${totals.listed} components in the zip -> ${c.cyan(outputPath)} ${c.dim(`(${(statSync(target).size / 1024).toFixed(1)} KB)`)}`);
    if (expected.length > 0) this.log(c.dim(`${expected.length} component(s) are not in the zip because their source is not in git (listed above). Managed-package ones must be installed in the target org first.`));
    this.log('');
    this.log(table(headers, [...rows, totalRow], { rightAlign: [1, 2, 3, 4], separatorBefore: [rows.length] }).join('\n'));
    if (totals.inside > 0) {
      this.log(c.dim('"inside their object": listed next to their whole object, so they are part of that object\'s file in the zip, not files of their own.'));
    }
    this.log(c.dim('Zip generated only. Nothing was deployed.'));
  }
}
