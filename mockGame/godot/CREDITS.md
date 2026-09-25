# Credits

## Art: Pixel Platformer by Kenney

- Source: https://kenney.nl/assets/pixel-platformer (version 1.2, `kenney_pixel-platformer.zip`)
- Author: Kenney (www.kenney.nl)
- Licence: Creative Commons Zero, CC0 1.0 (http://creativecommons.org/publicdomain/zero/1.0/). The pack's own licence file is kept as `art/License.txt`.

Files used, all under `art/`:

| File | From the pack | Used for |
|---|---|---|
| `tiles.png` | `Tilemap/tilemap_packed.png`, unchanged | Ground, floating platforms, spikes, coins, checkpoint flags, exit door, signs and plants (tile indices are named in `main.gd`) |
| `characters.png` | `Tilemap/tilemap-characters_packed.png`, unchanged | Player: the green character, frames 0–1 (idle, run, jump) |
| `background.png` | `Tilemap/tilemap-backgrounds_packed.png`, cropped to the first 96×72 px (the light sky, cloud and hill tiles) | Scrolling background |
| `License.txt` | `License.txt`, unchanged | Licence evidence |

The HUD, button and banner use Godot's built-in default font and style boxes drawn in code.

## Sound

The game ships silent. Sounds come only from a CueBound pack installed at `res://cuebound_pack/`.
