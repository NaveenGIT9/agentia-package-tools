import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packageFileFor, promotionFromManifestName, zipFileFor } from './names.js';

test('default file names carry the promotion name', () => {
  assert.equal(packageFileFor('P34277'), 'manifest/package-P34277.xml');
  assert.equal(zipFileFor('P34277'), 'deployment-P34277.zip');
  assert.equal(zipFileFor(undefined), 'deployment.zip');
});

test('the promotion is read back from the package.xml file name', () => {
  assert.equal(promotionFromManifestName('manifest/package-P34277.xml'), 'P34277');
  assert.equal(promotionFromManifestName('C:\\temp\\package-P1.xml'), 'P1');
  assert.equal(promotionFromManifestName('manifest/package.xml'), undefined);
  assert.equal(promotionFromManifestName('anything.xml'), undefined);
});
