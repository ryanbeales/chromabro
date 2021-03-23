# What is this?
A simple app that will take webcam input, use tensorflow+bodypix to segment the image in two parts (background and person) and then set the background to a generic green screen for chroma keying later. 

See references below for a detailed explaination on how this works.

This is like what some other apps use for the same effect (Zoom, Teams, Nvidia Broadcast RTX thing, Xsplit, Chromacam) but free. And since it's free maybe if you use it you could swing some coffee money my way...

The intended use for this was to feed in to OBS and utilize the chroma key plugin to overlay video there.

Initially I tried using a plan webpage https://www.ryanbeales.com/webcamgreenscreen/index.html within a browser input but the chrome instance within OBS will not use the webcam without verifying the webcam permissions. There are tricks/hacks but it was not possible on macos. By making this a separate app I can use that as input to OBS and avoid the permissions problem.

# Installing
See releases.

# OBS How To
Start this app, configure a new app source which is this app. Profit.

# Kick start (for windows 10)
Basically, my notes on how I made this.
```
choco install nodejs
npm init -y
npm i --save-dev electron
npm install --save-dev @electron-forge/cli
npx electron-forge import
npm run make

```

# External Libraries
https://cdn.jsdelivr.net/npm/@tensorflow/tfjs
https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix

## References:

# Bodypix
https://blog.francium.tech/edit-live-video-background-with-webrtc-and-tensorflow-js-c67f92307ac5
https://github.com/tensorflow/tfjs-models/blob/master/body-pix/README-v1.md
https://blog.tensorflow.org/2019/11/updated-bodypix-2.html
https://jameshfisher.com/2020/09/23/running-bodypix-on-a-video-stream/

### Electron
https://www.electronjs.org/docs/tutorial/quick-start
https://github.com/samuelmeuli/action-electron-builder