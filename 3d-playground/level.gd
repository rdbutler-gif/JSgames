extends Node2D

var meteor_scene: PackedScene = load("res://meteor.tscn")
var laser_scene: PackedScene = load("res://laser.tscn")

var health: int = 3

func _ready() -> void:
	#Set up health ui
	get_tree().call_group('UI', 'set_health', health)
	
	#Stars
	var size := get_viewport().get_visible_rect().size
	var rng = RandomNumberGenerator.new()
	for star in $Stars.get_children():
		#postion
		var random_x = rng.randi_range(0, int(size.x))
		var random_y = rng.randi_range(0,int(size.y))
		star.position = Vector2(random_x, random_y)
	
		#scale
		var random_scale = rng.randf_range(1, 2)
		star.scale = Vector2(random_scale, random_scale)
		
		#animation speed
		star.speed_scale = rng.randf_range(0.6, 1.4)
		
		#rotation
		star.rotation = rng.randf_range(0,99)
		

func _on_meteor_timer_timeout():
	var meteor = meteor_scene.instantiate()
	$Meteors.add_child(meteor)
	#connect the signal
	meteor.connect('collision', _on_meteor_collision)
	
func _on_meteor_collision():
	health -= 1
	$Player.play_collision_sound()
	await get_tree().create_timer(.5).timeout
	get_tree().call_group('UI', 'set_health', health)
	if health <= 0:
		get_tree().call_deferred("change_scene_to_file", "res://game_over.tscn")
	

func _on_player_laser(pos):
	var laser = laser_scene.instantiate()
	$Lasers.add_child(laser)
	laser.position = pos
