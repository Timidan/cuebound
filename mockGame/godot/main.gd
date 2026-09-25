extends Node2D

const Player := preload("res://player.gd")
const TILES := preload("res://art/tiles.png")
const BACKGROUND := preload("res://art/background.png")
const T := 18
const SKY := Color("dff6f5")
const HILLS := Color("c2e3e8")
const INK := Color("262b44")
# Kenney Pixel Platformer tile indices (row * 20 + column in tiles.png).
const DECOR := {">": 88, "b": 124, "B": 125, "t": 126, "m": 128}
const SPIKES := 68
const COIN := [151, 152]
const FLAG := [111, 112]
const POLE := 131
const DOOR := [130, 150]

# '#' ground, '=' floating platform, '^' spikes, 'o' coin, 'F' checkpoint, 'D' exit door, 'P' start,
# '>' sign, 'b'/'B' plants, 't' tree, 'm' mushroom.
const LEVEL := [
	"........................................................................................................................",
	"........................................................................................................................",
	"........................................................................................................................",
	"#....................................................................o.................................................#",
	"#...................................................................===.......ooo......................................#",
	"#.....................o.o........................................o.........F.t.b...........................o...........#",
	"#...........o...................o...............................===......########...............o......................#",
	"#..........o.o.........om......o.o............o.............o............########........oo....o.o........t............#",
	"#..................t.#####..................o...o..........===...........###########...................B.####..........#",
	"#..P.>.ooo..b.B..#########..F..^^^...B...>..........F..b...^^^^^^^^^^^^^^###########..b..^^....^^^...########..ooob.D..#",
	"############################################.....#######################################################################",
	"############################################^^^^^#######################################################################",
	"########################################################################################################################",
]

# Dev regression run (`-- --autopilot`), one step per physics tick. Columns are level columns.
# ["to", col] walk there and stop; ["run", col] walk there and keep going; ["dir", d] hold a direction;
# ["jump"]; ["dash"]; ["click"] press the button; ["wait", ticks]; ["land"] wait until standing;
# ["hurt"] wait until hurt.
const PLAN := [
	["wait", 40], ["to", 9],
	["jump"], ["land"],
	["wait", 20], ["click"],
	["wait", 20], ["to", 6], ["dir", 1], ["dash"], ["wait", 20],
	["run", 15], ["jump"], ["land"],
	["run", 19], ["jump"], ["land"],
	["run", 27], ["land"],
	["to", 30], ["dir", 1], ["hurt"], ["dir", 0], ["land"],
	["wait", 20], ["to", 26], ["run", 30], ["jump"], ["land"],
	["run", 43], ["jump"], ["wait", 16], ["dash"], ["land"],
	["run", 57], ["jump"], ["land"],
	["to", 59], ["run", 61], ["jump"], ["land"],
	["to", 64], ["run", 66], ["jump"], ["land"],
	["to", 68], ["run", 70], ["jump"], ["land"],
	["to", 76], ["wait", 60],
]

var player := Player.new()
var ground := TileMapLayer.new()
var deco := TileMapLayer.new()
var src := TileSetAtlasSource.new()
var coins: Array[Area2D] = []
var taken := {}
var score := 0
var finished := false
var hud := Label.new()
var clock := Label.new()
var banner := Label.new()
var button := Button.new()
var bg := TextureRect.new()
var plan: Array = []
var step := 0
var wait := 0
var movie_origin := -1
var movie_us := 0.0


func _ready() -> void:
	RenderingServer.set_default_clear_color(SKY)
	_bind("left", [KEY_A, KEY_LEFT])
	_bind("right", [KEY_D, KEY_RIGHT])
	_bind("jump", [KEY_SPACE, KEY_W, KEY_UP])
	_bind("dash", [KEY_SHIFT])

	_background()
	var ts := TileSet.new()
	ts.tile_size = Vector2i(T, T)
	ts.add_physics_layer()
	src.texture = TILES
	src.texture_region_size = Vector2i(T, T)
	ts.add_source(src, 0)
	ground.tile_set = ts
	deco.tile_set = ts
	add_child(deco)
	add_child(ground)
	_build()
	ground.update_internals()

	player.position = player.spawn
	add_child(player)
	var cam := player.camera
	cam.limit_left = 0
	cam.limit_top = 0
	cam.limit_right = LEVEL[0].length() * T
	cam.limit_bottom = LEVEL.size() * T

	_ui()
	var args := OS.get_cmdline_user_args()
	if "--autopilot" in args:
		plan = PLAN
		player.auto = true
		Sfx.log_events = true
		print("[autopilot] start, pack installed: %s" % (Sfx.pack != null))


func _process(delta: float) -> void:
	# Movie Maker (--write-movie) renders as fast as it can; hold each frame to wall-clock time so a human can play.
	if OS.has_feature("movie"):
		if movie_origin < 0:
			movie_origin = Time.get_ticks_usec()
		movie_us += delta * 1e6
		var ahead := movie_origin + int(movie_us) - Time.get_ticks_usec()
		if ahead > 0:
			OS.delay_usec(ahead)
	bg.position.x = -fposmod(player.camera.get_screen_center_position().x * 0.9, 288.0)


func _physics_process(_delta: float) -> void:
	if not finished:
		var s := Engine.get_physics_frames() / 60
		clock.text = "%d:%02d" % [s / 60, s % 60]
		clock.modulate = Color("ff8080") if s >= 55 else Color.WHITE
	if plan.is_empty():
		return
	if wait > 0:
		wait -= 1
		return
	if step >= plan.size():
		print("[autopilot] done at %d ms, plays: %s" % [roundi(Engine.get_physics_frames() * 1000.0 / 60.0), Sfx.counts])
		plan = []
		get_tree().quit()
		return
	var c: Array = plan[step]
	var done := true
	match c[0]:
		"to", "run":
			var dx: float = c[1] * T + T / 2.0 - player.position.x
			done = absf(dx) < 3.0
			if not done:
				player.dir = signf(dx)
			elif c[0] == "to":
				player.dir = 0.0
		"dir":
			player.dir = c[1]
		"jump":
			player.want_jump = true
		"dash":
			player.want_dash = true
		"click":
			button.pressed.emit()
		"wait":
			wait = c[1]
		"land":
			done = player.dead_ticks == 0 and player.is_on_floor()
		"hurt":
			done = player.dead_ticks > 0
	if done:
		step += 1


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		get_tree().quit()


func _bind(action: String, keys: Array) -> void:
	InputMap.add_action(action)
	for k in keys:
		var e := InputEventKey.new()
		e.physical_keycode = k
		InputMap.action_add_event(action, e)


func _build() -> void:
	for r in LEVEL.size():
		for c in LEVEL[r].length():
			var cell := Vector2i(c, r)
			var p := Vector2(c * T, r * T)
			match LEVEL[r][c]:
				"#":
					_tile(ground, cell, _ground_tile(c, r), true)
				"=":
					_tile(ground, cell, _edge(LEVEL[r][c - 1] == "=", LEVEL[r][c + 1] == "=", 0), true)
				"^":
					_tile(deco, cell, SPIKES, false)
					_area(Rect2(p + Vector2(2, 12), Vector2(14, 6))).body_entered.connect(_on_spikes)
				"o":
					_coin(p + Vector2(T / 2.0, T / 2.0))
				"F":
					_checkpoint(cell)
				"D":
					_tile(deco, cell, DOOR[1], false)
					_tile(deco, cell + Vector2i.UP, DOOR[0], false)
					_area(Rect2(p + Vector2(4, -T), Vector2(10, 2 * T))).body_entered.connect(_on_door)
				"P":
					player.spawn = p + Vector2(T / 2.0, T)
				var ch:
					if DECOR.has(ch):
						_tile(deco, cell, DECOR[ch], false)


func _solid(c: int, r: int) -> bool:
	if r < 0:
		return false
	if c < 0 or c >= LEVEL[0].length() or r >= LEVEL.size():
		return true
	return LEVEL[r][c] == "#"


# Kenney's ground set: row 1 is the grass top, row 6 the dirt fill, each as single/left/middle/right,
# plus 24/25 for fill next to a lower grass top and 104 as a plain fill variant.
func _ground_tile(c: int, r: int) -> int:
	if not _solid(c, r - 1):
		return _edge(_solid(c - 1, r), _solid(c + 1, r), 20)
	var t := _edge(_solid(c - 1, r), _solid(c + 1, r), 120)
	if t != 122:
		return t
	if not _solid(c - 1, r - 1):
		return 25
	if not _solid(c + 1, r - 1):
		return 24
	return 104 if (c * 7 + r * 3) % 5 == 0 else 122


func _edge(left: bool, right: bool, base: int) -> int:
	if not left and not right:
		return base
	if not left:
		return base + 1
	if not right:
		return base + 3
	return base + 2


func _tile(layer: TileMapLayer, cell: Vector2i, index: int, solid: bool) -> void:
	var at := Vector2i(index % 20, index / 20)
	if not src.has_tile(at):
		src.create_tile(at)
		if solid:
			var d := src.get_tile_data(at, 0)
			d.add_collision_polygon(0)
			d.set_collision_polygon_points(0, 0, PackedVector2Array([Vector2(-9, -9), Vector2(9, -9), Vector2(9, 9), Vector2(-9, 9)]))
	layer.set_cell(cell, 0, at)


func _frames(indices: Array, fps: float) -> SpriteFrames:
	var f := SpriteFrames.new()
	f.set_animation_speed("default", fps)
	for i in indices:
		var t := AtlasTexture.new()
		t.atlas = TILES
		t.region = Rect2((i % 20) * T, (i / 20) * T, T, T)
		f.add_frame("default", t)
	return f


func _area(r: Rect2) -> Area2D:
	var shape := RectangleShape2D.new()
	shape.size = r.size
	var col := CollisionShape2D.new()
	col.shape = shape
	col.position = r.get_center()
	var a := Area2D.new()
	a.add_child(col)
	add_child(a)
	return a


func _coin(p: Vector2) -> void:
	var shape := CircleShape2D.new()
	shape.radius = 6
	var col := CollisionShape2D.new()
	col.shape = shape
	var s := AnimatedSprite2D.new()
	s.sprite_frames = _frames(COIN, 5.0)
	s.play()
	var a := Area2D.new()
	a.position = p
	a.add_child(col)
	a.add_child(s)
	a.body_entered.connect(_on_coin.bind(a))
	add_child(a)
	coins.append(a)


func _checkpoint(cell: Vector2i) -> void:
	_tile(deco, cell, POLE, false)
	var flag := AnimatedSprite2D.new()
	flag.sprite_frames = _frames(FLAG, 4.0)
	flag.position = Vector2(cell.x * T + T / 2.0, (cell.y - 1) * T + T / 2.0)
	flag.modulate = Color(0.55, 0.55, 0.6)
	add_child(flag)
	var spawn := Vector2(cell.x * T + T / 2.0, (cell.y + 1) * T)
	_area(Rect2(cell.x * T, (cell.y - 1) * T, T, 2 * T)).body_entered.connect(_on_flag.bind(flag, spawn))


func _on_flag(body: Node2D, flag: AnimatedSprite2D, spawn: Vector2) -> void:
	if body == player and not flag.is_playing():
		player.spawn = spawn
		flag.modulate = Color.WHITE
		flag.play()


func _on_coin(body: Node2D, coin: Area2D) -> void:
	if body != player or taken.has(coin):
		return
	taken[coin] = true
	coin.set_deferred("monitoring", false)
	var s: AnimatedSprite2D = coin.get_child(1)
	var t := coin.create_tween().set_parallel()
	t.tween_property(s, "position:y", -10.0, 0.25)
	t.tween_property(s, "modulate:a", 0.0, 0.25)
	score += 1
	_update_hud()
	Sfx.play("pickup")


func _on_spikes(body: Node2D) -> void:
	if body == player:
		player.hurt()


func _on_door(body: Node2D) -> void:
	if body != player or finished:
		return
	finished = true
	player.set_physics_process(false)
	player.sprite.play("idle")
	banner.text = "Level complete!  %d / %d coins in %s" % [score, coins.size(), clock.text]
	banner.show()
	get_tree().create_timer(2.5).timeout.connect(get_tree().quit)


func _on_reset() -> void:
	Sfx.play("ui_click")
	button.modulate = Color(1.5, 1.5, 0.7)
	create_tween().tween_property(button, "modulate", Color.WHITE, 0.25)
	taken.clear()
	for c in coins:
		var s: AnimatedSprite2D = c.get_child(1)
		s.position = Vector2.ZERO
		s.modulate = Color.WHITE
		c.set_deferred("monitoring", true)
	score = 0
	_update_hud()


func _update_hud() -> void:
	hud.text = "%d / %d" % [score, coins.size()]


# Kenney's background strip (sky, clouds, hills) tiled horizontally behind the level at 3x, scrolling slower than the camera.
func _background() -> void:
	var layer := CanvasLayer.new()
	layer.layer = -1
	add_child(layer)
	var hills := ColorRect.new()
	hills.color = HILLS
	hills.position = Vector2(0, 440)
	hills.size = Vector2(960, 100)
	layer.add_child(hills)
	bg.texture = BACKGROUND
	bg.stretch_mode = TextureRect.STRETCH_TILE
	bg.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	bg.size = Vector2((960 + 288) / 3.0, 72)
	bg.scale = Vector2(3, 3)
	bg.position.y = 440 - 216
	layer.add_child(bg)


func _label(l: Label, size: int) -> Label:
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_constant_override("outline_size", 8)
	l.add_theme_color_override("font_outline_color", INK)
	return l


func _ui() -> void:
	var ui := CanvasLayer.new()
	add_child(ui)

	var coin_icon := TextureRect.new()
	var icon := AtlasTexture.new()
	icon.atlas = TILES
	icon.region = Rect2((COIN[0] % 20) * T, (COIN[0] / 20) * T, T, T)
	coin_icon.texture = icon
	coin_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	coin_icon.position = Vector2(14, 12)
	coin_icon.size = Vector2(36, 36)
	ui.add_child(coin_icon)
	_label(hud, 26).position = Vector2(58, 12)
	ui.add_child(hud)

	_label(clock, 26)
	clock.position = Vector2(440, 12)
	clock.size = Vector2(80, 36)
	clock.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ui.add_child(clock)

	var hint := _label(Label.new(), 16)
	hint.text = "A/D move    Space jump    Shift dash    Esc quit"
	hint.position = Vector2(16, 508)
	hint.modulate = Color(1, 1, 1, 0.85)
	ui.add_child(hint)
	create_tween().tween_property(hint, "modulate:a", 0.0, 1.0).set_delay(12.0)

	for state in ["normal", "hover", "pressed"]:
		var sb := StyleBoxFlat.new()
		sb.bg_color = {"normal": Color("e8a33d"), "hover": Color("f4bc5c"), "pressed": Color("c47f22")}[state]
		sb.border_color = INK
		sb.set_border_width_all(3)
		sb.set_corner_radius_all(6)
		sb.set_content_margin_all(8)
		sb.content_margin_left = 16
		sb.content_margin_right = 16
		button.add_theme_stylebox_override(state, sb)
	button.add_theme_font_size_override("font_size", 20)
	for k in ["font_color", "font_hover_color", "font_pressed_color"]:
		button.add_theme_color_override(k, INK)
	button.text = "Reset coins"
	button.position = Vector2(800, 12)
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(_on_reset)
	ui.add_child(button)

	_label(banner, 34)
	banner.position = Vector2(0, 230)
	banner.size = Vector2(960, 60)
	banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner.hide()
	ui.add_child(banner)
	_update_hud()
