extends CharacterBody2D

const SPEED := 120.0
const ACCEL := 1400.0
const AIR_ACCEL := 1000.0
const FRICTION := 1800.0
const JUMP_VELOCITY := -330.0
const JUMP_CUT := -150.0
const GRAVITY := 1000.0
const FALL_GRAVITY := 1500.0
const MAX_FALL := 420.0
const COYOTE_TICKS := 6
const BUFFER_TICKS := 8
const DASH_SPEED := 330.0
const DASH_TICKS := 10
const DASH_COOLDOWN := 36
const RESPAWN_TICKS := 40
const SHEET := preload("res://art/characters.png")

var spawn := Vector2.ZERO
var auto := false
var dir := 0.0
var want_jump := false
var want_dash := false
var facing := 1.0
var dash_ticks := 0
var cooldown := 0
var dead_ticks := 0
var coyote := 0
var buffer := 0
var was_on_floor := true
var sprite := AnimatedSprite2D.new()
var camera := Camera2D.new()
var dust := CPUParticles2D.new()


func _ready() -> void:
	var shape := RectangleShape2D.new()
	shape.size = Vector2(12, 18)
	var col := CollisionShape2D.new()
	col.shape = shape
	col.position = Vector2(0, -9)
	add_child(col)

	var frames := SpriteFrames.new()
	for a in [["idle", [0], 1.0], ["run", [0, 1], 10.0], ["jump", [1], 1.0]]:
		frames.add_animation(a[0])
		frames.set_animation_speed(a[0], a[2])
		for i in a[1]:
			var t := AtlasTexture.new()
			t.atlas = SHEET
			t.region = Rect2(i * 24, 0, 24, 24)
			frames.add_frame(a[0], t)
	sprite.sprite_frames = frames
	sprite.offset = Vector2(0, -12)
	sprite.play("idle")
	add_child(sprite)

	dust.emitting = false
	dust.one_shot = true
	dust.amount = 8
	dust.lifetime = 0.35
	dust.explosiveness = 1.0
	dust.direction = Vector2(0, -1)
	dust.spread = 75.0
	dust.initial_velocity_min = 20.0
	dust.initial_velocity_max = 45.0
	dust.gravity = Vector2(0, 80)
	dust.scale_amount_min = 1.0
	dust.scale_amount_max = 2.0
	dust.color = Color(1, 1, 1, 0.85)
	add_child(dust)

	camera.zoom = Vector2(3, 3)
	camera.position = Vector2(0, -16)
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 7.0
	add_child(camera)


func _physics_process(delta: float) -> void:
	if not auto:
		dir = Input.get_axis("left", "right")
		want_jump = Input.is_action_just_pressed("jump")
		want_dash = Input.is_action_just_pressed("dash")
	var holding_jump := auto or Input.is_action_pressed("jump")
	if want_jump:
		buffer = BUFFER_TICKS
	var dash := want_dash
	want_jump = false
	want_dash = false

	if dead_ticks > 0:
		dead_ticks -= 1
		velocity.x = move_toward(velocity.x, 0.0, 300.0 * delta)
		velocity.y = minf(velocity.y + FALL_GRAVITY * delta, MAX_FALL)
		move_and_slide()
		sprite.visible = dead_ticks % 8 < 5
		if dead_ticks == 0:
			position = spawn
			velocity = Vector2.ZERO
			sprite.visible = true
			sprite.modulate = Color.WHITE
			was_on_floor = true
			buffer = 0
		return

	if dir != 0.0:
		facing = signf(dir)
	cooldown = maxi(cooldown - 1, 0)
	coyote = COYOTE_TICKS if is_on_floor() else maxi(coyote - 1, 0)

	if dash and cooldown == 0:
		dash_ticks = DASH_TICKS
		cooldown = DASH_COOLDOWN
		Sfx.play("dash")
	if dash_ticks > 0:
		dash_ticks -= 1
		velocity = Vector2(facing * DASH_SPEED, 0.0)
		if dash_ticks % 3 == 0:
			_ghost()
		if dash_ticks == 0:
			velocity.x = facing * SPEED
	else:
		var rate := AIR_ACCEL
		if is_on_floor():
			rate = ACCEL if dir != 0.0 else FRICTION
		velocity.x = move_toward(velocity.x, dir * SPEED, rate * delta)
		velocity.y = minf(velocity.y + (GRAVITY if velocity.y < 0.0 else FALL_GRAVITY) * delta, MAX_FALL)
		if buffer > 0 and coyote > 0:
			velocity.y = JUMP_VELOCITY
			buffer = 0
			coyote = 0
			Sfx.play("jump")
			_squash(Vector2(0.75, 1.25))
			dust.restart()
		elif not holding_jump and velocity.y < JUMP_CUT:
			velocity.y = JUMP_CUT
	buffer = maxi(buffer - 1, 0)
	move_and_slide()

	var on_floor := is_on_floor()
	if on_floor and not was_on_floor:
		Sfx.play("land")
		_squash(Vector2(1.3, 0.75))
		dust.restart()
	was_on_floor = on_floor

	sprite.flip_h = facing < 0.0
	if not on_floor:
		sprite.play("jump")
	elif absf(velocity.x) > 10.0:
		sprite.play("run")
	else:
		sprite.play("idle")


func hurt() -> void:
	if dead_ticks > 0:
		return
	dead_ticks = RESPAWN_TICKS
	dash_ticks = 0
	velocity = Vector2(-facing * 90.0, -220.0)
	sprite.modulate = Color(1, 0.35, 0.35)
	Sfx.play("hurt")


func _squash(s: Vector2) -> void:
	create_tween().tween_property(sprite, "scale", Vector2.ONE, 0.18).from(s)


func _ghost() -> void:
	var g := Sprite2D.new()
	g.texture = sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame)
	g.flip_h = sprite.flip_h
	g.offset = sprite.offset
	g.global_position = global_position
	g.modulate = Color(0.55, 0.9, 1.0, 0.7)
	get_parent().add_child(g)
	var t := g.create_tween()
	t.tween_property(g, "modulate:a", 0.0, 0.25)
	t.tween_callback(g.queue_free)
