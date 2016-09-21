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

var removeServer = function(server) {
    var index = servers.indexOf(server);
    if (index === -1) {
        console.error('removeServer server not found');
    } else {
        servers.splice(index, 1);
        var clientList = server.customClientList || clients;
        _.each(clientList, function (client) {
            if (client === this || !client.customSocketInfo || client.customSocketInfo.GameID != gameID) {
                return;
            }
            removeClient(client);
        });
    }
}

var removeClient = function(client,removeFromServerList,noerror) {
    var index = clients.indexOf(client);
    if (index === -1 && !noerror) {
        console.error('removeClient client not found in client list');
    } else {
        clients.splice(index, 1);
    }

    if (removeFromServerList && client.customServerInfo) {
        client.customServerInfo.forEach(function(server){
            index = server.customClientList.indexOf(client);
            if (index === -1 && !noerror) {
                console.error('removeClient client not found in customClientList');
            } else {
               server.customClientList.splice(index, 1);
            }
        });
    }
}

var sendToClientList = function (server,message,sendFunc) {
    if (server.customSocketInfo && server.customSocketInfo.Type === 'Server') {
        var gameID = server.customSocketInfo.GameID;
        var clientList = server.customClientList || clients;
        _.each(clientList, function (client) {
            if (!client.customSocketInfo || client.customSocketInfo.GameID != gameID) {
                return;
            }
            sendFunc(client,message);
        });
    }
}

var handlers = {
	onMessage: function (message) {
		console.log('RECV', message);

		if (message === 'ping') {
			this.send('pong');
			return;
		} else {
            var parsedJSON = JSON.parse(message);
            if (parsedJSON) {
                switch (parsedJSON.MessageType) {
                    case "INFO":
                        if (parsedJSON.Type && parsedJSON.GameID) {
                            this.customSocketInfo = parsedJSON;
                            switch (this.customSocketInfo.Type) {
                                case 'Server':
                                    if (servers.indexOf(this) === -1) {
                                        servers.push(this);
                                        this.customClientList = [];
                                        var gameID = this.customSocketInfo.GameID;
                                        _.each(clients,function (client){
                                            if (!client.customSocketInfo || client.customSocketInfo.GameID != gameID) {
                                                return;
                                            }
                                            this.customServerInfo.push(this);
                                        });
                                    }
                                    break;
                                case 'Client':
                                    removeClient(this,true,true);
                                    clients.push(this);
                                    var gameID = this.customSocketInfo.GameID;
                                    this.customServerInfo = [];
                                    _.each(servers,function (server){
                                        if (!server.customSocketInfo || server.customSocketInfo.GameID != gameID) {
                                            return;
                                        }
                                        server.customClientList.push(this);
                                        this.customServerInfo.push(server);
                                    });
                                    break;
                            }
                        }
                        break;
                    case "FETCH":
                        sendToClientList(this,message,function(client,message){
                            client.send(message);
                        });

                        break;
                    case "COMBAT":
                        sendToClientList(this,message,function(client,message){
                            if (client.customSocketInfo.ClientID == parsedJSON.client1ID ||
                                client.customSocketInfo.ClientID == parsedJSON.client2ID) {
                                client.send(message);
                            }
                        });
                        break;
                }
            }
        }
	},

	onClose: function() {
        if (this.customSocketInfo && this.customSocketInfo.Type === 'Server') {
            removeServer(this);
        } else {
            removeClient(this,true);
        }
		console.log('disconnect');
	}
};

var servers = [];
var clients = [];
var feed;

wss.on('connection', function (ws) {
	ws.on('message', handlers.onMessage.bind(ws));
	ws.on('close', handlers.onClose.bind(ws));
	console.log('connected');
});

server.on('request', app);

//------------------------------------------------------------------------
// Initialize server

server.listen(port, function() {
	console.log('Listening on', server.address().port);
});
