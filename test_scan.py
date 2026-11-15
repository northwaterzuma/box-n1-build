import unittest
from scan_dependencies import inspect_results


class DependencyAuditTests(unittest.TestCase):
    def test_fails_on_incomplete_response(self):
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            inspect_results([{'name': 'g:a', 'version': '1'}], {'results': []})

    def test_fails_on_server_error(self):
        with self.assertRaisesRegex(ValueError, 'query failed'):
            inspect_results([{'name': 'g:a', 'version': '1'}], {'results': [{'error': 'bad request'}]})

    def test_preserves_reported_advisory(self):
        result = inspect_results([{'name': 'g:a', 'version': '1'}], {'results': [{'vulns': [{'id': 'TEST-ADVISORY'}]}]})
        self.assertEqual(result[0]['vulnerability'], 'TEST-ADVISORY')


if __name__ == '__main__':
    unittest.main()
