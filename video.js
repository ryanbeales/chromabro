const videoElement = document.getElementById('video');
const videocanvas = document.getElementById('videocanvas');
const renderedcanvas = document.getElementById('renderedcanvas');
const videocontext = videocanvas.getContext('2d');
const renderedcontext = renderedcanvas.getContext('2d');

let net = null;
let segment = null;

function renderVideo(now, metadata) {
    // Draw video to video context
    videocontext.drawImage(videoElement,0,0);

    if (segment) {
      // Get video frame data
      frame = videocontext.getImageData(0,0,videoElement.width, videoElement.height);

      segmentdatawidth = videoElement.width / 4

      //Add alpha pixels to frame
      for (var i=0; i < segment.data.length; i++) {
        current = segment.data[i]
        p_left = segment.data[i-1]
        p_right = segment.data[i+1]

        if (segment.data[i] == 1) {
          frame.data[i*4+3] = 255
        } else {
          frame.data[i*4+3] = 0
        }
      }
      // Add to rendered context
      renderedcontext.putImageData(frame,0,0)
    }
    videoElement.requestVideoFrameCallback(renderVideo)
}
videoElement.requestVideoFrameCallback(renderVideo)


async function createMask(now, metadata) {
  if (net) {
    segment = await net.segmentPerson(videoElement, {internalResolution: 0.5});
    videoElement.requestVideoFrameCallback(createMask)
  }
}
videoElement.requestVideoFrameCallback(createMask)


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

videoElement.onloadeddata = () => {
  videocanvas.width = videoElement.width;
  videocanvas.height = videoElement.height;
  renderedcanvas.width = videoElement.width;
  renderedcanvas.height = videoElement.height;
}
