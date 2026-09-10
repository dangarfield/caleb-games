// GLB loading. Resolves with the model plus, for the boy, a clip-name -> action map.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRIVEN_BONES } from './config.js';

const loader = new GLTFLoader();
// The packed level is meshopt-compressed with quantised attributes (see
// tools/pack-level.mjs): 23.5MB down to 1.5MB. Harmless for an uncompressed
// file, so it is always registered.
loader.setMeshoptDecoder(MeshoptDecoder);

// Asset URLs are resolved against THIS MODULE, not the page, so they work
// whether the game is served as /games/paperboy, /games/paperboy/ or
// /games/paperboy/paperboy-research.
const asset = name => new URL(`../${name}`, import.meta.url).href;

function shadowed(root, { casts = true } = {}) {
    root.traverse(c => { if (c.isMesh) { c.castShadow = casts; c.receiveShadow = true; } });
    return root;
}

export function loadBoy(url = asset('paperboy.glb')) {
    return new Promise((res, rej) => loader.load(url, gltf => {
        const model = shadowed(gltf.scene);
        const mixer = new THREE.AnimationMixer(model);
        // Drop the crank/wheel tracks — they don't close their loop (~8deg of
        // snap every cycle) and ignore ground speed. player.js drives those bones.
        const driven = new RegExp('^(' + DRIVEN_BONES.join('|') + ')\\.');
        for (const clip of gltf.animations) clip.tracks = clip.tracks.filter(t => !driven.test(t.name));

        const actions = {};
        for (const clip of gltf.animations) {
            actions[clip.name] = mixer.clipAction(clip);
            console.log(`Animation: ${clip.name} (${clip.duration.toFixed(2)}s)`);
        }
        res({ model, mixer, actions });
    }, undefined, rej));
}

// The packed level first, the original as a fallback if it is not there yet.
export function loadLevel(url = asset('paper-level.opt.glb'), fallback = asset('paper-level.glb')) {
    return loadOneLevel(url).catch(err => {
        if (!fallback) throw err;
        console.warn(`Could not load ${url.split('/').pop()} (${err.message || err}); using the uncompressed level`);
        return loadOneLevel(fallback);
    });
}

function loadOneLevel(url) {
    return new Promise((res, rej) => loader.load(url, gltf => {
        // Nothing in the level casts a shadow until collision.js turns it on for
        // the roles worth casting: ~1100 of these meshes are flat road, painted
        // lines and text that only ever cost a second draw.
        const model = shadowed(gltf.scene, { casts: false });
        let panorama = null;
        model.traverse(c => {
            if (!panorama && c.name.toLowerCase().includes('warpedpanorama')) panorama = c;
        });
        res({ model, panorama });
    }, undefined, rej));
}
