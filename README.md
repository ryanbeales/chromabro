# What is this?
A simple app that will take webcam input, use tensorflow+bodypix to segment the image in two parts (background and person) and display in the bottom right corner of the screen with a transparent background.

See references below for a detailed explaination on how this works.

This is like what some other apps use for the same effect (Zoom, Teams, Nvidia Broadcast RTX thing, Xsplit, Chromacam) but free. And since it's free maybe if you use it you could swing some coffee money my way...

The intended use for this was to add to desktop sharing for zoom meetings on macos. It was developed on windows.

Initially I was using a plan webpage https://www.ryanbeales.com/chromabro/index.html within a browser input which works, but takes up screen realestate. This just places the segmented webcam image directly on the desktop to capture from there in any application. 

# Installing
See releases. The app is not signed so you'll have to work around macos permissions to install (right click then open, rather that clicking directly on it).

# Notes
- The mask is slower to render than the video so it will lag on sudden movements.
- Some backgrounds can confuse it, it's best to have a boring background like a wall (in my case it confuses a jacket hanging behind me with a bit of me, but it's pretty good)

# References:

## External Libraries
https://cdn.jsdelivr.net/npm/@tensorflow/tfjs
https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix


## Bodypix
https://blog.francium.tech/edit-live-video-background-with-webrtc-and-tensorflow-js-c67f92307ac5
https://github.com/tensorflow/tfjs-models/blob/master/body-pix/README-v1.md
https://blog.tensorflow.org/2019/11/updated-bodypix-2.html
https://jameshfisher.com/2020/09/23/running-bodypix-on-a-video-stream/

## Electron
https://www.electronjs.org/docs/tutorial/quick-start
https://github.com/samuelmeuli/action-electron-builder