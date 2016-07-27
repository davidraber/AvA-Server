(function() {

	function println(msg) {
		var el = document.getElementById('feedItems');
		el.innerHTML += '<div class="msg">' + msg + '</div>';
	}

	var server = 'ws://' + window.location.host + '/socket';
	var socket = new WebSocket(server);

	var pinger = null;

	socket.onopen = function() {
		console.log('connected');

		pinger = setInterval(function() {
			socket.send('ping');
			console.log('--> ping');
		}, 10000);

	};

	socket.onclose = function() {
		clearInterval(pinger);
	};

	socket.onmessage = function (event) {
		if (event.data === 'pong') {
			console.log('<-- pong');
			return;
		}

		println(event.data);
	};

	window.socket = socket;

})();
