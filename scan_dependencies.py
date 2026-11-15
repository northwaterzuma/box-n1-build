"""Query OSV for resolved Maven coordinates. No downloaded code is executed."""
import json
from pathlib import Path
import sys
import urllib.request

ENDPOINT = 'https://api.osv.dev/v1/querybatch'


def inspect_results(packages, response):
    results = response.get('results')
    if not isinstance(results, list) or len(results) != len(packages):
        raise ValueError('Incomplete OSV response; refusing to report a pass')
    findings = []
    for package, result in zip(packages, results):
        if not isinstance(result, dict) or result.get('error'):
            raise ValueError('OSV query failed for ' + package['name'])
        for vulnerability in result.get('vulns', []):
            if not vulnerability.get('id'):
                raise ValueError('Invalid OSV vulnerability entry')
            findings.append({**package, 'vulnerability': vulnerability['id']})
    return findings


def main():
    inventory = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    packages = list({(p['name'], p['version']): p for p in inventory['packages']}.values())
    if not packages or any(':' not in p['name'] or not p['version'] or p['version'] == 'unspecified' for p in packages):
        raise ValueError('Missing Maven coordinates; dependency audit incomplete')
    findings = []
    for start in range(0, len(packages), 100):
        batch = packages[start:start + 100]
        payload = {'queries': [{'package': {'ecosystem': 'Maven', 'name': p['name']}, 'version': p['version']} for p in batch]}
        request = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(request, timeout=60) as response:
            findings.extend(inspect_results(batch, json.load(response)))
    report = {'endpoint': ENDPOINT, 'maven_packages_checked': len(packages), 'findings': findings,
              'limitations': 'No proof of absence of vulnerabilities. Bundled native libraries and local JAR/AAR require separate provenance and security review.'}
    Path(sys.argv[2]).write_text(json.dumps(report, indent=2), encoding='utf-8')
    if findings:
        print(json.dumps(findings, indent=2))
        raise SystemExit('Known dependency advisories found; APK build is blocked pending review and fixes.')
    print('No OSV matches for the queried Maven versions. Opaque bundled binaries remain unassessed.')


if __name__ == '__main__':
    main()
