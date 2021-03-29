// Incoming webcam video
const videoElement = document.querySelector('#video');

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
let mask_blur_amount = new OptionsCycle(['none', 'blur(4px)','blur(8px)','blur(16px)'])

function display_config() {
  let config = document.querySelector('#bodypix-config');

  while (config.hasChildNodes()) {
    config.removeChild(config.lastChild)
  }

  let template = document.querySelector('#bodypix-config-option');
  
  function make_option_value(name, configelement, reloadfunction) {
    let option = template.content.cloneNode(true);

    // Option name
    option.querySelector('.option-name').innerHTML = name
  
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

  make_option_value('Background', background, null)
  make_option_value('Model', bodypix_config, start_bodypix)
  make_option_value('Multiplier', bodypix_config.get().multipliers, start_bodypix)
  make_option_value('Stride', bodypix_config.get().strides, start_bodypix)
  make_option_value('quantBytes', bodypix_config.get().quantBytes, start_bodypix)
  make_option_value('Internal Resolution', bodypix_detection_resolution, null)
  make_option_value('Mask effect', mask_blur_amount, null)
}

// Called each time a frame is available on the incoming webcam video
let lastvideoframetime = 0
const statsoverlay_video_fps = document.querySelector('#statsoverlay-video-fps')

function renderVideo(now, metadata) {
    renderedcontext.globalCompositeOperation = 'normal'
    renderedcontext.drawImage(videoElement,0,0)

    if (background.selected() != 'Video') {
      if (background.selected() == 'Transparent') {
        renderedcontext.globalCompositeOperation = 'xor';
      }
      renderedcontext.drawImage(maskcanvas,0,0)      
    }
    // Make sure this function is called on next available frame
    videoElement.requestVideoFrameCallback(renderVideo)

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
  if (net && background.get() != 1) {
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
    
    // Blur works like this, but isn't not quite right..
    if (mask_blur_amount.selected() != 'none') {
      maskcontext.filter = mask_blur_amount.get()
      // Draw canvas to itself to render the blur
      maskcontext.drawImage(maskcanvas,0,0);
    }
  }
  // Set up callback for next available frame
  videoElement.requestVideoFrameCallback(createMask)

  // FPS calc
  frameend = performance.now()
  statsoverlay_segementation_fps.innerHTML = (1000 / (frameend-lastsegmentframetime)).toFixed(0)
  lastsegmentframetime = frameend
}

// Start the webcam on videoElement
function start_webcam() {
  // Find some way to list and allow selection of cameras?
  navigator.mediaDevices.getUserMedia({video: { facingMode: 'user', width: videoElement.width, height: videoElement.height}, audio: false})
    .then(stream => {
      videoElement.srcObject = stream;
      // Don't make this automagic.
      videoElement.play();
    })
    .catch(err => {
      alert(`Following error occured: ${err}`);
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

// Once the window is loaded start the webcam and bodypix
window.onload = () => {
  start_webcam();
  start_bodypix();
}

// When the video has loaded
videoElement.onloadeddata = () => {
  // Set the canvases to the same size as the incoming video
  maskcanvas.width = videoElement.width;
  maskcanvas.height = videoElement.height;
  renderedcanvas.width = videoElement.width;
  renderedcanvas.height = videoElement.height;

  // Trigger the processing for each incoming frame
  videoElement.requestVideoFrameCallback(renderVideo);
  videoElement.requestVideoFrameCallback(createMask);
}


window.addEventListener('dblclick', event => {
  statsoverlay.hidden = !statsoverlay.hidden
})


// Key commands
window.addEventListener("keyup", event => {
  switch(event.key) {
    case 's':
      statsoverlay.hidden = !statsoverlay.hidden
      break;
    case 'q':
      window.close();
      break;
  };
});