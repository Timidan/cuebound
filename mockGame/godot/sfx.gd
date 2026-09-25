extends Node
# Example autoload "Sfx". It forwards to the CueBound pack when res://cuebound_pack/ is installed
# and does nothing otherwise, so the game runs silently without a pack.
# `-- --event-log=<abs path>` writes every play() to that file as [{"ms":<int>,"event":"jump"},...].
# ms = physics frames * 1000/60: physics runs at 60 ticks/s, so under --write-movie --fixed-fps 30
# (two ticks per movie frame) it matches the movie's timeline to within one frame (33 ms).

const PACK := "res://cuebound_pack/cuebound_sfx.gd"

var pack
var log_events := false
var log_path := ""
var events := []
var counts := {}


func _ready() -> void:
	if ResourceLoader.exists(PACK):
		pack = load(PACK).new()
		add_child(pack)
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--event-log="):
			log_path = a.trim_prefix("--event-log=")
			_write_log()


func play(event_id: String) -> void:
	var ms := roundi(Engine.get_physics_frames() * 1000.0 / 60.0)
	counts[event_id] = counts.get(event_id, 0) + 1
	if log_events:
		print("[sfx] %d ms %s" % [ms, event_id])
	if log_path:
		events.append({"ms": ms, "event": event_id})
		_write_log()
	if pack:
		pack.play(event_id)


# Rewrites the whole file on every event so closing the window at any point leaves a complete log.
func _write_log() -> void:
	var f := FileAccess.open(log_path, FileAccess.WRITE)
	if f == null:
		push_error("event log: cannot write %s (%s)" % [log_path, error_string(FileAccess.get_open_error())])
		log_path = ""
		return
	f.store_string(JSON.stringify(events, "", false))
