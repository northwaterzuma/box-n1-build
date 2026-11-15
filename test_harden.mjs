import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceMethod, replaceOnce, createPlan, transform } from './harden.mjs';

test('method replacement preserves adjacent code despite quoted and commented braces', () => {
  const input = 'class T { void m() { String s="}"; /* } */ if(true) { } } void next() {} }';
  const output = replaceMethod(input, 'void m()', ' return;');
  assert.match(output, /void m\(\) \{\n return;/);
  assert.match(output, /void next\(\) \{\}/);
  assert.equal(output.includes('String s='), false);
});
test('ambiguous edits fail instead of modifying an arbitrary occurrence', () => {
  assert.throws(() => replaceOnce('unsafe unsafe', 'unsafe', 'safe'), /one occurrence/);
  assert.throws(() => replaceMethod('class T {}', 'void missing()', ''), /missing/);
});
test('missing source snapshot fails before producing a write plan', () => {
  assert.throws(() => createPlan(new Map()), /Snapshot mismatch/);
});
test('all adjacent dangerous permission declarations are removed', () => {
  const names = ['MANAGE_EXTERNAL_STORAGE','REQUEST_INSTALL_PACKAGES','REQUEST_DELETE_PACKAGES','QUERY_ALL_PACKAGES'];
  const input = names.map(p => `    <uses-permission android:name="android.permission.${p}" />`).join('\n')
    + '\n<application android:allowBackup="true" android:usesCleartextTraffic="true"></application>';
  const output = transform('app/src/main/AndroidManifest.xml', input);
  for (const name of names) assert.equal(output.includes(name), false);
  assert.match(output, /MOUNT_UNMOUNT_FILESYSTEMS" tools:node="remove"/);
  assert.match(output, /ProfileInstallReceiver" tools:node="remove"/);
});
