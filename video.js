// Incoming webcam video
const videoElement = document.getElementById('video');

// Canvas to render video to to get image data
const videocanvas = document.getElementById('videocanvas');
const videocontext = videocanvas.getContext('2d');

// Canvas to display and output the result to screen too
const renderedcanvas = document.getElementById('renderedcanvas');
const renderedcontext = renderedcanvas.getContext('2d');

// Global bodypix net and segment output
let net = null;
let segment = null;
let background = 0;

// Called each time a frame is available on the incoming webcam video
function renderVideo(now, metadata) {
    // Draw video to video context
    videocontext.drawImage(videoElement,0,0);

    // If bodypix segment data is available, set the background to transparent
    if (segment) {
      // Get video frame data
      frame = videocontext.getImageData(0,0,videoElement.width, videoElement.height);

      /* background modes:
          0 = transparent
          1 = video
          2 = green
          3 = blue
          4 = red */

      // If background is video just avoid this.
      if (background != 1) { 
        let background_colour =  [0,0,0,0];
        switch (background) {
          case 0: // transparent
            background_colour = [0,0,0,0];
            break;
          case 2: // green
            background_colour = [0,255,0,255];
            break;
          case 3: // blue
            background_colour = [0,0,255,255];
            break;
        }        

        // Loop through all segment data and set pixel values based on the value
        for (var i=0; i < segment.data.length; i++) {
          current = segment.data[i]
          p_left = segment.data[i-1]
          p_right = segment.data[i+1]

          // If segment data is 1, it's part of the person
          if (segment.data[i] == 1) {
            frame.data[i*4+3] = 255
          } else {
            frame.data[i*4] = background_colour[0]
            frame.data[i*4+1] = background_colour[1]
            frame.data[i*4+2] = background_colour[2]
            frame.data[i*4+3] = background_colour[3]
          }
        }
      }
      // Add frame data to canvas
      renderedcontext.putImageData(frame,0,0)
    }
    // Make sure this function is called on next available frame
    videoElement.requestVideoFrameCallback(renderVideo)
}

// Use bodypix to take the incoming webcam data and run the segmentation
async function createMask(now, metadata) {
  // If bodypix is loaded
  if (net) {
    segment = await net.segmentPerson(videoElement, {internalResolution: 0.5});

    // Set up callback for next available frame
    videoElement.requestVideoFrameCallback(createMask)
  }
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
      // We can reload this at execution time to change options?
      // https://github.com/tensorflow/tfjs-models/blob/master/body-pix/README.md
      bodyPix.load({
        //architecture: 'ResNet50',
        multiplier: 1,
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
  videoElement.requestVideoFrameCallback(renderVideo)
  videoElement.requestVideoFrameCallback(createMask)
}


// Key commands
window.addEventListener("keyup", event => {
  switch(event.key) {
    // Cycle through backgrounds
    case 'b':
      background += 1;
      if (background > 3) {
        background = 0
      }
      break;
  };
});
