/* ============================================================
   Trimmed down from three.js r160's examples/jsm/utils/BufferGeometryUtils.js
   -- GLTFLoader.js only imports one function from that file
   (toTrianglesDrawMode, needed for the rare TRIANGLE_STRIP/TRIANGLE_FAN
   primitive modes; our own models are all plain TRIANGLES so it never
   actually runs in practice, but GLTFLoader imports it unconditionally).
   Vendoring the real ~1400-line utils file for one function pulled in its
   own extra top-level dependencies (computeMikkTSpaceTangents and others)
   for nothing this project uses, so this file keeps only that function
   and the three constants it needs -- same minimal-vendoring approach the
   project already uses elsewhere (see the hand-rolled GLB parser this
   file's sibling GLTFLoader.js is replacing for the player ship).
   Source: three@0.160.0, verified byte-identical to this project's
   vendored js/three.module.js (see handoff.md).
   ============================================================ */
import {
	TriangleFanDrawMode,
	TriangleStripDrawMode,
	TrianglesDrawMode,
} from './three.module.js';

export function toTrianglesDrawMode( geometry, drawMode ) {

	if ( drawMode === TrianglesDrawMode ) {

		console.warn( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.' );
		return geometry;

	}

	if ( drawMode === TriangleFanDrawMode || drawMode === TriangleStripDrawMode ) {

		let index = geometry.getIndex();

		// generate index if not present

		if ( index === null ) {

			const indices = [];

			const position = geometry.getAttribute( 'position' );

			if ( position !== undefined ) {

				for ( let i = 0; i < position.count; i ++ ) {

					indices.push( i );

				}

				geometry.setIndex( indices );
				index = geometry.getIndex();

			} else {

				console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.' );
				return geometry;

			}

		}

		//

		const numberOfTriangles = index.count - 2;
		const newIndices = [];

		if ( drawMode === TriangleFanDrawMode ) {

			// gl.TRIANGLE_FAN

			for ( let i = 1; i <= numberOfTriangles; i ++ ) {

				newIndices.push( index.getX( 0 ) );
				newIndices.push( index.getX( i ) );
				newIndices.push( index.getX( i + 1 ) );

			}

		} else {

			// gl.TRIANGLE_STRIP

			for ( let i = 0; i < numberOfTriangles; i ++ ) {

				if ( i % 2 === 0 ) {

					newIndices.push( index.getX( i ) );
					newIndices.push( index.getX( i + 1 ) );
					newIndices.push( index.getX( i + 2 ) );

				} else {

					newIndices.push( index.getX( i + 2 ) );
					newIndices.push( index.getX( i + 1 ) );
					newIndices.push( index.getX( i ) );

				}

			}

		}

		if ( ( newIndices.length / 3 ) !== numberOfTriangles ) {

			console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.' );

		}

		// build final geometry

		const newGeometry = geometry.clone();
		newGeometry.setIndex( newIndices );
		newGeometry.clearGroups();

		return newGeometry;

	} else {

		console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:', drawMode );
		return geometry;

	}

}
