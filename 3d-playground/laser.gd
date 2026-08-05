extends Area2D

@export var speed = 500

func _ready() -> void:
	var tween = create_tween()
	tween.tween_property($LaserImage, 'scale', Vector2(.25,.25), 0.6).from(Vector2(0,0))

func _process(delta: float) -> void:
	position.y -= speed * delta
