const io = require('socket.io-client');
const util = require('util');
const EventEmitter = require('events').EventEmitter;
const MAGIC = 'VT01';

function Connection(uri) {
    EventEmitter.call(this);

    this.socket = io(uri, {
        transports: ['websocket'],
        autoConnect: false
    });

    this.socket.on('connect', () => {
        this.emit('connect');
    });

    this.socket.on('disconnect', () => {
        this.emit('disconnect');
    });

    this.socket.on('error', (error) => {
        this.emit('error', error);
    });

    this.socket.on('data', (data) => {
        this._readPacket(data);
    });
}

util.inherits(Connection, EventEmitter);

Connection.prototype.connect = function() {
    this.socket.connect();
};

Connection.prototype.disconnect = function() {
    this.socket.disconnect();
};

Connection.prototype.destroy = function() {
    this.socket.disconnect();
    this.socket = null;  // Optionally nullify the socket instance
};

Connection.prototype.setTimeout = function(timeout, callback) {
    if (this._timeout) {
        clearTimeout(this._timeout);
    }
    this._timeout = setTimeout(() => {
        this.socket.disconnect();
        if (callback) {
            callback(new Error('Connection timeout'));
        }
    }, timeout);
    // Reset the timeout on any data received
    this.socket.on('data', () => {
        clearTimeout(this._timeout);
        this._timeout = setTimeout(() => {
            this.socket.disconnect();
            if (callback) {
                callback(new Error('Connection timeout'));
            }
        }, timeout);
    });
};

Connection.prototype.removeAllListeners = function() {
    this.removeAllListeners();
    // Remove listeners from the socket as well
    this.socket.removeAllListeners();
};

Connection.prototype.send = function(data) {
    if (this.sessionKey) {
        data = require('steam-crypto').symmetricEncrypt(data, this.sessionKey);
    }

    var buffer = Buffer.alloc(4 + 4 + data.length);
    buffer.writeUInt32LE(data.length, 0);
    buffer.write(MAGIC, 4);
    data.copy(buffer, 8);

    this.socket.emit('data', buffer);
};

Connection.prototype._readPacket = function(data) {
    if (!this._packetLen) {
        var header = data.slice(0, 8);
        this._packetLen = header.readUInt32LE(0);
    }

    var packet = data.slice(8, 8 + this._packetLen);

    if (packet.length !== this._packetLen) {
        this.emit('debug', 'incomplete packet');
        return;
    }

    delete this._packetLen;

    if (this.sessionKey) {
        packet = require('steam-crypto').symmetricDecrypt(packet, this.sessionKey);
    }

    this.emit('packet', packet);
};

module.exports = Connection;
