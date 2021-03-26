// Incoming webcam video
const videoElement = document.getElementById('video');

// Canvas to render video to to get image data
const videocanvas = document.getElementById('videocanvas');
const videocontext = videocanvas.getContext('2d');

// Canvas to display and output the result to screen too
const renderedcanvas = document.getElementById('renderedcanvas');
const renderedcontext = renderedcanvas.getContext('2d');

// Status overlay
const statsoverlay = document.getElementById('statsoverlay_background');


// Global bodypix net and segment output
let net = null;
let segment = null;

class OptionsCycle{
  constructor(values, startingoption=0) {
      this.values = values
      this.selected = startingoption
  }

  next() {
    this.selected += 1
    if (this.selected > this.values.length-1) {
      this.selected = 0
    }
  }

  get() {
    return this.values[this.selected]
  }
}

let background = new OptionsCycle([
    [0,0,0,0], // Transparent
    1, // Video
    [0,255,0,255], //Green
    [0,0,255,255] //blue  
  ]);
let multiplier = new OptionsCycle([0.5, 0.75, 1])
let internalresolution = new OptionsCycle([0.5, 0.75, 1, 0.25])

function display_config() {
  document.getElementById('statsoverlay-multiplier').innerHTML = multiplier.get()
  document.getElementById('statsoverlay-internal-resolution').innerHTML = internalresolution.get()
}


// Called each time a frame is available on the incoming webcam video
let lastvideoframetime = 0
const statsoverlay_video_fps = document.getElementById('statsoverlay-video-fps')

function renderVideo(now, metadata) {
    // Draw video to video context
    videocontext.drawImage(videoElement,0,0);

    // If bodypix segment data is available, set the background to transparent
    if (segment) {
      // Get video frame data
      frame = videocontext.getImageData(0,0,videoElement.width, videoElement.height);

      // If background is video just avoid this.
      if (background.get() != 1) { 
        // Loop through all segment data and set pixel values based on the value
        for (var i=0; i < segment.data.length; i++) {
          current = segment.data[i]

          // If segment data is 1, it's part of the person
          if (segment.data[i] == 1) {
            frame.data[i*4+3] = 255
          } else {
            frame.data[i*4] = background.get()[0]
            frame.data[i*4+1] = background.get()[1]
            frame.data[i*4+2] = background.get()[2]
            frame.data[i*4+3] = background.get()[3]
          }
        }
      }
      // Add frame data to canvas
      renderedcontext.putImageData(frame,0,0)
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
const statsoverlay_segementation_fps = document.getElementById('statsoverlay-segmentation-fps')

async function createMask(now, metadata) {
  // If bodypix is loaded
  if (net) {
    segment = await net.segmentPerson(videoElement, {internalResolution: internalresolution.get()});
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
        architecture: 'MobileNetV1',
        multiplier: multiplier.get(),
        stride: 16,
        quantBytes: 4
      }).then(function (net2) { net = net2; })  
}

// Once the window is loaded start the webcam and bodypix
window.onload = () => {
    start_webcam()
    start_bodypix()
}

// When the video has loaded
videoElement.onloadeddata = () => {
  // Set the canvases to the same size as the incoming video
  videocanvas.width = videoElement.width;
  videocanvas.height = videoElement.height;
  renderedcanvas.width = videoElement.width;
  renderedcanvas.height = videoElement.height;

  // Trigger the processing for each incoming frame
  videoElement.requestVideoFrameCallback(renderVideo);
  videoElement.requestVideoFrameCallback(createMask);

  display_config();
}


// Key commands
window.addEventListener("keyup", event => {
  switch(event.key) {
    // Cycle through backgrounds
    case 'b':
      background.next();
      break;
    case 'i':
      internalresolution.next();
      display_config()
      break;
    case 'm':
      multiplier.next();
      start_bodypix();
      display_config()
      break;
    case 's':
      statsoverlay.hidden = !statsoverlay.hidden
      break;
  };
});