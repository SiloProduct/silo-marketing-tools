#!/bin/zsh
cd "${0:A:h}" || exit 1
frame_node=""
if [[ -f .frame-runtime.json ]]; then
  frame_node=$(/usr/bin/plutil -extract nodePath raw -o - .frame-runtime.json 2>/dev/null)
fi
if [[ -z "$frame_node" ]]; then
  frame_node=$(command -v node)
fi
if [[ -z "$frame_node" || ! -x "$frame_node" ]]; then
  print "Frame needs Node 22.13 or newer. Ask your agent to configure its runtime."
  exit 1
fi
"$frame_node" scripts/launch.js
