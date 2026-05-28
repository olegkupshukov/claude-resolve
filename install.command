#!/bin/bash
# Resolve AI - double-click installer launcher for macOS.
# Opens in Terminal and hands off to install.sh.
cd "$(dirname "$0")" || exit 1
bash ./install.sh
