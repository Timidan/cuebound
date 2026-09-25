---
name: cuebound-events
description: Write cuebound-events.json, the list of game actions that need a sound effect, by reading a game's code. Use when the user wants to make sounds for their game with CueBound, asks for "the event list for CueBound", or wants to know which moments in their game need sound effects.
---

# CueBound event list

CueBound generates sound effects for a game. It needs to know which actions need a sound and what happens in each. A gameplay clip only shows what happened to be played; the code shows every action. Your job is to read the code and write that list.

## Output

Write `cuebound-events.json` at the root of the game project:

```json
{
  "events": [
    { "id": "jump", "label": "Jump", "description": "Small hero hops off the ground", "recurring": true },
    { "id": "checkpoint", "label": "Checkpoint", "description": "A flag on a pole unfurls when the hero touches it", "recurring": false }
  ]
}
```

- `id`: lowercase letters, digits and `_`, starting with a letter, at most 32 characters. The game will call `Sfx.play("<id>")`. If the code already plays sounds by name, reuse those names.
- `label`: a short name a person would use, such as "Coin pickup".
- `description`: at most 120 characters. Say what physically happens on screen: who or what moves, its size and material, and the contact or change. CueBound sends this text to the sound model, and the user picks the sound style separately, so describe the action rather than the sound. Don't name other games, brands or real people.
- `recurring`: `true` if it happens many times in normal play (jumps, footsteps, pickups, hits), so CueBound asks for 2 takes that alternate.

## How to find the events

Read the code rather than guessing from file names. Look for:

1. Player input handlers: jump, dash, attack, interact, and the input map (`project.godot` `[input]`, or the engine's equivalent).
2. State changes: leaving or touching the ground, taking damage, dying, respawning, levelling up.
3. Collisions and triggers: pickups, doors, checkpoints, spikes, goals (`body_entered`, `area_entered` or the engine's equivalent).
4. UI: button presses, menu open and back, confirm and cancel.
5. Existing sound calls (`play()`, `AudioStreamPlayer`, `Sfx.play`): keep their names.

Include rare actions that a short clip might miss, such as level complete, death or a door opening. Leave out music, ambient loops and voice lines: CueBound makes short one-shot effects.

List the most important actions first. CueBound works on up to 5 at a time and lets the user choose, so a longer list is fine.

## When you finish

Tell the user:

- the path of the file;
- for each event, the file and line where `Sfx.play("<id>")` belongs, if the game doesn't call it yet;
- to paste the file into CueBound on the Events screen ("Load your game's event list").

Don't edit the game's code unless the user asks. The descriptions leave the user's computer as prompts to the Livepeer network, so keep secrets, private names and personal data out of them.
