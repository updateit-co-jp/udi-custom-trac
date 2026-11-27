# Copyright (c) 2006-2026 update it, Inc.
# All rights reserved.
"""Render reStructuredText documents to HTML fragments.

Usage: render_rst.py FILE.rst [FILE.rst ...]

Prints a JSON object to stdout that maps each input path to
``{"title": <html>, "body": <html>}``. The HTML is a fragment; the page
layout is applied by build.mjs.
"""

import json
import sys

from docutils.core import publish_parts

SETTINGS = {
    # The document title is taken out as "title"; sections start at h2
    # because the layout provides the page h1.
    'doctitle_xform': True,
    'initial_header_level': 2,
    # Source comes from this repository only, but keep the untrusted-input
    # features off anyway.
    'file_insertion_enabled': False,
    'raw_enabled': False,
    'input_encoding': 'utf-8',
    # Fail the build on errors (level 3) and show warnings (level 2).
    'report_level': 2,
    'halt_level': 3,
    # Render language-tagged code blocks without requiring Pygments.
    'syntax_highlight': 'none',
}


def render(path):
    with open(path, encoding='utf-8') as f:
        source = f.read()
    parts = publish_parts(source=source, source_path=path,
                          writer_name='html5', settings_overrides=SETTINGS)
    return {'title': parts['title'], 'body': parts['body']}


def main(argv):
    if not argv:
        sys.stderr.write(__doc__)
        return 2
    result = {path: render(path) for path in argv}
    json.dump(result, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
