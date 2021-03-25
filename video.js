const videoElement = document.getElementById('video');
const canvas = document.getElementById('canvas');

const gl = canvas.getContext('webgl', { premultipliedAlpha: false});

const vs = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vs, 'attribute vec2 c; void main(void) { gl_Position=vec4(c, 0.0, 1.0); }');
gl.compileShader(vs);

const fs = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fs, document.getElementById("fragment-shader").innerText);
gl.compileShader(fs);
if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
  console.error(gl.getShaderInfoLog(fs));
}

const prog = gl.createProgram();
gl.attachShader(prog, vs);
gl.attachShader(prog, fs);
gl.linkProgram(prog);
gl.useProgram(prog);

const vb = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vb);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ -1,1,  -1,-1,  1,-1,  1,1 ]), gl.STATIC_DRAW);

const coordLoc = gl.getAttribLocation(prog, 'c');
gl.vertexAttribPointer(coordLoc, 2, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(coordLoc);


const videotexture = gl.TEXTURE0
const masktexture = gl.TEXTURE1


gl.activeTexture(videotexture);
const frame = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, frame);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

gl.activeTexture(masktexture);
const background = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, background);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

const frameTexLoc = gl.getUniformLocation(prog, "frame");
const maskTexLoc = gl.getUniformLocation(prog, "mask");
const texWidthLoc = gl.getUniformLocation(prog, "texWidth");
const texHeightLoc = gl.getUniformLocation(prog, "texHeight");


// Render related...

let net = null 


function renderVideo(now, metadata) {
  canvas.width = videoElement.width
  canvas.height = videoElement.height

  gl.viewport(0, 0, metadata.width, metadata.height);
  gl.activeTexture(videotexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, videoElement);


  gl.uniform1i(frameTexLoc, 0);
  gl.uniform1i(maskTexLoc, 1);
  gl.uniform1f(texWidthLoc, videoElement.width);
  gl.uniform1f(texHeightLoc, videoElement.height);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

  videoElement.requestVideoFrameCallback(renderVideo);
}
videoElement.requestVideoFrameCallback(renderVideo);


async function renderMask(now, metadata) {
  if (net) {
    const personSegmentation = await net.segmentPerson(videoElement);

    gl.activeTexture(masktexture);
    gl.texImage2D(
      gl.TEXTURE_2D,        // target 
      0,                    // level
      gl.ALPHA,             // internalformat
      personSegmentation.width,   // width
      personSegmentation.height,  // height
      0,                    // border, "Must be 0"
      gl.ALPHA,             // format, "must be the same as internalformat"
      gl.UNSIGNED_BYTE,     // type of data below
      personSegmentation.data     // pixels
    );

    videoElement.requestVideoFrameCallback(renderMask)
  }
}
videoElement.requestVideoFrameCallback(renderMask)


function start_webcam() {
  // Find some way to list and allow selection of cameras?
  navigator.mediaDevices.getUserMedia({video: { facingMode: 'user', width: videoElement.width, height: videoElement.height}, audio: false})
    .then(stream => {
      videoElement.srcObject = stream;
      videoElement.play();
    })
    .catch(err => {
      alert(`Following error occured: ${err}`);
    });
}


function start_bodypix() {
      // We can reload this at execution time to change options?
      // https://github.com/tensorflow/tfjs-models/blob/master/body-pix/README.md
      bodyPix.load({
        //architecture: 'ResNet50',
        multiplier: 1,
        stride: 16,
        quantBytes: 4
      }).then(function (net2) { net = net2; })  
}

window.onload = () => {
    start_webcam()
    start_bodypix()
}


// Context Menu
window.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  window.ipcRenderer.send('show-context-menu')
})

window.ipcRenderer.on('context-menu-command', (e, command) => {
  console.log('Hello!')
  console.log(command)
})
