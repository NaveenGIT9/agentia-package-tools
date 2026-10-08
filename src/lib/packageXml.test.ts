import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPackageXml, selectComponents, type Change } from './packageXml.js';

const changes: Change[] = [
  { u: 'US-1', t: 'ApexClass', n: 'KeepMe', a: 'Add' },
  { u: 'US-1', t: 'ApexClass', n: 'OnlyIgnored', a: 'Add' },
  { u: 'US-1', t: 'ApexClass', n: 'SharedName', a: 'Add' },
  { u: 'US-2', t: 'ApexClass', n: 'SharedName', a: 'Add' },
  { u: 'US-9', t: 'Layout', n: 'Account-Partner Layout', a: 'SelectiveCommit', j: '{"selectiveCommitFileId":"x"}' },
  { u: 'US-9', t: 'Profile', n: 'Admin', a: 'Full' },
  { u: 'US-9', t: 'CustomObject', n: 'Account', a: 'RetrieveOnly' },
  { u: 'US-9', t: 'ApexClass', n: 'GoneClass', a: 'Delete' },
  { u: 'US-9', t: 'ApexClass', n: 'Odd', a: 'Something' },
];

test('includes Add, SelectiveCommit, RetrieveOnly and Full; skips Delete and unknown actions and reports them', () => {
  const s = selectComponents(changes, null, true);
  assert.deepEqual(s.members.get('Layout'), ['Account-Partner Layout']);
  assert.deepEqual(s.members.get('Profile'), ['Admin']);
  assert.deepEqual(s.members.get('CustomObject'), ['Account']);
  assert.ok(!s.members.get('ApexClass')!.includes('GoneClass'));
  assert.ok(!s.members.get('ApexClass')!.includes('Odd'));
  assert.deepEqual(s.skippedByAction, { Delete: 1, Something: 1 });
});

test('action matching is case-insensitive', () => {
  const s = selectComponents([{ t: 'ApexClass', n: 'A', a: 'selectivecommit' }, { t: 'ApexClass', n: 'B', a: 'DELETE' }], null, true);
  assert.deepEqual(s.members.get('ApexClass'), ['A']);
  assert.deepEqual(s.skippedByAction, { DELETE: 1 });
});

test('ignored changes: story-specific, story-less, and promotion entries with no story', () => {
  const ignored: Change[] = [
    { u: 'US-1', t: 'ApexClass', n: 'OnlyIgnored', a: 'Add' },
    { u: 'US-1', t: 'ApexClass', n: 'SharedName', a: 'Add' },
  ];
  const s = selectComponents(changes, ignored, true);
  const classes = s.members.get('ApexClass')!;
  assert.ok(!classes.includes('OnlyIgnored'));
  assert.ok(classes.includes('SharedName'), 'US-2 still has SharedName');
  assert.ok(classes.includes('KeepMe'));
  assert.equal(s.ignored, 2);
  assert.deepEqual(s.ignoredComponents, [
    { story: 'US-1', type: 'ApexClass', name: 'OnlyIgnored' },
    { story: 'US-1', type: 'ApexClass', name: 'SharedName' },
  ]);

  // an ignored entry without a story removes the component for every story
  const noStory = selectComponents(changes, [{ t: 'ApexClass', n: 'SharedName', a: 'Add' }], true);
  assert.ok(!noStory.members.get('ApexClass')!.includes('SharedName'));

  // a promotion entry without a story is removed by any ignored entry of that type and name
  const storyless = selectComponents([{ t: 'ApexClass', n: 'X', a: 'Add' }], [{ u: 'US-5', t: 'ApexClass', n: 'X' }], true);
  assert.equal(storyless.included, 0);
});

test('excludeIgnored=false keeps ignored components', () => {
  const s = selectComponents(changes, [{ u: 'US-1', t: 'ApexClass', n: 'OnlyIgnored' }], false);
  assert.ok(s.members.get('ApexClass')!.includes('OnlyIgnored'));
  assert.equal(s.ignored, 0);
});

test('members are distinct and sorted; types are sorted', () => {
  const s = selectComponents(
    [{ t: 'ApexClass', n: 'B', a: 'Add' }, { t: 'ApexClass', n: 'A', a: 'Add' }, { t: 'ApexClass', n: 'A', a: 'Add' }, { t: 'Layout', n: 'L', a: 'Add' }],
    null,
    true,
  );
  assert.deepEqual([...s.members.keys()], ['ApexClass', 'Layout']);
  assert.deepEqual(s.members.get('ApexClass'), ['A', 'B']);
  assert.equal(s.included, 3);
});

test('category Other (a QCP script) is left out and reported; repeated components are merged and counted', () => {
  const s = selectComponents(
    [
      { u: 'US-1', t: 'js', n: 'CalculateQuotefields', m: 'scripts/qcp/CalculateQuotefields', c: 'Other', a: 'Add' },
      { u: 'US-1', t: 'ApexClass', n: 'A', c: 'SFDX', a: 'Add' },
      { u: 'US-1', t: 'ApexClass', n: 'A', c: 'SFDX', a: 'Add' },
    ],
    null,
    true,
  );
  assert.ok(!s.members.has('js'));
  assert.deepEqual(s.nonMetadata, ['js:CalculateQuotefields']);
  assert.deepEqual(s.members.get('ApexClass'), ['A']);
  assert.equal(s.duplicates, 1);
  assert.equal(s.included, 1);
});

test('package.xml is well formed and escapes special characters', () => {
  const xml = buildPackageXml(new Map([['Layout', ['Account-Partner Layout', 'A & B <x>']]]), '67.0');
  assert.match(xml, /<members>Account-Partner Layout<\/members>/);
  assert.match(xml, /<members>A &amp; B &lt;x&gt;<\/members>/);
  assert.match(xml, /<name>Layout<\/name>/);
  assert.match(xml, /<version>67\.0<\/version>/);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
});
