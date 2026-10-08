// A component of an installed (managed) package carries the package's namespace: "ecosystems_svcs__VMO" (a tab),
// "ns__Thing" (a class), "ns__Obj__c" (an object). It comes from the package that is installed in the target org before the
// deployment, so a deployment zip does not need its source, and the repo does not keep it.
//
// Only the types below are judged by name: for them a namespace on the whole name means "from a package". A child such as
// "SBQQ__Quote__c.My_Field__c" is NOT on the list: the field is the team's own even though its object is managed.

const NAME_JUDGED_TYPES = new Set([
  'CustomTab', 'ApexClass', 'ApexTrigger', 'ApexPage', 'ApexComponent', 'CustomPermission', 'FlexiPage', 'Flow',
  'PermissionSet', 'PermissionSetGroup', 'StaticResource', 'CustomApplication', 'AuraDefinitionBundle', 'LightningComponentBundle', 'CustomObject',
]);

// The suffixes of ordinary custom things ("Foo__c", "Foo__mdt"): a name that ends this way has no namespace by itself.
const CUSTOM_SUFFIXES = new Set(['c', 'r', 'e', 'b', 'x', 'mdt', 's', 'share', 'history', 'feed', 'tag', 'ka', 'kav', 'pc', 'pr', 'xo', 'ep', 'p', 'mc']);

function hasNamespace(name: string): boolean {
  const i = name.indexOf('__');
  if (i <= 0) return false;
  const rest = name.slice(i + 2);
  return rest.length > 0 && !CUSTOM_SUFFIXES.has(rest.toLowerCase());
}

export function isManagedPackageComponent(type: string, fullName: string): boolean {
  return NAME_JUDGED_TYPES.has(type) && hasNamespace(fullName);
}
