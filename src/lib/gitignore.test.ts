import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expectedSourcePath } from './gitignore.js';

test('the expected path of a component in the source folder', () => {
  assert.equal(expectedSourcePath('CustomTab', 'ecosystems_svcs__VMO', 'force-app'), 'force-app/main/default/tabs/ecosystems_svcs__VMO.tab-meta.xml');
  assert.equal(expectedSourcePath('ApexClass', 'ns__Thing', 'force-app/'), 'force-app/main/default/classes/ns__Thing.cls-meta.xml');
  assert.equal(expectedSourcePath('Layout', 'Account-Customer Layout', 'D:\\repo\\force-app'), 'D:/repo/force-app/main/default/layouts/Account-Customer Layout.layout-meta.xml');
  assert.equal(expectedSourcePath('NoSuchType', 'X', 'force-app'), undefined);
});
