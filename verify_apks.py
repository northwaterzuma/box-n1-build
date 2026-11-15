"""Inspect APK data; never execute application code or extract APK entries."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile

ANDROID = '{http://schemas.android.com/apk/res/android}'
RECEIVER_PERMISSION = 'com.github.tvbox.osc.n1strict.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
ALLOWED_PERMISSIONS = {
    'android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.ACCESS_WIFI_STATE', 'android.permission.CHANGE_WIFI_MULTICAST_STATE',
    'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.FOREGROUND_SERVICE',
    RECEIVER_PERMISSION,
}
ABI = {'arm64-v8a': (2, 183), 'armeabi-v7a': (1, 40)}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_zip(archive, expected):
    names = archive.namelist()
    require(len(names) == len(set(names)), 'Duplicate ZIP entry')
    libraries = []
    for entry in archive.infolist():
        if not entry.filename.startswith('lib/') or not entry.filename.endswith('.so'):
            continue
        parts = entry.filename.split('/')
        require(len(parts) == 3 and parts[1] == expected, 'Unexpected or mixed ABI: ' + entry.filename)
        require(not re.search(r'quickjs|xwalk', parts[2], re.I), 'Disabled script/browser runtime packaged')
        with archive.open(entry) as library:
            header = library.read(64)
        require(len(header) >= 20 and header[:4] == b'\x7fELF', 'Not an ELF library: ' + entry.filename)
        require(header[5] == 1, 'Unexpected ELF byte order')
        require((header[4], int.from_bytes(header[18:20], 'little')) == ABI[expected], 'ELF architecture mismatch: ' + entry.filename)
        with archive.open(entry) as library:
            digest = hashlib.file_digest(library, 'sha256').hexdigest()
        libraries.append({'file': entry.filename, 'sha256': digest, 'size': entry.file_size})
    require(libraries, 'No native libraries found; the requested ABI was not verified')
    return libraries


def validate_manifest(xml):
    root = ET.fromstring(xml)
    require(root.attrib.get('package') == 'com.github.tvbox.osc.n1strict', 'Unexpected application ID')
    app = root.find('application')
    require(app is not None, 'Application element missing')
    require(app.get(ANDROID + 'debuggable', 'false') == 'false', 'Debuggable APK')
    require(app.get(ANDROID + 'allowBackup') == 'false', 'Backup must be disabled')
    require(app.get(ANDROID + 'usesCleartextTraffic') == 'false', 'Cleartext traffic not disabled')
    require(app.get(ANDROID + 'networkSecurityConfig'), 'Network security configuration missing')
    permissions = {item.get(ANDROID + 'name') for item in root if item.tag.startswith('uses-permission')}
    receiver_permissions = [item for item in root.findall('permission') if item.get(ANDROID + 'name') == RECEIVER_PERMISSION]
    if RECEIVER_PERMISSION in permissions or receiver_permissions:
        require(len(receiver_permissions) == 1 and receiver_permissions[0].get(ANDROID + 'protectionLevel') in ('signature', '2', '0x2', '0x00000002'), 'Internal receiver permission must require the same signature')
    require(permissions <= ALLOWED_PERMISSIONS, 'Unreviewed merged permissions: ' + str(sorted(permissions - ALLOWED_PERMISSIONS)))
    exported_components = []
    for tag in ('activity', 'activity-alias', 'service', 'receiver', 'provider'):
        for item in app.findall(tag):
            filters = item.findall('intent-filter')
            exported = item.get(ANDROID + 'exported', 'true' if filters else 'false')
            if exported != 'true':
                continue
            launcher = tag == 'activity' and item.get(ANDROID + 'name', '').endswith('.HomeActivity') and any(
                category.get(ANDROID + 'name') in ('android.intent.category.LAUNCHER', 'android.intent.category.LEANBACK_LAUNCHER')
                for intent in filters for category in intent.findall('category'))
            if not launcher:
                exported_components.append(item.get(ANDROID + 'name'))
    require(not exported_components, 'Unexpected exported components: ' + str(exported_components))
    return sorted(permissions)


def network_resource_path(manifest_tree, resources):
    reference = re.search(r'android:networkSecurityConfig[^=\n]*=@(0x[0-9a-fA-F]+)', manifest_tree)
    require(reference is not None, 'Packaged network policy reference missing')
    resource_id = reference.group(1).lower()
    paths = set()
    active = False
    for line in resources.splitlines():
        item = re.match(r'\s*(spec )?resource (0x[0-9a-fA-F]+)\b', line)
        if item:
            active = not item.group(1) and item.group(2).lower() == resource_id
        if active:
            paths.update(re.findall(r'"(res/[^"\n]+\.xml)"', line))
    require(len(paths) == 1, 'Missing or ambiguous packaged network policy resource: ' + resource_id)
    return paths.pop()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    parser.add_argument('--report', required=True, type=Path)
    parser.add_argument('--signed', action='store_true')
    args = parser.parse_args()
    sdk = Path(os.environ['ANDROID_HOME'])
    analyzer = sdk / 'cmdline-tools/latest/bin/apkanalyzer'
    tools = sdk / 'build-tools/34.0.0'
    apks = sorted(args.directory.rglob('*.apk'))
    require(len(apks) == 2, 'Expected exactly two APKs')
    found = set()
    report = []
    for apk in apks:
        expected = 'arm64-v8a' if 'arm64' in apk.name else 'armeabi-v7a' if 'armeabi' in apk.name else None
        require(expected in ABI and expected not in found, 'Unknown or duplicate target ABI')
        found.add(expected)
        with zipfile.ZipFile(apk) as archive:
            libraries = validate_zip(archive, expected)
        manifest = subprocess.check_output([str(analyzer), 'manifest', 'print', str(apk)], text=True)
        permissions = validate_manifest(manifest)
        manifest_tree = subprocess.check_output([str(tools / 'aapt'), 'dump', 'xmltree', str(apk), 'AndroidManifest.xml'], text=True)
        resources = subprocess.check_output([str(tools / 'aapt'), 'dump', '--values', 'resources', str(apk)], text=True)
        policy_path = network_resource_path(manifest_tree, resources)
        network = subprocess.check_output([str(tools / 'aapt'), 'dump', 'xmltree', str(apk), policy_path], text=True)
        require('cleartextTrafficPermitted' in network and re.search(r'cleartextTrafficPermitted[^\n]*0x0\s*$', network, re.M), 'Packaged network policy missing')
        require(not re.search(r'cleartextTrafficPermitted[^\n]*0xffffffff', network), 'Packaged network policy allows HTTP')
        require('"system"' in network and '"user"' not in network, 'Unexpected trust anchors')
        if args.signed:
            subprocess.run([str(tools / 'apksigner'), 'verify', '--verbose', str(apk)], check=True)
        with apk.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        report.append({'file': apk.name, 'abi': expected, 'sha256': digest, 'permissions': permissions, 'libraries': libraries, 'signature_checked': args.signed})
    require(found == set(ABI), 'Both target ABIs are required')
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    for item in report:
        print(json.dumps({key: item[key] for key in ('file', 'abi', 'sha256', 'permissions', 'signature_checked')}, ensure_ascii=False))
    print('Verified APK structure and merged policy. Device and dependency security remain separate checks.')


if __name__ == '__main__':
    main()
