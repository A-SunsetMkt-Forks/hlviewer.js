import * as THREE from 'three'
import { Vector2 as Vec2 } from 'three'
import { Vector3 as Vec3 } from 'three'
import { Face3 as Face3 } from 'three'
import { Mesh } from 'three'

function resizeTexture(pixels, width, height, newWidth, newHeight) {
    let canvas = document.createElement('canvas')
    let ctx = canvas.getContext('2d')
    canvas.width = width
    canvas.height = height

    let nc = document.createElement('canvas')
    let nctx = nc.getContext('2d')
    nc.width = newWidth
    nc.height = newHeight

    let cid = ctx.createImageData(width, height)
    for (let i = 0, size = width * height * 4; i < size; i += 4) {
        cid.data[i] = pixels[i]
        cid.data[i + 1] = pixels[i + 1]
        cid.data[i + 2] = pixels[i + 2]
        cid.data[i + 3] = pixels[i + 3]
    }
    ctx.putImageData(cid, 0, 0)

    nctx.drawImage(canvas, 0, 0, newWidth, newHeight)

    return new Uint8Array(nctx.getImageData(0, 0, newWidth, newHeight).data)
}

const isPowerOfTwo = (n) => ((n & (n - 1)) === 0)

function nextPowerOfTwo(n) {
    --n;
    for (let i = 1; i < 32; i <<= 1) {
        n = n | n >> i;
    }
    return n + 1;
}

function createTexture(data, renderer) {
    let pixels = data.mipmaps[0]
    let w = data.width
    let h = data.height

    if (!isPowerOfTwo(w) || !isPowerOfTwo(h)) {
        let nw = nextPowerOfTwo(w)
        let nh = nextPowerOfTwo(h)
        pixels = resizeTexture(pixels, w, h, nw, nh)
        w = nw
        h = nh
    }
    
    let texture = new THREE.DataTexture(pixels, w, h, THREE.RGBAFormat)
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipMapLinearFilter
    texture.anisotropy = renderer.getMaxAnisotropy()
    texture.generateMipmaps = true

    return texture
}

function createMissingTexture() {
    let pixels = new Uint8Array([255, 255, 255, 255,
                                 255, 128,   0, 255,
                                 255, 128,   0, 255,
                                 255, 255, 255, 255])
    let texture = new THREE.DataTexture(pixels, 2, 2, THREE.RGBAFormat)
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    return texture
}

function createMaterials(map, renderer) {
    const INVISIBLE_TEXTURES = [
        'aaatrigger', 'clip', 'null', 'hint', 'nodraw',
        'invisible', 'skip', 'trigger', 'sky', 'fog'
    ]

    return map.textures.map(data => {
        let texture
        if (data.mipmaps.length > 0) {
            texture = createTexture(data, renderer)
        } else {
            texture = createMissingTexture()
        }

        texture.name = data.name
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.y = -1;
        texture.needsUpdate = true;

        return new THREE.MeshLambertMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.95,
            visible: !INVISIBLE_TEXTURES.includes(data.name.toLowerCase())
        })
    })
}

function createMeshes(map, materials) {
    let material = new THREE.MultiMaterial(materials)

    return map.models
        .map(model => {
            let geometry = new THREE.Geometry()

            geometry.vertices = model.vertices
                .map(vertex => new Vec3(vertex[0], vertex[1], vertex[2]))

            geometry.faces = model.faces
                .map((face, i) => {
                    let f = new Face3(face[0], face[1], face[2])
                    f.materialIndex = model.textureIndices[i]
                    return f
                })
            geometry.faceVertexUvs[0] = model.uv
                .map(uv => [
                    new Vec2(uv[0][0], uv[0][1]  * -1),
                    new Vec2(uv[1][0], uv[1][1]  * -1),
                    new Vec2(uv[2][0], uv[2][1]  * -1)
                ])

            return new Mesh(geometry, material.clone())
        })
        .map((mesh, i) => {
            let entity = map.entities.find(e => e.model === i)
            if (entity && entity.rendermode) {
                if (typeof entity.renderamt === 'number'
                    && entity.renderamt < 255) {
                    mesh.material.materials.forEach(m => {
                        mesh.renderOrder = 1
                        m.depthWrite = false
                        m.alphaTest = 0.05
                        m.opacity = entity.renderamt / 255
                    })
                }

                if (entity.rendermode === 5) {
                    mesh.material.materials.forEach(m => {
                        m.blending = THREE.AdditiveBlending
                        m.depthWrite = false
                        m.opacity = 0.9
                    })
                }
            }

            return mesh
        })
}

export default class WorldScene {
    constructor(renderer) {
        this.renderer = renderer
        let basicLight = new THREE.AmbientLight(0xdddddd)
        this.scene = new THREE.Scene()
        this.scene.add(basicLight)
    }

    changeMap(map) {
        this.scene.children
            .filter(child => child instanceof THREE.Mesh)
            .forEach(mesh => {
                mesh.geometry.dispose()
                mesh.material.materials.forEach(material => {
                    material.map.dispose()
                    material.dispose()
                })

                this.scene.remove(mesh)
            })

        let materials = createMaterials(map, this.renderer)
        let meshes = createMeshes(map, materials)
        meshes.forEach(m => this.scene.add(m))
    }

    draw(camera) {
        this.renderer.render(this.scene, camera)
    }
}