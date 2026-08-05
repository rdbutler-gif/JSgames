extends Control

var level_scene: PackedScene = load("res://level.tscn")

func _ready() -> void:
	$CenterContainer/VBoxContainer/Label2.text = $CenterContainer/VBoxContainer/Label2.text + str(Global.score)

	
func _input(event: InputEvent) -> void:
	if event.is_action_pressed('shoot'):
		get_tree().change_scene_to_packed(level_scene)
