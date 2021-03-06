var matchFBO     = require('../../lib/match-fbo')
var mouse        = require('mouse-position')()
var triangle     = require('a-big-triangle')
var throttle     = require('frame-debounce')
var fit          = require('canvas-fit')
var getContext   = require('gl-context')
var compare      = require('gl-compare')
var ndarray      = require('ndarray')
var createShader = require('glslify')
var createFBO    = require('gl-fbo')
var fs           = require('fs')

var container  = document.getElementById('container')
var canvas     = container.appendChild(document.createElement('canvas'))
var readme     = fs.readFileSync(__dirname + '/README.md', 'utf8')
var gl         = getContext(canvas, render)
var comparison = compare(gl
  , createLoop('actual')
  , createLoop('expected')
)

comparison.mode = 'slide'
comparison.amount = 0.5

require('../common')({
    description: readme
  , compare: comparison
  , canvas: canvas
  , test: matchFBO(comparison, 0.99)
  , dirname: process.env.dirname
})


window.addEventListener('resize', fit(canvas), false)

var stateSize  = 512
var tickCount  = 0
var numBuffers = 3

var renderShader = createShader({
    frag: './shaders/render.glsl'
  , vert: './shaders/pass-thru.glsl'
})(gl)

var pointShader = createShader({
    frag: './shaders/point-fragment.glsl'
  , vert: './shaders/point-vertex.glsl'
})(gl)

function createStateBuffers(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = createFBO(gl, [stateSize, stateSize], {float: false})
  }
  return result
}

var shaders = {
  actual: {
    logic: createShader({
        frag: process.env.file_wave_glsl
      , vert: './shaders/pass-thru.glsl'
    })(gl),
    buffers: createStateBuffers(2)
  },
  expected: {
    logic: createShader({
        frag: './shaders/update.glsl'
      , vert: './shaders/pass-thru.glsl'
    })(gl),
    buffers: createStateBuffers(2)
  }
}

function render() {
  tickCount += 1
  comparison.run()
  comparison.render()
}

function createLoop(key) {
  return function render(fbo) {
    var buffers = shaders[key].buffers
    var shader  = shaders[key].logic

    var front   = buffers[tickCount%buffers.length]
    var back0   = buffers[(tickCount+buffers.length-1)%buffers.length]
    var back1   = buffers[(tickCount+buffers.length-2)%buffers.length]
    var shape   = [canvas.height, canvas.width]
    for(var i = 0; i < buffers.length; i++) {
      buffers[i].shape = shape
    }

    //Apply update
    front.bind()

    //Apply transformation
    shader.bind()
    shader.uniforms.stateSize = [ shape[1], shape[0] ]
    shader.uniforms.prevState = [ back0.color[0].bind(0), back1.color[0].bind(1) ]
    shader.uniforms.kdiffuse  = 0.1
    shader.uniforms.kdamping  = 0.0005
    triangle(gl)

    //Draw mouse
    pointShader.bind()
    pointShader.uniforms.coord = [ 2.0*mouse.x/canvas.width-1.0, 1.0-2.0*mouse.y/canvas.height ]
    pointShader.uniforms.color = [1,1,1,1]
    pointShader.uniforms.size = 8.0
    gl.drawArrays(gl.POINTS, 0, 1)


    //Draw to framebuffer
    fbo.shape = [canvas.height, canvas.width]
    fbo.bind()
    renderShader.bind()
    renderShader.uniforms.screenSize = [ canvas.width, canvas.height ]
    renderShader.uniforms.state = front.color[0].bind()
    triangle(gl)
  }
}