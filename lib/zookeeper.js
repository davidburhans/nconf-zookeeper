/* jshint node:true */
'use strict';

/*
 * zookeeper.js: ZooKeeper memory storage for nconf configurations
 * 
 * Based on: nconf/lib/stores/memory.js
 *
 */

var createClient = require('node-zookeeper-client').createClient,
    path = require('path'),
    NOOP = function(){},
    debug;

// debug should be an optional requirement
try {
  debug = require('debug')('nconf-zookeeper');  
} catch(_) {  
  debug = NOOP;
}

var common = {
  path: function (key) {
    return key == null ? [] : key.split(':');
  },
  key: function () {
    return Array.prototype.slice.call(arguments).join(':');
  }
}

//
// ### function Zookeeper (options)
// #### @options {Object} Options for this instance
// Constructor function for the Zookeeper nconf store which maintains
// a nested json structure based on key delimiters `:` and stores the
// resulting json in a file at options.name within zookeeper.
//
// e.g. `my:nested:key` ==> `{ my: { nested: { key: } } }`
// 
// #### @options {
//  host: <zookeeper host>
//  port: <zookeeper port>
//  rootPath: <root path on zookeeper> (/)
//  name: <name of file in which to store saved config in zookeeper> (nconf-zookeeper)
//  autoSave: <frequency with which to autosave in ms> (-1)
//  autoUpdate: <when true, attaches a watcher and retrieves data when changes are made> (false)
// }
//
var ZooKeeper = exports.Zookeeper = function (options) {
  options       = options || {};
  this.type     = 'zookeeper';
  this.store    = {};
  this.readOnly = false;
  this.name     = options.name || 'nconf-zookeeper';
  this.autoSave = options.autoSave || -1;
  this.autoUpdate = options.autoUpdate || false;

  function buildConnectionString(host, port, rootPath) {
    return path.join(host + ':' + port, rootPath);
  }
  if(!Array.isArray(options.host)) {
    options.host = [{ 
      host: options.host,
      port: options.port,
      rootPath : options.rootPath || '/'
    }];
  }
  var connectionString = options.host.map(function(opt) { return buildConnectionString(opt.host, opt.port, opt.rootPath); }).join(',');
  debug('connecting to ZooKeeper at %s', connectionString);
  this.client = createClient(connectionString);
  this.client.on('connected', this.onConnected.bind(this))
  this.client.on('error', this.onError.bind(this));
};

Object.defineProperty(ZooKeeper.prototype, 'file', {
  get: function() {
    return '/' + this.name;
  }
})

ZooKeeper.prototype.onConnected = function() {
  debug('ZooKeeper connected, retrieving %s', this.file);
  this.getData();
}

ZooKeeper.prototype.getData = function() {
  debug('retrieving file %s', this.file)
  if(this.autoUpdate === true) {
    debug('autoUpdate enabled, using watcher');
    this.client.getData(this.file, this.watcher.bind(this), this.gotData.bind(this));
    return;
  }
  this.client.getData(this.file, this.gotData.bind(this));
}

ZooKeeper.prototype.gotData = function(error, data, stat) {
  if(error) {
    this.onError(error);
    return;
  }
  if(data) {
    data = JSON.parse(data.toString());
    debug('ZooKeeper got data %o', data);
    this.store = data;
  }  
  if(this.dataCallback) {
    this.dataCallback(data);
    this.dataCallback = null;
  }
}

ZooKeeper.prototype.onError = function(error) {
  debug('got error %o', error)
  if(error.name == 'NO_NODE') {
    var that = this;
    debug('could not find %s, creating', that.file);
    this.client.mkdirp(that.file, function(error) {
      if(error) {
        throw error;        
      }
      debug('%s created, retrieving data', that.file);
      that.client.getData(that.file, that.gotData.bind(that));
    });
  }
}

ZooKeeper.prototype.watcher = function(event) {
  debug('got watcher event %s for %s', event.name, event.path);
  if (event.name === 'NODE_DATA_CHANGED') {
    this.getData();
  } 
  // else if(event.name === 'NODE_CREATED') {

  // } else if (event.name === 'NODE_DELETED') {

  // } else if(event.name === 'NODE_CHILDREN_CHANGED') {

  // }
}

//
// ### function load
// Passes the store managed by this instance to the provided callback
//
ZooKeeper.prototype.load = function (cb) {
  this.dataCallback = cb;
  debug('load requested. currently in %s state', this.client.state.name);
  if(this.client.state.name === 'DISCONNECTED') {
    debug('connecting client');
    this.client.connect();    
  } else if(/CONNECTED$/.test(this.client.state.name)) {
    this.getData();
  }
};

//
// ### function save
// saves the store managed by this instance to ZooKeeper and calls the provided callback when complete
//
ZooKeeper.prototype.save = function (cb) {
  debug('saving to ZooKeeper');
  this.client.setData('/' + this.name, new Buffer(JSON.stringify(this.store)), function(err, stat) {
    debug('saved data to ZooKeeper');
    cb(err);
  });
}

ZooKeeper.prototype._autoSave = function() {
  if(this.autoSave < 0) {
    return;
  }
  if(this.autoSave == 0) {
    debug('autoSave set to 0, immediate save triggered.')
    this.save(NOOP);
    return
  } 
  if(this.autoSaveTimeout) {
    clearTimeout(this.autoSaveTimeout);
    debug('cleared queued autoSave');
  }
  this.autoSaveTimeout = setTimeout(this.save.bind(this, NOOP), this.autoSave);
}

//
// ### function get (key)
// #### @key {string} Key to retrieve for this instance.
// Retrieves the value for the specified key (if any).
//
ZooKeeper.prototype.get = function (key) {
  var target = this.store,
      path   = common.path(key);

  //
  // Scope into the object to get the appropriate nested context
  //
  while (path.length > 0) {
    key = path.shift();
    if (target && target.hasOwnProperty(key)) {
      target = target[key];
      continue;
    }
    return undefined;
  }
  
  return target;
};

//
// ### function set (key, value)
// #### @key {string} Key to set in this instance
// #### @value {literal|Object} Value for the specified key
// Sets the `value` for the specified `key` in this instance.
//
ZooKeeper.prototype.set = function (key, value) {
  if (this.readOnly) {
    return false;
  }
  var target = this.store,
      path   = common.path(key);

  if (path.length === 0) {
    //
    // Root must be an object
    //
    if (!value || typeof value !== 'object') {
      return false;
    }
    else {
      this.reset();
      this.store = value;
      return true;
    }
  }

  //
  // Scope into the object to get the appropriate nested context
  //
  while (path.length > 1) {
    key = path.shift();
    if (!target[key] || typeof target[key] !== 'object') {
      target[key] = {};
    }

    target = target[key];
  }

  // Set the specified value in the nested JSON structure
  key = path.shift();
  target[key] = value;
  this._autoSave();
  return true;
};

//
// ### function clear (key)
// #### @key {string} Key to remove from this instance
// Removes the value for the specified `key` from this instance.
//
ZooKeeper.prototype.clear = function (key) {
  if (this.readOnly) {
    return false;
  }

  if(key) {
    var target = this.store,
        value  = target,
        path   = common.path(key);

    //
    // Scope into the object to get the appropriate nested context
    //
    for (var i = 0; i < path.length - 1; i++) {
      key = path[i];
      value = target[key];
      if (typeof value !== 'function' && typeof value !== 'object') {
        return false;
      }
      target = value;
    }

    // Delete the key from the nested JSON structure
    key = path[i];
    delete target[key];  
  } else {
    this.store = {};
  }
  
  this._autoSave();
  return true;
};

//
// ### function merge (key, value)
// #### @key {string} Key to merge the value into
// #### @value {literal|Object} Value to merge into the key
// Merges the properties in `value` into the existing object value
// at `key`. If the existing value `key` is not an Object, it will be
// completely overwritten.
//
ZooKeeper.prototype.merge = function (key, value) {
  if (this.readOnly) {
    return false;
  }

  //
  // If the key is not an `Object` or is an `Array`,
  // then simply set it. Merging is for Objects.
  //
  if (typeof value !== 'object' || Array.isArray(value) || value === null) {
    return this.set(key, value);
  }

  var self    = this,
      target  = this.store,
      path    = common.path(key),
      fullKey = key;

  //
  // Scope into the object to get the appropriate nested context
  //
  while (path.length > 1) {
    key = path.shift();
    if (!target[key]) {
      target[key] = {};
    }

    target = target[key];
  }

  // Set the specified value in the nested JSON structure
  key = path.shift();

  //
  // If the current value at the key target is not an `Object`,
  // or is an `Array` then simply override it because the new value
  // is an Object.
  //
  if (typeof target[key] !== 'object' || Array.isArray(target[key])) {
    target[key] = value;
    this._autoSave();
    return true;
  }

  var objs = Object.keys(value).every(function (nested) {
    return self.merge(common.key(fullKey, nested), value[nested]);
  });
  this._autoSave();
  return objs;
};

//
// ### function reset (callback)
// Clears all keys associated with this instance.
//
ZooKeeper.prototype.reset = function () {
  if (this.readOnly) {
    return false;
  }

  this.store  = {};
  this._autoSave();
  return true;
};

// we only care about nconf because its plugin api is silly
try {
  require('nconf').Zookeeper = ZooKeeper;
} catch(_) {
  debug('error loading nconf, don\'t care');
}