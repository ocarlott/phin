"use strict";

const realHttp = require("http"),
https = require("https"),
url = require("url"),
qs = require("querystring"),
zlib = require("zlib"),
util = require("util");

/**
 * @typedef Options Request options.
 * @type {Object}
 * @property {String} url The URL of the server to send a request to.
 * @property {Boolean=} compressed Compress the request. Will overwrite the 'Accept-Encoding' header. Defaults to 'false'.
 * @property {String=} protocol 'http:' or 'https:'. Inferred from the URL if not present.
 * @property {String=} hostname A domain name or IP address of the server to issue the request to. Inferred from the URL if not present.
 * @property {Number=} port The port to send the request to. Defaults to 80 on HTTP and 443 on HTTPS.
 * @property {String=} localAddress Local interface to bind for network connections.
 * @property {String=} socketPath Unix Domain Socket (use one of host:port or socketPath).
 * @property {String=} method The request method (ex. GET, POST, etc.). Defaults to "GET".
 * @property {String=} path Request path. Inferred from the URL if not present.
 * @property {Object=} headers An object with request headers.
 * @property {String=} auth Basic authentication (ex. ethan:letmein). Inferred from the URL if not present.
 * @property {Number=} timeout The socket timeout, in milliseconds.
 * @property {(Buffer|Object)=} data The data to send to the client. JSON.stringify is automatically called on objects when the 'Content-Type' or 'content-type' header is 'application/json' and querystring.stringify is called on objects when the 'Content-Type' or 'content-type' header is 'x/www-url-form-encoded'.
 */

/**
 * @typedef IncomingMessage The incoming message from the server.
 * @type {Object}
 * @property {Buffer} body The data sent by the server.
 * @property {Object} headers Response headers.
 * @property {String} httpVersion HTTP version being used.
 * @property {Object} rawHeaders The raw request/response headers list exactly as they were received.
 * @property {String[]} rawTrailers The raw request/response trailer keys and values exactly as they were received.
 * @property {net.Socket} socket The [net.Socket]{@link https://nodejs.org/api/net.html#net_class_net_socket} object associated with the connection.
 * @property {Number} statusCode The 3-digit HTTP response status code (eg. 404).
 * @property {String} statusMessage The HTTP response status message (ex. OK, Internal Server Error).
 * @property {{String:String}} trailers The request/response trailers object.
 */

/**
 * @callback PhinCallback Called when data is recieved from server.
 * @param {Error} err An error that occured. Not present if no error occured.
 * @param {IncomingMessage} res The response from the server.
 */

/**
 * Sends a request to a server.
 * @param {Options|String} opts Request options or URL.
 * @param {PhinCallback} cb Called when data is recieved from server.
 */
const phin = (opts, cb, http) => {
	if (typeof(opts) !== "string" && !opts.hasOwnProperty("url")) {
		throw new Error("Missing url option from options for request method.");
	}

	var addr;
	if (typeof opts === "object") {
		addr = url.parse(opts.url);
	} else {
		addr = url.parse(opts);
	}
	var options = {
		"hostname": addr.hostname,
		"port": addr.protocol.toLowerCase() === "http:" ? 80 : 443,
		"path": addr.path,
		"method": "GET",
		"headers": { },
		"auth": (addr.auth || null)
	};

	if (typeof opts === "object") {
		options = Object.assign(options, opts);
	}
	options.port = Number(options.port);

	if (options.compressed) {
		options.headers["accept-encoding"] = "gzip, deflate";
	}

	var req;
	const resHandler = (res) => {
		var stream = res;
		if (options.compressed) {
			if (res.headers["content-encoding"] === "gzip") {
				stream = res.pipe(zlib.createGunzip());
			} else if (res.headers["content-encoding"] === "deflate") {
				stream = res.pipe(zlib.createInflate());
			}
		}
		res.body = new Buffer([]);
		stream.on("data", (chunk) => {
			res.body = Buffer.concat([res.body, chunk]);
		});
		stream.on("end", () => {
			if (cb) {
				cb(null, res);
			}
		});
	};

	// Dependency injection for testing

	http = http || realHttp;

	switch (addr.protocol.toLowerCase()) {
		case "http:":
			req = http.request(options, resHandler);
			break;
		case "https:":
			req = https.request(options, resHandler);
			break;
		default:
			const err = new Error("Invalid / unknown address protocol. Expected HTTP or HTTPS.");
			if (cb) {
				cb(err);
			}
			return;
	}

	req.on("error", (err) => {
		if (cb) {
			cb(err);
		}
	});

	if (opts.hasOwnProperty("data")) {
		var postData = opts.data;
		if (!(opts.data instanceof Buffer) && typeof opts.data === "object") {
			const contentType = options.headers["Content-Type"] || options.headers["content-type"];
			if (contentType === "application/json") {
				postData = JSON.stringify(opts.data);
			} else if (contentType === "x/www-url-form-encoded") {
				postData = qs.stringify(opts.data);
			} else {
				const err2 = new Error("opts.data was passed in as an object, but the \"Content-Type\" (or \"content-type\") header was not \"application/json\" or \"x/www-url-form-encoded\".");
				if (cb) {
					cb(err2);
				}
			}
		}
		req.write(postData);
	}
	req.end();
};

// If we're running Node.js 8+, let's promisify it

if (util.promisify) {
	phin[util.promisify.custom] = (opts, http) => {
		return new Promise((resolve, reject) => {
			phin(opts, (err, res) => {
				if (err) {
					reject(err);
				} else {
					resolve(res);
				}
			}, http);
		});
	};
}

module.exports = phin;