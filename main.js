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
		var gameID = server.customSocketInfo.GameID;
        _.each(clientList, function (client) {
            if (!client.customSocketInfo || client.customSocketInfo.GameID != gameID) {
                return;
            }
            client.send({MessageType:"SHUTDOWN"});
			removeServerInfoFromClient(server,client);
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
                server.send({MessageType:"SHUTDOWN",clientID:client.customSocketInfo.ClientID});
                server.customClientList.splice(index, 1);
            }
        });
    }
}

var removeServerInfoFromClient = function(server,client) {
	if (client.customServerInfo) {
		var index = client.customServerInfo.indexOf(server);
		if (index === -1) {
			console.error('removeServerInfoFromClient server not found in customServerInfo');
		} else {
			client.customServerInfo.splice(index, 1);
		}
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

var sendToServerList = function (client,message,sendFunc) {
    if (client.customSocketInfo && client.customSocketInfo.Type === 'Client') {
        var serverList = client.customServerInfo || servers;
        _.each(serverList, function (server) {
            index = server.customClientList.indexOf(client);
            if (index === -1) {
                console.error('sendToServerList client not found in customClientList');
            } else {
                sendFunc(server,message);
            }
        });
    }
}

var handlers = {
	onMessage: function (message) {
		var self = this;
		console.log('RECV', message);

		if (message === 'ping') {
			self.send('pong');
			return;
		} else {
            var parsedJSON = JSON.parse(message);
            if (parsedJSON) {
                switch (parsedJSON.MessageType) {
                    case "INFO":
                        if (parsedJSON.Type && parsedJSON.GameID) {
							self.customSocketInfo = parsedJSON;
							var gameID = self.customSocketInfo.GameID;
                            switch (self.customSocketInfo.Type) {
                                case 'Server':
                                    if (servers.indexOf(self) === -1) {
                                        servers.push(self);
										self.customClientList = [];
                                        _.each(clients,function (client){
                                            if (!client.customSocketInfo || client.customSocketInfo.GameID != gameID) {
                                                return;
                                            }
                                            client.customServerInfo.push(self);
											self.customClientList.push(client);
                                        });
                                    }
                                    break;
                                case 'Client':
                                    removeClient(self,true,true);
                                    clients.push(self);
									self.customServerInfo = [];
                                    _.each(servers,function (server){
                                        if (!server.customSocketInfo || server.customSocketInfo.GameID != gameID) {
                                            return;
                                        }
                                        server.customClientList.push(self);
										self.customServerInfo.push(server);
                                    });
                                    break;
                            }
                        }
                        break;

                    case "FETCH":
                        sendToClientList(self,message,function(client,message){
                            client.send(message);
                        });

                        break;
                    case "SERVERCOMBAT":
                        sendToClientList(self,message,function(client,message){
							_.each(parsedJSON.clientIDs, function(clientID) {
								if (client.customSocketInfo.ClientID == clientID) {
									client.send(message);
								}
							});
                        });
                        break;

                    default:
                        sendToServerList(self,message,function(server,message){
                            server.send(message);
                        });
                        break;
                }
            }
        }
	},

	onClose: function() {
		var self = this;
        if (self.customSocketInfo && self.customSocketInfo.Type === 'Server') {
            removeServer(self);
        } else {
            removeClient(self,true);
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
