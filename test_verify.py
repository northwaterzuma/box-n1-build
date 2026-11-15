import io
import unittest
import zipfile
from verify_apks import validate_zip, validate_manifest, network_resource_path, RECEIVER_PERMISSION


def apk(libraries):
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w') as archive:
        for name, (bits, machine) in libraries.items():
            elf = bytearray(64)
            elf[:4] = b'\x7fELF'
            elf[4:6] = bytes([bits, 1])
            elf[18:20] = machine.to_bytes(2, 'little')
            archive.writestr(name, elf)
    return zipfile.ZipFile(data)


MANIFEST = '''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.github.tvbox.osc.n1strict">
<uses-permission android:name="android.permission.INTERNET"/>
<application android:allowBackup="false" android:usesCleartextTraffic="false" android:networkSecurityConfig="@xml/network_security_config">
<activity android:name="com.github.tvbox.osc.ui.activity.HomeActivity" android:exported="true"><intent-filter><category android:name="android.intent.category.LEANBACK_LAUNCHER"/></intent-filter></activity>
</application></manifest>'''


class ApkPolicyTests(unittest.TestCase):
    def test_resolves_network_policy_from_manifest_resource_id(self):
        manifest = 'A: android:networkSecurityConfig(0x01010527)=@0x7f130002'
        resources = '  spec resource 0x7f130002 xml/network_security_config\n  resource 0x7f130001 xml/other:\n    (string8) "res/xml/network_security_config.xml"\n  resource 0x7f130002 xml/network_security_config:\n    (string8) "res/a.xml"\n'
        self.assertEqual(network_resource_path(manifest, resources), 'res/a.xml')

    def test_rejects_missing_or_ambiguous_network_resource(self):
        manifest = 'A: android:networkSecurityConfig(0x01010527)=@0x7f130002'
        for resources in ('', 'resource 0x7f130002 xml/policy:\n (string8) "res/a.xml"\n (string8) "res/b.xml"'):
            with self.assertRaisesRegex(ValueError, 'ambiguous'):
                network_resource_path(manifest, resources)

    def test_accepts_real_arm64_header(self):
        with apk({'lib/arm64-v8a/libplayer.so': (2, 183)}) as archive:
            self.assertEqual(len(validate_zip(archive, 'arm64-v8a')), 1)

    def test_rejects_mislabeled_32_bit_library(self):
        with apk({'lib/arm64-v8a/libplayer.so': (1, 40)}) as archive:
            with self.assertRaisesRegex(ValueError, 'architecture mismatch'):
                validate_zip(archive, 'arm64-v8a')

    def test_rejects_mixed_abi(self):
        with apk({'lib/arm64-v8a/liba.so': (2, 183), 'lib/armeabi-v7a/liba.so': (1, 40)}) as archive:
            with self.assertRaisesRegex(ValueError, 'mixed ABI'):
                validate_zip(archive, 'arm64-v8a')

    def test_rejects_disabled_runtime(self):
        with apk({'lib/arm64-v8a/libquickjs.so': (2, 183)}) as archive:
            with self.assertRaisesRegex(ValueError, 'runtime packaged'):
                validate_zip(archive, 'arm64-v8a')

    def test_accepts_minimal_manifest(self):
        self.assertEqual(validate_manifest(MANIFEST), ['android.permission.INTERNET'])

    def test_rejects_permission_added_by_dependency(self):
        with self.assertRaisesRegex(ValueError, 'merged permissions'):
            validate_manifest(MANIFEST.replace('android.permission.INTERNET', 'android.permission.RECORD_AUDIO'))

    def test_accepts_signature_protected_internal_receiver_permission(self):
        manifest = MANIFEST.replace('<application ', f'<permission android:name="{RECEIVER_PERMISSION}" android:protectionLevel="signature"/><uses-permission android:name="{RECEIVER_PERMISSION}"/><application ')
        self.assertIn(RECEIVER_PERMISSION, validate_manifest(manifest))

    def test_rejects_weak_or_missing_internal_receiver_permission(self):
        for declaration in ('', f'<permission android:name="{RECEIVER_PERMISSION}" android:protectionLevel="normal"/>'):
            manifest = MANIFEST.replace('<application ', declaration + f'<uses-permission android:name="{RECEIVER_PERMISSION}"/><application ')
            with self.assertRaisesRegex(ValueError, 'same signature'):
                validate_manifest(manifest)

    def test_rejects_mount_permission(self):
        with self.assertRaisesRegex(ValueError, 'merged permissions'):
            validate_manifest(MANIFEST.replace('android.permission.INTERNET', 'android.permission.MOUNT_UNMOUNT_FILESYSTEMS'))

    def test_rejects_exported_receiver(self):
        with self.assertRaisesRegex(ValueError, 'exported component'):
            validate_manifest(MANIFEST.replace('</application>', '<receiver android:name="Other" android:exported="true"/></application>'))

    def test_rejects_http_policy(self):
        with self.assertRaisesRegex(ValueError, 'Cleartext'):
            validate_manifest(MANIFEST.replace('usesCleartextTraffic="false"', 'usesCleartextTraffic="true"'))


if __name__ == '__main__':
    unittest.main()
