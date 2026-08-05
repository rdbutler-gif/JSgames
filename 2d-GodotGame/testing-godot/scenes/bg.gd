extends Sprite2D

var zoom_level = Vector2(0.1,0.1)

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	pass # Replace with function body.


# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	if scale <= Vector2(3,3):
		scale += zoom_level * .1 * delta
