#! /usr/bin/env nodejs
var zk = require('node-zookeeper-client'),
	path = require('path'),
	zkClient = zk.createClient('localhost:49181/'),
	method = 'getChildren',
	args = [];

console.log(process.cwd(), __dirname)

function cb(err, data) {
	// console.log('ran', method,'with', args.slice(0, -1));

	if(err) {
		console.log("ERROR:", err);
		return;
	}
	console.log(Buffer.isBuffer(data) ? data.toString() : data);
	process.exit();
}
if(process.argv.length > 3) {
	method = process.argv[2];
	args = Array.prototype.slice.call(process.argv, 3);
} else {
	args = Array.prototype.slice.call(process.argv, 2);
}
if((args.length === 0 && method !== 'getChildren') || args.length > 0) {
	args.push(cb);
	args = args.map(function(arg) {
		if(arg === 'null') { 
			return null;
		}
		return arg;
	});
	zkClient.on('connected', function() {
		zkClient[method].apply(zkClient, args);
	});

	zkClient.connect();
} else {
	console.log('provide a directory to list');
}


