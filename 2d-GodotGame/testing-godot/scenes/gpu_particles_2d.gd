# scalable_particles.gd
extends GPUParticles2D
class_name ScalableParticles2D

var _base_scale_min: float
var _base_scale_max: float

func _ready() -> void:
	var mat := process_material as ParticleProcessMaterial
	if mat:
		_base_scale_min = mat.scale_min
		_base_scale_max = mat.scale_max

func _process(_delta: float) -> void:
	var mat := process_material as ParticleProcessMaterial
	if mat == null or get_parent() == null:
		return
	var s: float = get_parent().scale.x
	mat.scale_min = _base_scale_min * s
	mat.scale_max = _base_scale_max * s
