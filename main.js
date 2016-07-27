var WebSocketServer = require('ws').Server;
var http = require('http');
var express = require('express');
var _ = require('underscore');

var server = http.createServer();
var wss = new WebSocketServer({ server: server, path: '/socket' });
var app = express();
var bodyParser = require('body-parser');
var port = 3000;

//------------------------------------------------------------------------
// HTTP server (mostly for the test client)

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', function (req, res) {
	console.log('RECV /');
	res.send('Hello world!');
});

app.get('/client', function (req, res) {
	res.sendFile(__dirname + '/client.html');
});

app.get('/client.js', function (req, res) {
	res.sendFile(__dirname + '/client.js');
});

app.post('/feeds', function (req, res) {
	if (!req.body.feeds) {
		res.send("no-changes");
	}

	try {
		feed.addSources(req.body.feeds);
		res.send("ok");
	} catch (err) {
		res.statusCode = 400;
		res.send(err);
	}
});

app.get('/feeds', function (req, res) {
	var raw_sources = {};
	_.each(feed.sources, function (source) {
		raw_sources[source.name] = _.omit(source, [ 'name', '_timer' ]);
	});
	res.json(raw_sources);
});

//------------------------------------------------------------------------
// Socket server

var handlers = {
	onMessage: function (message) {
		console.log('RECV', message);

		if (message === 'ping') {
			this.send('pong');
			return;
		}

		// Broadcast all received messages to everyone (except sender)
		_.each(clients, function (client) {
			if (client === this) {
				return;
			}
			client.send(message);
		});
	},

	onClose: function() {
		var index = clients.indexOf(this);
		if (index === -1) {
			console.error('onClose client not found');
		} else {
			clients.splice(index, 1);
		}
		console.log('disconnect');
	},
};

var clients = [];
var feed;

wss.on('connection', function (ws) {
	ws.on('message', handlers.onMessage.bind(ws));
	ws.on('close', handlers.onClose.bind(ws));
	clients.push(ws);
	console.log('connected');
});

server.on('request', app);

//------------------------------------------------------------------------
// Initialize server

server.listen(port, function() {
	feed = new Feeder(clients);
	feed.setupDefaultSources();
	console.log('Listening on', server.address().port);
});

//------------------------------------------------------------------------
// Classes

/**
 * @class Feeder
 * 
 * Used to generate fake events to stream to the 'wall'
 */
var Feeder = function(clients) {
	this.sources = {};
	this.clients = clients;
};

Feeder.prototype.addSources = function (sources) {
	var self = this;
	_.each(sources, function (source, key) {
		self.addSource(key, source);
	});
};

Feeder.prototype.addSource = function (name, options) {
	var source = _.clone(options);
	source.name = name;
	Feeder.validateSource(source);

	if (this.sources[name]) {
		this.removeSource(this.sources[name]);
	}
	this.sources[name] = source;
	this.seedNextFeedItem(source);
};

Feeder.prototype.removeSource = function (name) {
	var source = this.sources[name];
	if (!source) {
		return;
	}

	clearTimeout(source._timer);
	delete this.sources[name];
};

Feeder.prototype.seedNextFeedItem = function (source) {
	var self = this;
	source._timer = setTimeout(function() {
		self.generateFeedItem(source);
	}, this.getFeedItemDelay(source));
};

Feeder.prototype.getFeedItemDelay = function (source) {
	var interval = source.interval;
	if (interval.min === interval.max || !interval.max) {
		return interval.min * 1000;
	}

	var diff = interval.max - interval.min;
	return Math.round((interval.min + (Math.random() * diff)) * 1000);
};

Feeder.prototype.generateFeedItem = function (source) {
	var feed_item = Feeder.createFeedItem(source);
	_.each(this.clients, function(client) {
		client.send(JSON.stringify(feed_item));
	});
	this.seedNextFeedItem(source);
};

Feeder.prototype.setupDefaultSources = function() {
	if (this.sources.length) {
		console.error('Sources already configured');
		return;
	}

	var sources = require('./default_sources.json');
	this.addSources(sources);
};

/**
 * source = {
 *   name: 'quests',
 *   interval: {
 *     min: 1,
 *     max: 5 // optional
 *   }
 *   data: {
 *     key1: { value: 8 },                // Constant
 *     key2: { min: 3, max: 6, prec: 0 }, // Random number
 *     key3: { enum: [ ... ] }            // Randomly pick one value
 *   }
 * };
 */
Feeder.createFeedItem = function (source) {
	var feed_item = { type: source.name };
	var spec, val, base, index;
	for (var key in source.data) {
		spec = source.data[key];
		if (spec.value) {
			val = spec.value;
		}
		else if (spec.min) {
			val = spec.min + (Math.random() * (spec.max - spec.min + 1));
			if (spec.prec) { // Round if precision is defined
				base = Math.pow(10, spec.prec);
				val = Math.floor(val * base) / base;
			}
		}
		else if (spec.enum) {
			index = Math.floor(Math.random() * spec.enum.length);
			val = spec.enum[index];
		}
		feed_item[key] = val;
	}
	return feed_item;
};

Feeder.validateSource = function (source) {
	if (!source.name) {
		throw 'Source name required';
	}
	if (!source.data) {
		throw 'Source data is required';
	}
	for (var key in source.data) {
		var entry = source.data[key];
		if (entry.value === undefined &&
				entry.min === undefined &&
				entry.enum === undefined
		) {
			throw 'Data entry invalid: ' + key;
		}
	}
};

//------------------------------------------------------------------------
