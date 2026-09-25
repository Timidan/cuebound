#!/usr/bin/env bash
# Record yourself playing the reference game. Writes <out-dir>/gameplay.mp4 and <out-dir>/events.json
# (every Sfx.play with its time in the clip). Play, then reach the door or press Esc / close the window.
# The server accepts clips of 15–60 s. Audio is kept only when mockGame/godot/cuebound_pack/ is installed.
# Usage: bash mockGame/record-clip.sh <out-dir> [--autopilot]   (--autopilot: dev smoke test, no human)
set -euo pipefail
out=${1:?usage: bash mockGame/record-clip.sh <out-dir> [--autopilot]}
game=${GAME_DIR:-$(cd "$(dirname "$0")/godot" && pwd)}
mkdir -p "$out"
out=$(cd "$out" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
extra=()
[[ ${2:-} == --autopilot ]] && extra=(--autopilot)

rm -f "$out/events.json" "$out/gameplay.mp4"
godot --headless --path "$game" --import >/dev/null # a fresh checkout or a newly installed pack must be imported first
godot --path "$game" --write-movie "$tmp/movie.avi" --fixed-fps 30 -- --event-log="$out/events.json" "${extra[@]}"

audio=(-an)
if [[ -f "$game/cuebound_pack/cuebound_sfx.gd" ]]; then audio=(-c:a aac -b:a 192k); fi
ffmpeg -loglevel error -y -i "$tmp/movie.avi" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p "${audio[@]}" -movflags +faststart "$out/gameplay.mp4"

dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/gameplay.mp4")
echo "$out/gameplay.mp4: ${dur} s, audio: $([[ ${audio[0]} == -an ]] && echo none || echo "sound pack")"
echo "$out/events.json:"
jq -r 'group_by(.event)[] | "  \(.[0].event): \(length)"' "$out/events.json"
if awk -v d="$dur" 'BEGIN { exit !(d < 15 || d > 60) }'; then
  echo "WARNING: the clip is ${dur} s; the server accepts 15–60 s. Record again." >&2
fi
