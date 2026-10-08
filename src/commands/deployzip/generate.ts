import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command, Flags } from '@oclif/core';
import { buildDeploymentZip } from '../../lib/zip.js';

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string) => (s: string): string => (useColor ? `\u001b[${code}m${s}\u001b[0m` : s);
const dim = paint('2');
const green = paint('32');
const yellow = paint('33');

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
    '<%= config.bin %> deployzip generate -x manifest/package.xml -f deployment.zip',
    '<%= config.bin %> deployzip generate -x C:/temp/package.xml --allow-missing',
  ];
  static flags = {
    manifest: Flags.string({ char: 'x', default: 'manifest/package.xml', description: 'package.xml to build the zip from (any path)' }),
    output: Flags.string({ char: 'f', default: 'deployment.zip', description: 'Where to write the zip' }),
    'source-dir': Flags.string({ char: 'd', multiple: true, description: 'Source folder(s) to read from (default: packageDirectories of sfdx-project.json, else force-app)' }),
    'allow-missing': Flags.boolean({ description: 'Write the zip even if some components in package.xml have no source in this checkout' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DeployzipGenerate);

    const manifest = resolve(process.cwd(), flags.manifest);
    if (!existsSync(manifest)) this.error(`package.xml not found: ${manifest}`, { exit: 1 });
    const sourceDirs = (flags['source-dir']?.length ? flags['source-dir'] : defaultSourceDirs()).map((d) => resolve(process.cwd(), d));
    const missingDirs = sourceDirs.filter((d) => !existsSync(d));
    if (missingDirs.length > 0) this.error(`Source folder not found: ${missingDirs.join(', ')}. Run this from the repo root, or pass --source-dir.`, { exit: 1 });

    // The zip is made from the files on disk, so say when they are not what the remote branch has.
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch.ok) {
      this.log(dim(`Branch ${branch.out} | manifest ${flags.manifest}`));
      const behind = git(['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
      const m = /^(\d+)\s+(\d+)$/.exec(behind.out);
      if (behind.ok && m && Number(m[2]) > 0) {
        this.log(yellow(`Your branch is ${m[2]} commit(s) behind its remote (as of your last fetch). Run "git pull" first if the zip should include them.`));
      }
      const dirty = git(['status', '--porcelain', '--', ...sourceDirs]);
      if (dirty.ok && dirty.out) {
        this.log(yellow(`${dirty.out.split('\n').length} uncommitted change(s) in the source folders; the zip uses your working files.`));
      }
    }

    const build = await buildDeploymentZip(manifest, sourceDirs).catch((err: unknown) => this.error(err instanceof Error ? err.message : String(err), { exit: 1 }));

    if (build.missing.length > 0) {
      this.log(yellow(`${build.missing.length} component(s) in package.xml have no source in this checkout:`));
      for (const key of build.missing.slice(0, 30)) this.log(`  ${key}`);
      if (build.missing.length > 30) this.log(`  ... and ${build.missing.length - 30} more`);
      if (!flags['allow-missing']) {
        this.log(dim('Check out the promotion branch (and pull), or use --allow-missing to build the zip without them.'));
        this.error('Zip not written.', { exit: 1 });
      }
    }

    const target = resolve(process.cwd(), flags.output);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, build.zip);

    const count = [...build.packed.values()].reduce((a, b) => a + b, 0);
    this.log(`${green('Done.')} ${count} component${count === 1 ? '' : 's'} in ${build.packed.size} type${build.packed.size === 1 ? '' : 's'} -> ${flags.output} (${(statSync(target).size / 1024).toFixed(1)} KB)`);
    const width = Math.max(...[...build.packed.keys()].map((t) => t.length));
    for (const [type, n] of [...build.packed].sort(([a], [b]) => a.localeCompare(b))) this.log(`  ${type.padEnd(width)}  ${n}`);
    this.log(dim('Zip generated only. Nothing was deployed.'));
  }
}
