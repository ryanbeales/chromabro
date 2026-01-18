// Incoming webcam video, created by create_videoelement()
let videoElement = null;

// Canvas to render mask to
const maskcanvas = document.querySelector('#maskcanvas');
const maskcontext = maskcanvas.getContext('2d');


// Canvas to display and output the result to screen too
const renderedcanvas = document.querySelector('#renderedcanvas');
const renderedcontext = renderedcanvas.getContext('2d');

// Status overlay
const statsoverlay = document.querySelector('#statsoverlay_background');


// Global bodypix segmenter and segment output
let segmenter = null;
let segment = null;

// Edge and mask controls
let edgeSmoothness = 2;
let maskOpacity = 1.0;


/* Config Classes */
class OptionsCycle {
  constructor(values, startingoption = 0) {
    // Inputs can be an array of values, or an array of key:value pairs stored as an Array of Arrays.length==2
    if (Array.isArray(values) && values[0].length == 2) {
      this.values = new Map(values);
    } else {
      // If the input is an array of strings or numbers, create the map object with key==value
      if (Array.isArray(values) && (typeof (values[0]) == 'string' || typeof (values[0]) == 'number')) {
        this.values = new Map();
        values.forEach(element => this.values.set(element, element))
      } else {
        throw "OptionsCycle can't take the provided values"
      }
    }
    this.selected_value = startingoption;
    this.keys = Array.from(this.values.keys())
  }

  next() {
    this.selected_value += 1
    if (this.selected_value > this.keys.length - 1) { this.selected_value = 0 }
  }
  selected() { return this.keys[this.selected_value] }
  get() { return this.values.get(this.selected()) }
  set(key) { this.selected_value = this.keys.findIndex(value => value == key) }
  options() { return this.keys }
}


class BodyPixConfig {
  constructor(multipliers, quantBytes, strides) {
    this.multipliers = new OptionsCycle(multipliers);
    this.strides = new OptionsCycle(strides);
    this.quantBytes = new OptionsCycle(quantBytes);
  }
}

/* Config data */
let background = new OptionsCycle([
  ['Transparent', [0, 0, 0, 255]],
  ['Video', 1],
  ['Green', [0, 255, 0, 255]],
  ['Blue', [0, 0, 255, 255]]
]);


let bodypix_config = new OptionsCycle([
  ['MediaPipe SelfieSegmentation', new OptionsCycle([
    // Config specifically for MediaPipe
    // modelType: 'general' is good for full body, 'landscape' is lighter
    ['modelType', new OptionsCycle(['general', 'landscape'])]
  ])],
  ['MobileNetV1', new BodyPixConfig(
    multipliers = [0.5, 0.75, 1],
    quantBytes = [4, 2, 1],
    stride = [16, 8]
  )],
  ['ResNet50', new BodyPixConfig(
    multipliers = [1],
    quantBytes = [1, 2, 4],
    stride = [16, 32]
  )],
]);

let bodypix_detection_resolution = new OptionsCycle(['low', 'medium', 'high', 'full'], 1);
let tensorflow_backends = new OptionsCycle(['webgl', 'wasm', 'cpu'])
let cameraselection = null;

async function display_config() {
  let config = document.querySelector('#bodypix-config');

  while (config.hasChildNodes()) {
    config.removeChild(config.lastChild)
  }

  let template = document.querySelector('#bodypix-config-option');

  function make_option_value(name, configelement, reloadfunction) {
    let option = template.content.cloneNode(true);

    // Option name
    option.querySelector('.option-name').innerHTML = name


    if (configelement == null) return;
    // Option values
    option_values = option.querySelector('.option-values')

    configelement.options().forEach(key => {
      o = document.createElement('option')
      o.innerHTML = key
      o.value = key
      if (configelement.selected() == key) {
        o.selected = true
      };
      //option_values.onchange = console.log(name);
      option_values.configreference = configelement
      option_values.reloadfunction = reloadfunction
      option_values.addEventListener('change', (event) => {
        event.target.configreference.set(event.target.value);
        if (event.target.reloadfunction) {
          event.target.reloadfunction()
        }

      })
      option_values.appendChild(o);
    })

    config.appendChild(option)
  }

  make_option_value('Camera', cameraselection, start_webcam);
  make_option_value('Background', background, null)
  make_option_value('Model', bodypix_config, start_bodypix)

  const currentConfig = bodypix_config.get();

  // If BodyPix Config
  if (currentConfig instanceof BodyPixConfig) {
    make_option_value('Multiplier', currentConfig.multipliers, start_bodypix)
    make_option_value('Stride', currentConfig.strides, start_bodypix)
    make_option_value('quantBytes', currentConfig.quantBytes, start_bodypix)
    make_option_value('Internal Resolution', bodypix_detection_resolution, null)
    make_option_value('Tensorflow Backend', tensorflow_backends, () => { tf.setBackend(tensorflow_backends.get()) })
  }
  // If MediaPipe Config (It is just an OptionsCycle wrapping the params)
  else if (currentConfig instanceof OptionsCycle) {
    make_option_value('Model Type', currentConfig.values.get('modelType'), start_bodypix)
    // MediaPipe relies on its own backend (wasm/webgl usually internal) or tfjs backend. 
    // Keeping tensorflow backend option is safe.
    make_option_value('Tensorflow Backend', tensorflow_backends, () => { tf.setBackend(tensorflow_backends.get()) })
  }
}

const statsoverlay_video_fps = document.querySelector('#statsoverlay-video-fps')
let lastvideoframetime = 0;
let lastvideoframerendered = 0;

function renderVideo(now, metadata) {
  renderedcontext.globalCompositeOperation = 'normal'
  renderedcontext.drawImage(videoElement, 0, 0)

  if (background.selected() != 'Video') {
    if (background.selected() == 'Transparent') {
      renderedcontext.globalCompositeOperation = 'xor';
    }
    renderedcontext.drawImage(maskcanvas, 0, 0)
  }

  // Make sure this function is called on next available frame
  if (lastvideoframetime != metadata.presentationTime) {
    videoElement.requestVideoFrameCallback(renderVideo);
  }

  //FPS calc
  statsoverlay_video_fps.innerHTML = (1000 / (metadata.presentationTime - lastvideoframetime)).toFixed(0)
  lastvideoframetime = metadata.presentationTime

  lastvideoframerendered = metadata.presentedFrames
}

// Use bodypix to take the incoming webcam data and run the segmentation
let lastsegmentframetime = 0
const statsoverlay_segementation_fps = document.querySelector('#statsoverlay-segmentation-fps')

async function createMask(now, metadata) {
  // If bodypix is loaded
  if (videoElement && segmenter && background.get() != 1) {
    let segmentationConfig = {
      flipHorizontal: false,
      multiSegmentation: false,
      segmentBodyParts: false, // We just want person vs background
      segmentationThreshold: 0.7
    };

    // Check if segmentation is a promise (processing) or verify flow
    // New API segmentPeople returns a promise
    const people = await segmenter.segmentPeople(videoElement, segmentationConfig);


    // Get video frame data
    frame = new ImageData(videoElement.width, videoElement.height);

    segmentwidth = videoElement.width / 4
    videowidth = videoElement.width
    // Loop through all segment data and set pixel values based on the value
    let edges = []

    if (people.length > 0) {
      // Get the mask image data. 
      // The mask is an ImageData object.
      // The red channel contains the body part (0 for background, 1 for person if segmentBodyParts is false?)
      // Actually with segmentBodyParts: false, it seems to return binary mask where 1 is person.
      // Let's rely on Red channel > 0.

      const mask = await people[0].mask.toImageData();

      for (var i = 0; i < mask.data.length; i += 4) {
        // i is pixel index in bytes (R,G,B,A)
        // mask.data[i] is Red channel
        // mask.data[i+3] is Alpha (probability)

        let isPerson = mask.data[i] > 0 || mask.data[i + 3] > 0;

        // Optimizing the loop:
        let f = i;

        // If segment data is person
        if (isPerson) {
          frame.data[f] = 0
          frame.data[f + 1] = 0
          frame.data[f + 2] = 0
          frame.data[f + 3] = 0
        } else {
          frame.data[f] = background.get()[0]
          frame.data[f + 1] = background.get()[1]
          frame.data[f + 2] = background.get()[2]
          frame.data[f + 3] = Math.round(background.get()[3] * maskOpacity)
        }
      }
    }

    // Apply edge smoothing (blur) if needed
    if (edgeSmoothness > 0) {
      maskcontext.filter = `blur(${edgeSmoothness}px)`;
    } else {
      maskcontext.filter = 'none';
    }

    maskcontext.putImageData(frame, 0, 0)

    // After putImageData, we might need to draw the canvas onto itself to apply the filter
    // because putImageData bypasses context filter/composition settings.
    if (edgeSmoothness > 0) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = maskcanvas.width;
      tempCanvas.height = maskcanvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(frame, 0, 0);

      maskcontext.clearRect(0, 0, maskcanvas.width, maskcanvas.height);
      maskcontext.drawImage(tempCanvas, 0, 0);
    }
  }
  // Set up callback for next available frame
  if (lastsegmentframetime != metadata.presentationTime) {
    videoElement.requestVideoFrameCallback(createMask);
  }
  // FPS calc
  statsoverlay_segementation_fps.innerHTML = (1000 / (metadata.presentationTime - lastsegmentframetime)).toFixed(0)
  lastsegmentframetime = metadata.presentationTime
}

function find_video_devices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    console.log("enumerateDevices not supported.");
    return;
  }

  if (!cameraselection) {
    navigator.mediaDevices.enumerateDevices().then(
      function (devices) {
        videodevices = [];
        devices.forEach(
          function (device) {
            if (device.kind == 'videoinput') {
              let label = device.label != '' ? device.label : device.kind;
              videodevices.push([device.label, device.deviceId]);
            }
          }
        )
        cameraselection = new OptionsCycle(videodevices);
        display_config();
      }
    ).catch(err => {
      console.error("Error enumerating devices:", err);
    });
  }
}

// Check for secure context on load
if (!isSecureContext) {
  showError("Warning: You are not in a Secure Context (HTTPS or localhost). Camera access will likely fail.");
}


/* 
This is a workaround for requestVideoFrameCallback, when the camera source is changed the callback never fires again.
Here we add a new element for each change of video source to make sure that requestVideoFrameCallback works.
*/
function create_videoelement() {
  // Stop and remove the old video element
  if (videoElement) {
    if (videoElement.srcObject) {
      videoElement.srcObject.getTracks().forEach(track => {
        track.stop();
      });
    }
    videoElement.remove();
  }

  // Create a new video element
  body = document.querySelector('#body');
  new_videoElement = document.createElement('video');
  new_videoElement.id = '#video'
  new_videoElement.width = 480.
  new_videoElement.height = 320;
  new_videoElement.muted = true;
  new_videoElement.autoplay = true;
  new_videoElement.playsinline = true;
  new_videoElement.hidden = true;

  // Append element back to body
  body.appendChild(new_videoElement);
}

async function start_camera() {
  // If the camera selection is populated by find_video_devices then use the selected camera
  if (cameraselection) {
    selectedcamera = { deviceId: cameraselection.get(), width: videoElement.width, height: videoElement.height }
  } else {
    selectedcamera = { facingMode: 'user', width: videoElement.width, height: videoElement.height }
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError("Browser API 'navigator.mediaDevices.getUserMedia' is not available. Are you in a Secure Context?");
    return;
  }

  // Add the selected webcam stream to the videoElement
  await navigator.mediaDevices.getUserMedia({ video: selectedcamera, audio: false })
    .then(stream => {
      videoElement.srcObject = stream;
      videoElement.play();
    })
    .catch(err => {
      showError("Error starting camera: " + err.name + "\n" + err.message + "\n\nNote: Camera access requires a Secure Context (HTTPS or localhost).");
    });

  // Find video devices now that we have permissions to find them, will populate cameraselection
  find_video_devices();
}


// Start the webcam on videoElement
async function start_webcam() {
  // Disable bodypix
  segmenter = null;

  // Create new video element.
  // There is something stale left in the element that prevents callbacks from working otherwise.
  create_videoelement();

  // Find new element
  videoElement = document.querySelector('video');
  // Start camera in new element
  start_camera();
  await start_bodypix();

  // Called when frame is ready
  videoElement.onloadeddata = () => {
    maskcanvas.width = videoElement.width;
    maskcanvas.height = videoElement.height;
    renderedcanvas.width = videoElement.width
    renderedcanvas.height = videoElement.height;
  };

  // After the playing event, the last thing before it's actually started playing, register the callbacks
  videoElement.addEventListener('canplaythrough', event => {
    videoElement.requestVideoFrameCallback(renderVideo);
    videoElement.requestVideoFrameCallback(createMask);
  });

  videoElement.addEventListener('emptied', event => {
    segmenter = null; // Disable bodypix, if callbacks fire then they won't process anything.
  });


  /*
     For some reason callbacks fail to work after the video source is switched.
     There is an event or activity that is triggered that we don't see which cancels the callbacks.

     Here on every video progress update (Every second?) we check what frame we rendered last;
     If it's more than 10 frames away from the current frame count then the callbacks aren't working.
     To fix the problem we just recreate everything and it starts to work again. ¯\_(ツ)_/¯

     I don't know why. I wish I knew because that would have saved 4 days of stress...

    This is the key to making a switching camera source and a working requestVideoFrameCallback.
  */
  videoElement.addEventListener('progress', event => {
    // Wait for 10 frames, if we're not processing anything recreate everything and of course it starts to work...
    if (lastvideoframerendered + 10 < videoElement.webkitDecodedFrameCount) {
      console.log('failing on callbacks here... retrying');
      start_webcam();
    }
  });
}


// Load bodypix

// Load bodypix or mediapipe
let is_loading_model = false;
async function start_bodypix() {
  if (is_loading_model) return;
  is_loading_model = true;

  const modelSelection = bodypix_config.selected();

  // Clean up if re-initializing or switching models
  if (segmenter) {
    try {
      segmenter.dispose();
    } catch (e) {
      console.warn("Error disposing segmenter:", e);
    }
  }
  segmenter = null;

  try {
    if (modelSelection.includes('SelfieSegmentation')) {
      const model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
      // MediaPipe Config
      const segmenterConfig = {
        runtime: 'mediapipe', // or 'tfjs' but 'mediapipe' is generally faster for this model
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation',
        modelType: bodypix_config.get().values.get('modelType').get()
      }

      const net2 = await bodySegmentation.createSegmenter(model, segmenterConfig);
      segmenter = net2;
      console.log("MediaPipe Segmenter Loaded");

    } else {
      // BodyPix Logic
      const model = bodySegmentation.SupportedModels.BodyPix;
      const segmenterConfig = {
        architecture: modelSelection,
        multiplier: bodypix_config.get().multipliers.get(),
        outputStride: bodypix_config.get().strides.get(),
        quantBytes: bodypix_config.get().quantBytes.get()
      };

      const net2 = await bodySegmentation.createSegmenter(model, segmenterConfig);
      segmenter = net2;
      console.log("BodyPix Segmenter Loaded");
    }
  } catch (err) {
    showError("Failed to load model: " + err.message);
  } finally {
    is_loading_model = false;
    display_config();
  }
}

// Helper to show errors on screen since alerts might be blocked
function showError(msg) {
  console.error(msg);
  let errorBox = document.querySelector('#error-box');
  if (!errorBox) {
    errorBox = document.createElement('div');
    errorBox.id = 'error-box';
    errorBox.style.cssText = 'position:fixed; top:10px; left:10px; right:10px; background:rgba(255,0,0,0.9); color:white; padding:15px; border-radius:5px; z-index:9999; font-family:sans-serif; font-size:16px; box-shadow:0 4px 6px rgba(0,0,0,0.1);';
    document.body.appendChild(errorBox);
  }
  errorBox.innerHTML += `<p style="margin:5px 0; border-bottom:1px solid rgba(255,255,255,0.3); padding-bottom:5px;">${msg}</p>`;
  errorBox.hidden = false;
}

// Wire up sliders
document.getElementById('edge-smoothness').addEventListener('input', (e) => {
  edgeSmoothness = parseInt(e.target.value);
  document.getElementById('smoothness-value').innerText = edgeSmoothness;
});

document.getElementById('mask-opacity').addEventListener('input', (e) => {
  maskOpacity = parseFloat(e.target.value);
  document.getElementById('opacity-value').innerText = maskOpacity.toFixed(2);
});