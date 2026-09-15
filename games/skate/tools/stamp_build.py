#!/usr/bin/env python3
"""stamp_build.py — write the current time into src/config.js as BUILD.

Run it immediately before deploying. The pause screen shows the value, so
"is my change actually on the tablet" stops being a guess.

    python3 tools/stamp_build.py
"""
import datetime
import os
import re
import sys

CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "config.js")


def main():
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    with open(CONFIG) as fh:
        text = fh.read()
    new, n = re.subn(r"export const BUILD = '[^']*';",
                     "export const BUILD = '%s';" % stamp, text)
    if not n:
        print("no BUILD line in src/config.js", file=sys.stderr)
        return 1
    with open(CONFIG, "w") as fh:
        fh.write(new)
    print("build %s" % stamp)
    return 0


if __name__ == "__main__":
    sys.exit(main())
