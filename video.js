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


// Global bodypix net and segment output
let net = null;
let segment = null;


/* Config Classes */
class OptionsCycle {
  constructor(values, startingoption=0) {
      // Inputs can be an array of values, or an array of key:value pairs stored as an Array of Arrays.length==2
      if (Array.isArray(values) && values[0].length == 2) {
        this.values = new Map(values);
      } else {
        // If the input is an array of strings or numbers, create the map object with key==value
        if (Array.isArray(values) && (typeof(values[0]) == 'string' || typeof(values[0]) == 'number')) {
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
    if (this.selected_value > this.keys.length-1) { this.selected_value = 0 }
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
    ['Transparent', [0,0,0,255]],
    ['Video', 1],
    ['Green', [0,255,0,255]],
    ['Blue', [0,0,255,255]]  
  ]);


let bodypix_config = new OptionsCycle([
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
let tensorflow_backends = new OptionsCycle(['webgl','wasm','cpu'])
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
  make_option_value('Multiplier', bodypix_config.get().multipliers, start_bodypix)
  make_option_value('Stride', bodypix_config.get().strides, start_bodypix)
  make_option_value('quantBytes', bodypix_config.get().quantBytes, start_bodypix)
  make_option_value('Internal Resolution', bodypix_detection_resolution, null)
  make_option_value('Tensorflow Backend', tensorflow_backends, () => { tf.setBackend(tensorflow_backends.get()) })
}

// Called each time a frame is available on the incoming webcam video
let lastvideoframetime = 0
const statsoverlay_video_fps = document.querySelector('#statsoverlay-video-fps')
let lastvideoframerendered = 0;

async function renderVideo(now, metadata) {
    lastvideoframerendered = metadata.presentedFrames;

    renderedcontext.globalCompositeOperation = 'normal'
    renderedcontext.drawImage(videoElement,0,0)

    if (background.selected() != 'Video') {
      if (background.selected() == 'Transparent') {
        renderedcontext.globalCompositeOperation = 'xor';
      }
      renderedcontext.drawImage(maskcanvas,0,0)      
    }

    // Make sure this function is called on next available frame
    callbackid = videoElement.requestVideoFrameCallback(renderVideo)
    
    //FPS calc
    frameend = performance.now()
    statsoverlay_video_fps.innerHTML = (1000 / (frameend-lastvideoframetime)).toFixed(0)
    lastvideoframetime = frameend
}

// Use bodypix to take the incoming webcam data and run the segmentation
let lastsegmentframetime = 0
const statsoverlay_segementation_fps = document.querySelector('#statsoverlay-segmentation-fps')

async function createMask(now, metadata) {
  // If bodypix is loaded
  if (videoElement && net && background.get() != 1) {
    segment = await net.segmentPerson(videoElement, {internalResolution: bodypix_detection_resolution.get()});

    // Get video frame data
    frame = new ImageData(videoElement.width,videoElement.height);

    segmentwidth = videoElement.width/4
    videowidth = videoElement.width
    // Loop through all segment data and set pixel values based on the value
    let edges = []
    for (var i=0; i < segment.data.length; i++) {
      f = i*4
      // If segment data is 1, it's part of the person
      if (segment.data[i] == 1) {
        frame.data[f] = 0
        frame.data[f+1] = 0
        frame.data[f+2] = 0
        frame.data[f+3] = 0
      } else {
        frame.data[f] = background.get()[0]
        frame.data[f+1] = background.get()[1]
        frame.data[f+2] = background.get()[2]
        frame.data[f+3] = background.get()[3]
      }

      if ((segment.data[i] == 1 && segment.data[i+1] == 0) || 
          (segment.data[i] == 1 && segment.data[i-1] == 0) ||
          (segment.data[i] == 1 && segment.data[i-segmentwidth] == 0) ||
          (segment.data[i] == 1 && segment.data[i+segmentwidth] == 0)) {
        edges.push(f)
      }
    }

    maskcontext.putImageData(frame,0,0)
  }
  // Set up callback for next available frame
  callbackid = videoElement.requestVideoFrameCallback(createMask);

  // FPS calc
  frameend = performance.now()
  statsoverlay_segementation_fps.innerHTML = (1000 / (frameend-lastsegmentframetime)).toFixed(0)
  lastsegmentframetime = frameend
}

function find_video_devices() {
  if (!cameraselection) {
    navigator.mediaDevices.enumerateDevices().then(
      function(devices) {
        videodevices = [];
        devices.forEach(
          function(device) {
            if (device.kind == 'videoinput') {
              let label = device.label != '' ? device.label : device.kind;
              videodevices.push([device.label, device.deviceId]);
            }
          }
        )
        cameraselection = new OptionsCycle(videodevices);
        display_config();
      }
    )
    start_webcam();
  }
}


/* 
This is a workaround for requestVideoFrameCallback, when the camera source is changed the callback never fires again.
Here we add a new element for each change of video source to make sure that requestVideoFrameCallback works.
*/
async function create_videoelement() {
  // Stop and remove the old video element
  if (videoElement) {
    if (videoElement.srcObject) {
      videoElement.srcObject.getTracks().forEach( track => {
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
    selectedcamera = { deviceId: cameraselection.get(), width: videoElement.width, height: videoElement.height}
  } else {
    selectedcamera = { facingMode: 'user', width: videoElement.width, height: videoElement.height}
  }

  // Add the selected webcam stream to the videoElement
  await navigator.mediaDevices.getUserMedia({video: selectedcamera, audio: false})
    .then(stream => {
      videoElement.srcObject = stream;
      videoElement.play();
    })
    .catch(err => {
      console.log('Following error occured:', err);
      // Retry...
      start_webcam();
    });

  // Find video devices now that we have permissions to find them, will populate cameraselection
  find_video_devices();
}


// Start the webcam on videoElement
async function start_webcam() {
  // Disable bodypix
  net = null;

  // Create new video element.
  // There is something stale left in the element that prevents callbacks from working otherwise.
  create_videoelement();

  // Find new element
  videoElement = document.querySelector('video');
  // Start camera in new element
  start_camera();
  start_bodypix();

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
    net = null; // Disable bodypix, if callbacks fire then they won't process anything.
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
    if (lastvideoframerendered+10 < videoElement.webkitDecodedFrameCount) {
      console.log('failing on callbacks here... retrying');
      start_webcam();
    }
  });
}


// Load bodypix
function start_bodypix() {
  net = null;
  // We can reload this at execution time to change options?
  // https://github.com/tensorflow/tfjs-models/blob/master/body-pix/README.md
  bodyPix.load({
    architecture: bodypix_config.selected(),
    multiplier: bodypix_config.get().multipliers.get(),
    stride: bodypix_config.get().strides.get(),
    quantBytes: bodypix_config.get().quantBytes.get()
  }).then(function (net2) { net = net2; });
  display_config();
}