
var nconf = require('nconf'),	
	test = require('tape'),
	path = require('path'),
	zkConfig = {
		host: 'localhost', 
		port: 49181, 
		rootPath: '/wallace/test',
		name: 'nconf-zookeeper-tests'
	},
	zkClient = require('node-zookeeper-client').createClient(zkConfig.host + ':' + zkConfig.port + zkConfig.rootPath),
	NOOP = function(){};


test('creates store on nconf', function(t) {
	t.equal(typeof nconf.Zookeeper, 'undefined');
	require('../')
	t.equal(typeof nconf.Zookeeper, 'function');	
	t.end();
});

test('zkClient can connect to ZooKeeper', function(t) {	
	zkClient.once('connected', function() {
		t.pass('zkConfig connected');
		t.end();
	});
	zkClient.connect();
});

test('callback invoked on load request', function(t) {
	nconf.use('Zookeeper', zkConfig);
	nconf.load(function(data) {
		t.pass('got callback');
		t.end();
	});	
});

test('save writes data to ZooKeeper', function(t) {
	var expected = 'this is test data'
	nconf.set('test', expected);
	nconf.save(function() {
		t.pass('data saved according to nconf. Verifying...')
		zkClient.getData('/' + zkConfig.name, function(err, actual, stat) {
			actual = JSON.parse(actual.toString());
			t.equal(actual.test, expected, 'actual == expected');
			t.end();
		});		
	});
});

test('load refreshes store from ZooKeeper', function(t) {
	var data = nconf.get();
	data.refreshed = true;
	zkClient.setData('/' + zkConfig.name, new Buffer(JSON.stringify(data)), function(err, stat) {
		nconf.load(function(expected) {
			var actual = nconf.get();
			t.deepEqual(actual, expected, 'data successfully refreshed');
			t.end();
		});
	});
});

test('clear removes key from ZooKeeper', function(t) {
	nconf.clear('refreshed');
	nconf.save(function() {
		zkClient.getData('/' + zkConfig.name, function(err, actual, stat) {
			actual = JSON.parse(actual.toString());
			t.equal(actual.refreshed, undefined, 'actual.refreshed == undefined');			
			t.end();
		});	
	});
});

test('clear removes all from ZooKeeper', function(t) {
	nconf.clear();
	nconf.save(function() {
		zkClient.getData('/' + zkConfig.name, function(err, actual, stat) {
			actual = JSON.parse(actual.toString());
			t.deepEqual(actual, {}, 'actual == {}');			
			t.end();
		});	
	});
});

test('autoSave will automatically save data', function(t) {
	zkConfig.autoSave = 10;
	nconf.use('Zookeeper', zkConfig);
	nconf.load(function(data) {
		nconf.set('autoSave', zkConfig.autoSave);
		setTimeout(function() {
			zkClient.getData('/' + zkConfig.name, function(err, actual, stat) {
				actual = JSON.parse(actual.toString());
				t.equal(actual.autoSave, zkConfig.autoSave, 'actual.autoSave == autoSave');
				nconf.clear('autoSave');
				delete zkConfig.autoSave;
				t.end();
			});	
		}, zkConfig.autoSave);
	});
});

test('nconf will autoUpdate if asked to', function(t) {
	zkConfig.autoUpdate = true;
	nconf.use('Zookeeper', zkConfig);
	nconf.load(function(data) {
		nconf.set('updated', false);
		t.equal(nconf.get('updated'), false, 'not updated');
		var newData = nconf.get();
		newData.updated = true;
		zkClient.setData('/' + zkConfig.name, new Buffer(JSON.stringify(newData)), function(err, stat) {
			setTimeout(function() {
				t.equal(nconf.get('updated'), true, 'was updated');
				nconf.clear('updated');
				nconf.save(NOOP);
				t.end();
			},50);
		});
	});
});

test('onUpdated is called when data is updated', function(t) {
	zkConfig.autoUpdate = true;
	t.plan(2) // one for initial load and one for autoUpdate
	zkConfig.onUpdated = function(event) {
		t.pass('onUpdate was called');
	}
	nconf.use('Zookeeper', zkConfig);
	nconf.load(function(data) {
		zkClient.setData('/' + zkConfig.name, new Buffer('{}'), NOOP);
	});
});
