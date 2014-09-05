nconf-zookeeper
===============

nconf storage engine for ZooKeeper

Usage
=====

```js
// example.js

var nconf = require('nconf');
require('nconf-zookeeper');

// function to use for update notifications
function onUpdated() {
	// apply configuration updates here
}

nconf.use('zookeeper', {
	host:'localhost',			// ZooKeeper host name
	port: '2181',				// ZooKeeper port
	rootPath: '/',				// Root path for storing nconf file in ZooKeeper
	name: 'nconf-zookeeper',	// name of file stored in ZooKeeper at `rootPath`

	autoSave: -1,				// number of milliseconds to wait before autosaving changes to ZooKeeper
								// this allows batching updates. disable by setting to less than 0.
								// Setting to 0 results in immediate saves. Be careful.

	autoUpdate: false,			// set to true to add a watcher to rootPath/name and auto reload 
								// the data when it is changed.

	onUpdated: onUpdated		// if defined, this method will be called when data has been loaded from the store
								// using this method combined with autoUpdate, your application can be notified when
								// the configuration store has changed
});

// nconf will not load data from an async source without a `load` being requested
nconf.load(function(storageData) {
	// nconf is now initialized with the data contained in 'storageData' from ZooKeeper
});

nconf.set('example:test', 3);
var example = nconf.get('example');

console.log(example.test); // 3

// nconf will not automatically persist data to ZooKeeper unless autoSave is enabled in nconf-zookeeper
nconf.save(function() {
	// data has now been persisted to ZooKeeper.
});
```