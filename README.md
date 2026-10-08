# agentia-package

Two commands for the [`agentia`](https://www.npmjs.com/package/@copado/agentia-cli) CLI:

| Command | What it does |
|---|---|
| `agentia package generate` | Builds a `package.xml` from a Copado promotion. |
| `agentia deployzip generate` | Builds a `deployment.zip` from a `package.xml` and your local checkout. |

Neither command deploys anything.

## Install

```
npm install            # in this folder
npm run build
agentia plugins link <path-to-this-folder>
```

Needs Node 18+ and the `sf` CLI with your Copado org authenticated.

## `agentia package generate`

```
git checkout promotion/P34231
agentia package generate
```

1. Reads the promotion name from the checked-out branch (`promotion/P34231` -> `P34231`), or from `-p P34231`.
2. Finds that promotion in your default `sf` org (the Copado org), or the org from `-o <alias>`.
3. Reads the promotion's `Copado Promotion changes` file and its `Ignored changes` file, if there is one.
4. Writes `manifest/package.xml` (change with `-f <path>`).

What goes into `package.xml`:

- Components with action **Add**, **SelectiveCommit**, **RetrieveOnly** or **Full**.
- **Delete** is skipped. Deletions are not part of the package. Any other unknown action is skipped too.
- Components listed in **Ignored changes** are left out (same rules as the quick action on the Promotion record). Use `--include-ignored` to keep them.
- Components Copado files under category **Other** (for example a QCP script, type `js`) are left out: they are not Salesforce metadata.
- A component listed several times (for example by several stories) appears once.

Everything that is left out is counted in the summary the command prints.

| Flag | Meaning |
|---|---|
| `-p, --promotion` | Promotion name (default: from the branch) |
| `-o, --target-org` | Copado org alias or username (default: sf target-org) |
| `-f, --output` | Output path (default `manifest/package.xml`) |
| `--include-ignored` | Keep components listed in Ignored changes |
| `--api-version` | API version in the file (default: `sourceApiVersion` of `sfdx-project.json`, else 67.0) |

## `agentia deployzip generate`

```
agentia deployzip generate                      # manifest/package.xml -> deployment.zip
agentia deployzip generate -x C:/temp/package.xml -f out/deployment.zip
```

Packs the source files of every component in the package.xml, from your local checkout, into a Metadata API deployment zip.

- If a component in the package.xml has no source in your checkout, the command lists it and does **not** write the zip. Check out the promotion branch (and `git pull`), or pass `--allow-missing`; the zip's own `package.xml` then lists only what is in it.
- It warns when your branch is behind its remote, or has uncommitted changes in the source folders, because the zip is built from your files on disk.

| Flag | Meaning |
|---|---|
| `-x, --manifest` | package.xml to use (default `manifest/package.xml`, any path works) |
| `-f, --output` | Zip path (default `deployment.zip`) |
| `-d, --source-dir` | Source folder(s) (default: `packageDirectories` of `sfdx-project.json`, else `force-app`) |
| `--allow-missing` | Write the zip even if some components have no source |

## Develop

```
npm run build
npm test
```
