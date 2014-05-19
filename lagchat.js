var net = require('net')
var crypto = require('crypto');
var LineStream = require('byline').LineStream;
var EventEmitter = require('events').EventEmitter;
var util = require('util');

function main() {
  if (process.argv[2]=='connectTo') {
    host = process.argv[3];
    port = parseInt(process.argv[4], 10)
    runClient(host, port);
  } else if (process.argv[2]=='serveOnPort') {
    port = parseInt(process.argv[3], 10)
    runServer(port);
  } else if (process.argv[2]=='mitmAgainstFrom') {
    connectToHost = process.argv[3];
    connectToPort = parseInt(process.argv[4], 10)
    listenPort = parseInt(process.argv[5], 10)
    runMitm(connectToHost, connectToPort, listenPort);
  } else {
    console.log('Usage:')
    console.log('  node lagchat.js connectTo CONNECT-TO-HOST CONNECT-TO-PORT')
    console.log('  node lagchat.js serveOnPort LISTEN-PORT')
    console.log('  node lagchat.js mitmAgainstFrom CONNECT-TO-HOST CONNECT-TO-PORT LISTEN-PORT')
  }
}

function ChatterEndpoint(stream) {
  EventEmitter.call(this);
  this.stream = stream;
  this.dh = crypto.getDiffieHellman('modp5');
  this.dh.generateKeys();
  this.sessionKey = null;
  this.cipherNonce = crypto.randomBytes(32).toString('hex');
  this.cipher = null;
  this.decipher = null;
  this.messageCounter = 0;
  this.expectedHashes = {};
  this.lineStream = new LineStream();
  stream.pipe(this.lineStream);
  stream.on('data', this.onLine.bind(this));
  
  this.sendHandshake();
}
util.inherits(ChatterEndpoint, EventEmitter);

ChatterEndpoint.prototype.send = function(ob) {
  var str = JSON.stringify(ob);
  str = str
    .replace('\\', '\\\\')
    .replace('\r', '\\r')
    .replace('\n', '\\n');
  this.stream.write(str + '\n');
  console.log('writing')
}

ChatterEndpoint.prototype.sendHandshake = function() {
  var publicKey = this.dh.getPublicKey('hex');
  console.log("Sending handshake");
  console.log("  My public key: " + publicKey);
  console.log("  My cipherNonce: " + this.cipherNonce);
  this.send({
    'type': 'handshake',
    'publicKey': publicKey,
    'cipherNonce': this.cipherNonce
  })
}

ChatterEndpoint.prototype.onLine = function(line) {
  line = line.toString()
    .replace('\\\\', '\\')
    .replace('\\r', '\r')
    .replace('\\n', '\n');
  console.log('read',line)
  this.onObject(JSON.parse(line));
}

ChatterEndpoint.prototype.onObject = function(object) {
  var type = object['type'];
  if (type == 'handshake') {
    this.onHandshake(object);
  } else if (type == 'premessage') {
    this.onPremessage(object);
  } else if (type == 'message') {
    this.onMessage(object)
  } else {
    throw 'Unexpected message type ' + type
  }
}

ChatterEndpoint.prototype.onHandshake = function(ob) {
  var otherPublicKey = ob['publicKey'];
  var otherCipherNonce = ob['cipherNonce'];
  console.log("Received handshake.");
  console.log("  Partner's public key: " + otherPublicKey)
  console.log("  Partner's cipher nonce: " + otherCipherNonce)
  
  this.sessionKey = this.dh.computeSecret(otherPublicKey, 'hex', 'hex');
  console.log('Established session key', this.sessionKey);
  this.cipher = crypto.createCipher('aes256', this.sessionKey + this.cipherNonce);
  this.decipher = crypto.createDecipher('aes256', this.sessionKey + otherCipherNonce);
}

ChatterEndpoint.prototype.onPremessage = function(ob) {
  var hash = ob['hash'];
  var messageId = ob['messageId'];
  console.log('Got premessage #' + messageId)
  this.expectedHashes[messageId] = hash;
}

function generateHash(message, sessionKey, nonce) {
  var hmac = crypto.createHmac('sha256', new Buffer(nonce, 'hex'));
  hmac.update(message);
  hmac.update(sessionKey);
  return hmac.digest('hex')
}

ChatterEndpoint.prototype.onMessage = function(ob) {
  var messageNonce = ob['nonce'];
  var messageContents = ob['contents'];
  var messageId = ob['messageId'];
  console.log('got message #' + ob['messageId'])
  var actualHash = generateHash(messageContents, this.sessionKey, messageNonce);
  var accepted = actualHash == this.expectedHashes[messageId];
  delete this.expectedHashes[messageId];
  console.log('Message ', messageId, accepted?'PASS':'FAIL', messageContents)
  if (accepted) {
    this.emit('message', messageContents)
  }
}

ChatterEndpoint.prototype.sendMessage = function(text) {
  var messageId = ++this.messageCounter;
  var nonce = crypto.randomBytes(32).toString('hex');
  var hash = generateHash(text, this.sessionKey, nonce);
  
  this.send({
    'type': 'premessage',
    'messageId': ''+messageId,
    'hash': hash
  })
  setTimeout(function() {
    this.send({
      'type': 'message',
      'nonce': nonce,
      'contents': text,
      'messageId': messageId
    })
  }.bind(this), 4000);
}

function sendStdinTo(endpoint) {
  var lines = new LineStream();
  lines.on('data', function(line) {
    line = line.toString();
    console.log(line);
    endpoint.sendMessage(line);
  })
  process.stdin.pipe(lines);
  return endpoint;
}

function runClient(host, port) {
  console.log('Running the client, connecting to ' + host + ':' + port);
  var socket = net.connect(port, host, function() {
    sendStdinTo(new ChatterEndpoint(socket))
  })
}

function runServer(port) {
  console.log('Running the server, listening on port', port)
  var server = net.createServer();
  
  server.once('connection', function(c) {
    console.log('Got client!');
    sendStdinTo(new ChatterEndpoint(c));
    server.close();
  })
  server.listen(port);
}

function runMitm(connectToHost, connectToPort, listenPort) {
  var server = net.createServer();
  
  server.once('connection', function(withClientSocket) {
    var withServerSocket = net.connect(connectToPort, connectToHost, function() {
      var withRealClient = new ChatterEndpoint(withClientSocket);
      var withRealServer = new ChatterEndpoint(withServerSocket);
      
      withRealClient.on('message', function(message) {
        withRealServer.sendMessage(message);
      });
      withRealServer.on('message', function(message) {
        withRealClient.sendMessage(message);
      });
    })
    
    server.close();
  })
  server.listen(listenPort);
}

main();


