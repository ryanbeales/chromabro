window.onload = () => {
    start_webcam();
    start_bodypix();
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