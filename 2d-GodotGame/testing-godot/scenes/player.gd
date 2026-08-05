extends Node2D

var zoom_level = Vector2(0.1,0.1)
@export var max_tilt_deg: float = 80.0
@export var tilt_speed: float = 2.0           # radians/sec — how fast it rotates toward target
@export var max_lateral_speed: float = 250.0  # px/sec strafe speed at full 45° tilt
@onready var flames: Node2D = $Flames
var max_tilt_rad: float

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	max_tilt_rad = deg_to_rad(max_tilt_deg)



func _physics_process(delta: float) -> void:
	flames.visible = Input.is_action_pressed("up")
	if scale >= Vector2(.015,.015):
		if Input.is_action_pressed("up"):
			scale -= zoom_level * .015
	if scale <= Vector2(1.5,1.5):
		if Input.is_action_pressed("down"):
			scale += zoom_level * .015
	var target_tilt := 0.0
	if Input.is_action_pressed("left"):
		target_tilt = -max_tilt_rad
	elif Input.is_action_pressed("right"):
		target_tilt = max_tilt_rad

	rotation = move_toward(rotation, target_tilt, tilt_speed * delta)

	# how far into the tilt are we, as a fraction from -1.0 to 1.0
	var tilt_fraction: float = rotation / max_tilt_rad
	

	position.x += tilt_fraction * max_lateral_speed * delta
	position.x = clamp(position.x, 0.0, 1280.0)
