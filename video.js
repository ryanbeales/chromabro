const videoElement = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let net = null 

window.onload = () => {
  navigator.mediaDevices.getUserMedia({video: { width: videoElement.width, height: videoElement.height}, audio: false})
    .then(stream => {
      videoElement.srcObject = stream;
      videoElement.play();
    })
    .catch(err => {
      alert(`Following error occured: ${err}`);
    });


    bodyPix.load({
      multiplier: 1,
      stride: 16,
      quantBytes: 4
    }).then(function (net2) { net = net2; })
}

videoElement.onplaying = () => {
  canvas.height = videoElement.videoHeight;
  canvas.width = videoElement.videoWidth;
};

let personMask = null


function renderVideo(now, metadata) {
  if (personMask) {
    const opacity = 1;
    const maskBlurAmount = 0;
    const flipHorizontal = true;
  
    bodyPix.drawMask(
      canvas, videoElement, personMask, opacity,
      maskBlurAmount, flipHorizontal);
    }
    videoElement.requestVideoFrameCallback(renderVideo);
}
videoElement.requestVideoFrameCallback(renderVideo);


async function renderMask(now, metadata) {
  if (net) {
  const personSegmentation = await net.segmentPerson(videoElement);
  const foregroundColor = {r: 0, g: 0, b: 0, a: 0}
  const backgroundColor = {r: 0, g: 128, b: 0, a: 255}
  personMask = bodyPix.toMask(personSegmentation, foregroundColor, backgroundColor);
  videoElement.requestVideoFrameCallback(renderMask)
  }
}
videoElement.requestVideoFrameCallback(renderMask)