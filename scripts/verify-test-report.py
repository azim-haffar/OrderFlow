"""Audit Surefire XML against test source and a successful Maven build log."""
import argparse
import hashlib
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-log', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--not-before', help='ISO timestamp captured before starting Maven, including timezone')
    args = parser.parse_args()
    log = args.build_log.read_text(encoding='utf-8', errors='replace')
    if 'BUILD SUCCESS' not in log or 'BUILD FAILURE' in log:
        raise ValueError('Build log does not establish a successful verification run')
    minimum = None
    if args.not_before:
        minimum = datetime.fromisoformat(args.not_before.replace('Z', '+00:00'))
        if minimum.tzinfo is None:
            parser.error('--not-before needs a timezone')
    expected = {}
    for source in (ROOT / 'backend/src/test/java').rglob('*.java'):
        text = source.read_text(encoding='utf-8-sig')
        methods = set(re.findall(r'@Test\s+void\s+(\w+)\s*\(', text))
        if methods:
            package = re.search(r'package\s+([\w.]+)\s*;', text).group(1)
            expected[package + '.' + source.stem] = methods
    reports = sorted((ROOT / 'backend/target/surefire-reports').glob('TEST-*.xml'))
    if len(reports) != len(expected):
        raise ValueError('Suite count differs from test source')
    result = {'schema_version': 1,
        'audited_at_utc': datetime.now(timezone.utc).isoformat(),
        'revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'command': 'mvn clean verify -B -Dapi.version=1.44',
        'build_log_sha256': hashlib.sha256(args.build_log.read_bytes()).hexdigest(),
        'report_not_before': args.not_before, 'suites': []}
    for path in reports:
        if minimum and path.stat().st_mtime < minimum.timestamp():
            raise ValueError(f'Report predates run: {path.name}')
        suite = ET.parse(path).getroot()
        counts = {key: int(suite.attrib[key]) for key in ('tests', 'failures', 'errors', 'skipped')}
        cases = suite.findall('testcase')
        names = [case.attrib['name'] for case in cases]
        if set(names) != expected.get(suite.attrib['name']) or len(names) != len(set(names)):
            raise ValueError(f'Test methods differ from source: {path.name}')
        if len(cases) != counts['tests'] or any(counts[key] for key in ('failures', 'errors', 'skipped')):
            raise ValueError(f'Incomplete or failing suite: {path.name}')
        if any(case.find(kind) is not None for case in cases for kind in ('failure', 'error', 'skipped')):
            raise ValueError(f'Failing testcase: {path.name}')
        result['suites'].append({'name': suite.attrib['name'], **counts,
            'elapsed_seconds': float(suite.attrib['time']),
            'xml_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'cases': [{'name': case.attrib['name'], 'elapsed_seconds': float(case.attrib['time'])}
                      for case in cases]})
    result['totals'] = {key: sum(suite[key] for suite in result['suites'])
                       for key in ('tests', 'failures', 'errors', 'skipped')}
    total_line = 'Tests run: {tests}, Failures: {failures}, Errors: {errors}, Skipped: {skipped}'.format(**result['totals'])
    if total_line not in log:
        raise ValueError('XML totals differ from the Maven summary')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result['totals']))


if __name__ == '__main__':
    main()
