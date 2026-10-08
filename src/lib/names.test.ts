import assert from 'node:assert/strict';
import { basename, dirname } from 'node:path';
import { test } from 'node:test';
import { downloadsDir, packageFileFor, promotionFromManifestName, zipFileFor } from './names.js';

test('default files go to the Downloads folder and carry the promotion name', () => {
  assert.equal(basename(downloadsDir()), 'Downloads');
  assert.equal(basename(packageFileFor('P34277')), 'package-P34277.xml');
  assert.equal(dirname(packageFileFor('P34277')), downloadsDir());
  assert.equal(basename(zipFileFor('P34277')), 'deployment-P34277.zip');
  assert.equal(dirname(zipFileFor('P34277')), downloadsDir());
  assert.equal(basename(zipFileFor(undefined)), 'deployment.zip');
});

test('the promotion is read back from the package.xml file name', () => {
  assert.equal(promotionFromManifestName('manifest/package-P34277.xml'), 'P34277');
  assert.equal(promotionFromManifestName(packageFileFor('P1')), 'P1');
  assert.equal(promotionFromManifestName('manifest/package.xml'), undefined);
  assert.equal(promotionFromManifestName('anything.xml'), undefined);
});
