import { io } from "socket.io-client";
import { v4 as uuidV4 } from 'uuid';
import 'bootstrap/dist/css/bootstrap.css';
import './style.css';

const socket = io('http://localhost:5000/');
const stunServers = {
  iceServers: [
    {
      urls: ['stun:stun.l.google.com:19302', 'stun:stun.l.google.com:19302']
    }
  ],
  iceCandidatePoolSize: 10
};

let pc = null;
let localStream = null;
let remoteStream = null;
let myGenerateCallId = null;





// handle UI
// ---------------------------------------------

const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const existingCalls = document.getElementById('existing_calls');
const myCallId = document.getElementById('myCallId');

webcamVideo.muted = true;
remoteVideo.muted = true;
hangupButton.style.display = 'none';


// start webcam button pressed
webcamButton.onclick = async () => {
  await showCamera();
  initCall();
}


// end call
hangupButton.onclick = () => {
  hangUp();
}


const hangUp = () => {
  console.log('hang up call')

  // close camera
  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // close peer connection
  pc.close();
  pc.onicecandidate = null;

  // buttons css
  webcamButton.style.display = 'inline';
  hangupButton.style.display = 'none';
  myCallId.innerText = '';
}


const showCamera = async () => {
  pc = new RTCPeerConnection(stunServers);

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();


  // take stream and make them available on video elements in DOM
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream)
  });


  // listem on remote stream and if available and their track
  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    })
  }

  pc.createDataChannel('my_channel').onclose = () => hangUp();

  // apply streams on video elements in DOM
  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  // hide start webcam and display call button
  webcamButton.style.display = 'none';
}



// Create call
const initCall = async () => {
  // create random id
  myGenerateCallId = uuidV4();

  // caller makes offer - get candidates for caller and save them
  pc.onicecandidate = event => {
    if (!!event.candidate) {
      console.log('sending offer candidate', event.candidate)
      socket.emit('offer_candidate', { callId: myGenerateCallId, candidate: event.candidate.toJSON() })
    }
  }

  // create offer
  const offerDescription = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
  });

  // contains session description protocol - SDP
  // generates potential ICE candidates
  await pc.setLocalDescription(offerDescription);

  // send offer to the server
  console.log('Sending offer to server', myGenerateCallId, offerDescription)
  socket.emit('create_offer', {
    callId: myGenerateCallId,
    callData: {
      sdp: offerDescription.sdp,
      type: offerDescription.type
    }
  })

  // listen for answer from user on other side
  socket.on(`answering_call_${myGenerateCallId}`, callData => {
    if (!pc.currentRemoteDescription) {
      console.log('Setting remote desction to ', callData);
      pc.setRemoteDescription(new RTCSessionDescription(callData));
    }
  });


  // listen on ice candidates from Answerer
  socket.on(`answer_candidate_${myGenerateCallId}`, candidate => {
    console.log('received answer candidate', candidate);
    pc.addIceCandidate(new RTCIceCandidate(candidate));

    // show hang up button 
    hangupButton.style.display = 'inline';
  });

  // show my call id 
  myCallId.innerText = `My call id : ${myGenerateCallId}`;

}

// --------------------------

// Answer call
const answerCall = async (callId) => {
  pc.onicecandidate = event => {
    if (!!event.candidate) {
      console.log('sending answer candidate', event.candidate.toJSON());
      socket.emit('answer_candidate', {
        callId: callId,
        candidate: event.candidate.toJSON()
      });
    }
  }

  // send callId to server - check if exists
  socket.emit(`init_call`, callId);

  // get offer from server
  socket.on(`offer_description_${callId}`, async ({ offer, candidates }) => {
    console.log('received offer for callId', callId, offer, candidates);

    // set offer as remote descption & create answer
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    // save ICE candidates
    candidates.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)));

    // send answer
    socket.emit('create_answer', {
      callId: callId,
      callData: {
        sdp: answerDescription.sdp,
        type: answerDescription.type
      }
    });

    // listen on hang up
    socket.on(`hangup_${callId}`, () => hangUp());

    // show hang up button 
    hangupButton.style.display = 'inline';

  });
};

// ---------------------------------------------

// listen on existing calls 
socket.on('created_offer', callId => {
  // do not show my generate call id
  if (callId === myGenerateCallId) {
    return;
  }

  // create button
  const btn = document.createElement("BUTTON");
  btn.innerText = callId;
  btn.id = callId;
  btn.className = 'btn btn-success';
  btn.addEventListener('click', async () => {
    await showCamera();
    answerCall(callId);

    // hide button
    btn.style.display = 'none';
  });

  // append into DOM
  existingCalls.append(btn);
});



socket.on('connection', () => console.log('client is connected'))