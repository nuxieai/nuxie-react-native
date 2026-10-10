"""Read-only cached trees publish privately and preserve the old product on failure."""
from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch

from sdk import publish_distribution


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.product = self.directory / 'cached'
        self.product.mkdir()
        (self.product / 'index.js').write_text('compiled SDK\n')
        self.root = self.directory / 'checkout'
        self.root.mkdir()

    def test_read_only_product_remains_read_only_and_republishes(self):
        self.product.chmod(0o555)
        (self.product / 'index.js').chmod(0o444)
        publish_distribution(self.product, self.root)
        publish_distribution(self.product, self.root)
        self.assertEqual((self.root / 'dist/index.js').read_text(), 'compiled SDK\n')
        self.assertEqual(self.product.stat().st_mode & 0o777, 0o555)
        self.assertEqual((self.root / 'dist/index.js').stat().st_mode & 0o777, 0o644)
        self.product.chmod(0o755)

    def test_failed_publish_restores_complete_previous_output(self):
        (self.root / 'dist').mkdir()
        (self.root / 'dist/index.js').write_text('previous product\n')
        replace = os.replace
        def fail_staged(source, destination):
            if Path(source).name == 'dist' and Path(source).parent.name.startswith('npm-'):
                raise OSError('publication failed')
            replace(source, destination)
        with patch('sdk.os.replace', side_effect=fail_staged):
            with self.assertRaisesRegex(OSError, 'publication failed'):
                publish_distribution(self.product, self.root)
        self.assertEqual((self.root / 'dist/index.js').read_text(), 'previous product\n')

    def test_other_checkout_output_symlink_is_preserved(self):
        other = self.directory / 'other-output'
        other.mkdir()
        (other / 'index.js').write_text('other worktree\n')
        (self.root / 'dist').symlink_to(other, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Preserving a symlink'):
            publish_distribution(self.product, self.root)
        self.assertEqual((other / 'index.js').read_text(), 'other worktree\n')


if __name__ == '__main__':
    unittest.main()
