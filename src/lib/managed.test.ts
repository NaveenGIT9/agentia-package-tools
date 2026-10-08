import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isManagedPackageComponent } from './managed.js';

test('a namespaced tab, class or object comes from an installed package', () => {
  assert.equal(isManagedPackageComponent('CustomTab', 'ecosystems_svcs__VMO'), true); // the tab from promotion P34141
  assert.equal(isManagedPackageComponent('ApexClass', 'ns__Thing'), true);
  assert.equal(isManagedPackageComponent('CustomObject', 'SBQQ__Quote__c'), true);
  assert.equal(isManagedPackageComponent('PermissionSet', 'ns__Perm'), true);
});

test('the team\'s own components are not, even on a managed object', () => {
  assert.equal(isManagedPackageComponent('CustomObject', 'MyObject__c'), false);
  assert.equal(isManagedPackageComponent('ApexClass', 'AccountTriggersHandler'), false);
  assert.equal(isManagedPackageComponent('CustomTab', 'MyObject__c'), false);
  assert.equal(isManagedPackageComponent('CustomField', 'SBQQ__Quote__c.My_Field__c'), false); // a child type: never judged by name
  assert.equal(isManagedPackageComponent('Layout', 'SBQQ__Quote__c-Quote Layout'), false);
});
