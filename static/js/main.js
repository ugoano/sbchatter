var ws = new WebSocket('ws://' + location.host + ':7080/ws');
var initiator;
var pc;

var sendChannel;

var sendButton = document.getElementById('sendButton');

var sendTextarea = document.getElementById('dataChannelSend');
var receiveTextarea = document.getElementById('dataChannelReceive');

var localStream;
var remoteStream;
var isStarted;
var turnReady;

var stunUrl = webrtcDetectedBrowser === 'firefox'
    ? 'stun:23.21.150.121' : 'stun:stun.l.google.com:19302';

var pc_config =
    {'iceServers':[
        {'url': stunUrl},
        {'url': 'turn:ec2-54-216-248-168.eu-west-1.compute.amazonaws.com'}
    ]};

var pc_constraints = {
	'optional': [
		{'DtlsSrtpKeyAgreement': true},
		{'RtpDataChannels': true}
	]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {'mandatory': {
	'OfferToReceiveAudio':true,
	'OfferToReceiveVideo':true }};

var room = location.pathname.substring(1);
if (room === '') {
	//  room = prompt('Enter room name:');
	room = 'foo';
} else {
	//
}



function sendData() {
	var data = $("#dataChannelSend").val();
	sendChannel.send(data);
	trace('Sent data: ' + data);
}

function call() {
    $('#btn-call').addClass('btn-active');
    initiator = true;
    init();
}


function receive() {
    $('#btn-receive').addClass('btn-active');
    initiator = false;
    init();
}


function init() {
	sendButton = $('#sendButton')[0];
	$('#sendButton').click(sendData);
	sendTextarea = $('#dataChannelSend')[0];
	receiveTextarea = $('#dataChannelReceive')[0];

    var constraints = {
        audio: $('#audio').prop('checked'),
        video: $('#video').prop('checked')
    };

    if (constraints.audio || constraints.video) {
        getUserMedia(constraints, connect, fail);
        requestTurn();
    } else {
        connect();
    }
}


function connect(stream) {
    pc = new RTCPeerConnection(pc_config, pc_constraints);
	trace("Created local peer connection");

    if (stream) {
        pc.addStream(stream);
        $('#local').attachStream(stream);
    }

    pc.onaddstream = function(event) {
        $('#remote').attachStream(event.stream);
        logStreaming(true);
    };
    pc.onicecandidate = function(event) {
        if (event.candidate) {
            ws.send(JSON.stringify(event.candidate));
        }
    };

	if(initiator) {
		try {
			// Reliable data channels not supported by Chrome
			sendChannel = pc.createDataChannel("sendDataChannel", {reliable: false});
			sendChannel.onmessage = handleMessage;
			trace("Created send data channel");
		} catch(e) {
			alert('Failed to create data channel. ' +
					'You need Chrome M25 or later with RtpDataChannel enabled');
			trace('createDataChannel() failed with exception: ' + e.message);
		}
		sendChannel.onopen = handleSendChannelStateChange;
		sendChannel.onclose = handleSendChannelStateChange;

	} else {
		pc.ondatachannel = gotReceiveChannel;
	}

    ws.onmessage = function (event) {
        var signal = JSON.parse(event.data);
        if (signal.sdp) {
            if (initiator) {
                receiveAnswer(signal);
            } else {
                receiveOffer(signal);
            }
        } else if (signal.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(signal));
        } else if (signal.message) {
		}
    };

    if (initiator) {
        createOffer();
    } else {
        log('waiting for offer...');
    }
    logStreaming(false);
}


function createOffer() {
    log('creating offer...');
    pc.createOffer(function(offer) {
        log('created offer...');
        pc.setLocalDescription(offer, function() {
            log('sending to remote...');
            ws.send(JSON.stringify(offer));
        }, fail);
    }, fail, sdpConstraints);
}


function receiveOffer(offer) {
    log('received offer...');
    pc.setRemoteDescription(new RTCSessionDescription(offer), function() {
        log('creating answer...');
        pc.createAnswer(function(answer) {
            log('created answer...');
            pc.setLocalDescription(answer, function() {
                log('sent answer');
                ws.send(JSON.stringify(answer));
            }, fail);
        }, fail, sdpConstraints);
    }, fail);
}


function receiveAnswer(answer) {
    log('received answer');
    pc.setRemoteDescription(new RTCSessionDescription(answer));
}

function requestTurn() {
  var turnExists = false;
  for (var i in pc_config.iceServers) {
    if (pc_config.iceServers[i].url.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
}

function log() {
    $('#status').text(Array.prototype.join.call(arguments, ' '));
    console.log.apply(console, arguments);
}


function logStreaming(streaming) {
    $('#streaming').text(streaming ? '[streaming]' : '[..]');
}


function fail() {
    $('#status').text(Array.prototype.join.call(arguments, ' '));
    $('#status').addClass('error');
    console.error.apply(console, arguments);
}

function gotReceiveChannel(event) {
	trace('Received Channel Callback');
	sendChannel = event.channel;
	sendChannel.onmessage = handleMessage;
	sendChannel.onopen = handleReceiveChannelStateChange;
	sendChannel.onclose = handleReceiveChannelStateChange;
}

function enableMessageInterface(shouldEnable) {
	if (shouldEnable) {
		dataChannelSend.disabled = false;
		dataChannelSend.focus();
		dataChannelSend.placeholder = "";
		sendButton.disabled = false;
	} else {
		dataChannelSend.disabled = true;
		sendButton.disabled = true;
	}
}

function handleSendChannelStateChange() {
	var readyState = sendChannel.readyState;
	trace('Send channel state is: ' + readyState);
	enableMessageInterface(readyState == "open");
}

function handleReceiveChannelStateChange() {
	var readyState = sendChannel.readyState;
	trace('Receive channel state is: ' + readyState);
	enableMessageInterface(readyState == "open");
}


function handleMessage(event) {
	trace('Received message: ' + event.data);
	receiveTextarea.value = event.data;
}

jQuery.fn.attachStream = function(stream) {
    this.each(function() {
        this.src = URL.createObjectURL(stream);
        this.play();
    });
};
