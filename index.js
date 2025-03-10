'use strict';


const HEYGEN_API_KEY = ''
const HEYGEN_API_URL = 'https://api.heygen.com';
const HEYGEN_AVATAR_ID = ''
const HEYGEN_VOICE_ID = ''
const LOYJOY_PROCESS_ID = ''
const LOYJOY_WIDGET_URL = 'https://stable.loyjoy.com/widget.js'

let peerConnection = null
let queue = []
let sessionInfo = null
let throttledTimeout

(function () {
  if (!HEYGEN_API_KEY) {
    alert('Please provide your HeyGen API key');
  }

  document.getElementById('start-button').addEventListener('click', start)
  document.getElementById('closeBtn').addEventListener('click', closeConnectionHandler);
}())

async function start() {
  await createNewSession()

  if (!sessionInfo) {
    return
  } else {
    await startAndDisplaySession()

    loyJoyBoot()
  }
}

function loyJoyBoot() {
  const loyJoyScript = document.getElementById('loyjoy-script')
  loyJoyScript && loyJoyScript.parentNode && loyJoyScript.parentNode.removeChild(loyJoyScript)

  const widgetScript = document.createElement('script')

  widgetScript.async = true
  widgetScript.charset = 'utf-8'
  widgetScript.defer = true
  widgetScript.id = 'loyjoy-script'
  widgetScript.src = LOYJOY_WIDGET_URL
  widgetScript.type = 'text/javascript'

  widgetScript.onload = function () {
    LoyJoy('boot', {
      eventListeners: [
        async (type, detail) => {
          if (type === 'message_received' && detail.type === 'SEND_MESSAGE') {
            const text = detail.payload.text

            if (text) {
              const cleanedText = cleanText(text)
              collect(cleanedText)
              executeAllThrottled(async (collectedText) => await repeat(sessionInfo.session_id, collectedText))
            }
          }
        },
      ],
      process: LOYJOY_PROCESS_ID
    })
  }

  document.body.appendChild(widgetScript)
}

function cleanText(text) {
  return text
    .replaceAll('#', '')
    .replaceAll('*', '')
}

function collect (cb) {
  queue.push(cb)
}

function executeAllThrottled (cb) {
  if (throttledTimeout) clearTimeout(throttledTimeout)

  throttledTimeout = setTimeout(async () => {
    const collectedText = queue.join(' ')
    queue = []

    await cb(collectedText)
  }, 200)
}

// Create a new WebRTC session when clicking the "New" button
async function createNewSession() {
  // call the new interface to get the server's offer SDP and ICE server to create a new RTCPeerConnection
  sessionInfo = await newSession('low', HEYGEN_AVATAR_ID, HEYGEN_VOICE_ID);
  const { sdp: serverSdp, ice_servers2: iceServers } = sessionInfo;

  // Create a new RTCPeerConnection
  peerConnection = new RTCPeerConnection({ iceServers: iceServers });

  // When audio and video streams are received, display them in the video element
  peerConnection.ontrack = (event) => {
    if (event.track.kind === 'audio' || event.track.kind === 'video') {
      mediaElement.srcObject = event.streams[0];
    }
  };

  // Set server's SDP as remote description
  const remoteDescription = new RTCSessionDescription(serverSdp);
  await peerConnection.setRemoteDescription(remoteDescription);
}

// Start session and display audio and video when clicking the "Start" button
async function startAndDisplaySession() {
  if (!sessionInfo) {
    return;
  }

  // Create and set local SDP description
  const localDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(localDescription);

 // When ICE candidate is available, send to the server
  peerConnection.onicecandidate = ({ candidate }) => {

    if (candidate) {
      handleICE(sessionInfo.session_id, candidate.toJSON());
    }
  };

  // Start session
  await startSession(sessionInfo.session_id, localDescription);

  var receivers = peerConnection.getReceivers();

  receivers.forEach((receiver) => {
    receiver.jitterBufferTarget = 500
  });
}


// when clicking the "Close" button, close the connection
async function closeConnectionHandler() {
  if (!sessionInfo) {
    return;
  }

  canvasElement.classList.add('hide');
  canvasElement.classList.remove('show');

  try {
    // Close local connection
    peerConnection.close();
    // Call the close interface
    const resp = await stopSession(sessionInfo.session_id);

    console.log(resp);
  } catch (err) {
    console.error('Failed to close the connection:', err);
  }
}


// new session
async function newSession(quality, avatar_name, voice_id) {
  const response = await fetch(`${HEYGEN_API_URL}/v1/streaming.new`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': HEYGEN_API_KEY,
    },
    body: JSON.stringify({
      quality,
      avatar_name,
      voice: {
        voice_id: voice_id,
      },
    }),
  });

  if (response.status === 500) {
    console.error('Server error');

    throw new Error('Server error');
  } else if (response.status === 400) {
    console.error('Bad request');
    const err = await response.json()

    showError(err.message)

  } else {
    const data = await response.json()
    return data.data;
  }
}

// start the session
async function startSession(session_id, sdp) {
  const response = await fetch(`${HEYGEN_API_URL}/v1/streaming.start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': HEYGEN_API_KEY,
    },
    body: JSON.stringify({ session_id, sdp }),
  });
  if (response.status === 500) {
    console.error('Server error');

    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data.data;
  }
}

// submit the ICE candidate
async function handleICE(session_id, candidate) {
  const response = await fetch(`${HEYGEN_API_URL}/v1/streaming.ice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': HEYGEN_API_KEY,
    },
    body: JSON.stringify({ session_id, candidate }),
  });
  if (response.status === 500) {
    console.error('Server error');

    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data;
  }
}

// repeat the text
async function repeat(session_id, text) {
  const response = await fetch(`${HEYGEN_API_URL}/v1/streaming.task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': HEYGEN_API_KEY,
    },
    body: JSON.stringify({ session_id, text }),
  });

  if (response.status === 500) {
    console.error('Server error');
    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data.data;
  }
}

// stop session
async function stopSession(session_id) {
  const response = await fetch(`${HEYGEN_API_URL}/v1/streaming.stop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': HEYGEN_API_KEY,
    },
    body: JSON.stringify({ session_id }),
  });

  if (response.status === 500) {
    console.error('Server error');
    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data.data;
  }
}

function showError(error) {
  const err = document.querySelector('#error');
  err.innerHTML = error;
}

const mediaElement = document.querySelector('#mediaElement');
mediaElement.onloadedmetadata = () => {
  mediaElement.play();
};
