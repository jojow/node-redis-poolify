var debug = require('debug')('redis-poolify');
var redis = require('redis');
var Pool = require('generic-pool').Pool;

/**
 * Inspired by: http://goo.gl/pDed8N
 *
 * When a client emits an 'end' event, throw it away immediately
 * and replace it with a new client.
 */
var replaceClientAsNecessary = function(client) {
  // Replacement wrappers for client functions, used to keep track of the
  // subscriptions without relying on existing client internals.
  var psubscribe = function() {
    for (var i = 0, l = arguments.length; i < l; i++) {
      if (typeof arguments[i] === 'string') {
        this._psubscriptions[arguments[i]] = true;
      }
    }
    this._psubscribe.apply(this, arguments);
  };
  var punsubscribe = function() {
    for (var i = 0, l = arguments.length; i < l; i++) {
      if (typeof arguments[i] === 'string') {
        delete this._psubscriptions[arguments[i]];
      }
    }
    this._punsubscribe.apply(this, arguments);
  };
  var subscribe = function() {
    for (var i = 0, l = arguments.length; i < l; i++) {
      if (typeof arguments[i] === 'string') {
        this._subscriptions[arguments[i]] = true;
      }
    }
    this._subscribe.apply(this, arguments);
  };
  var unsubscribe = function() {
    for (var i = 0, l = arguments.length; i < l; i++) {
      if (typeof arguments[i] === 'string') {
        delete this._subscriptions[arguments[i]];
      }
    }
    this._unsubscribe.apply(this, arguments);
  };

  // Keep track of subscriptions/unsubscriptions ourselves, rather than
  // rely on existing client internals.
  client._psubscriptions = {};
  client._subscriptions = {};

  // Put the replacement functions in place.
  client._psubscribe = client.psubscribe;
  client.psubscribe = psubscribe;
  client._punsubscribe = client.punsubscribe;
  client.punsubscribe = punsubscribe;
  client._subscribe = client.subscribe;
  client.subscribe = subscribe;
  client._unsubscribe = client.unsubscribe;
  client.unsubscribe = unsubscribe;

  /**
   * Do the actual work of replacing a Redis client.
   *
   * @param {RedisClient} client
   *   A RedisClient instances from the 'redis' package.
   */
  function replace(client) {
    var subscriptions = Object.keys(client._subscriptions);
    var psubscriptions = Object.keys(client._psubscriptions);
    // Ensure that all connection handles are definitely closed and stay that way.
    client.closing = true;
    client.end();
    // Replace the client.
    client = redis.createClient(client.port, client.host, client.options);
    replaceClientAsNecessary(client);

    // Resubscribe where needed.
    if (subscriptions.length) {
      client.subscribe.apply(client, subscriptions);
    }
    if (psubscriptions.length) {
      client.psubscribe.apply(client, psubscriptions);
    }
  }

  // Set the replacement function to be called when needed, to replace
  // the client on unexpected events.
  var listener = function() {
  
  };

  client.once('end', listener);

  client._destroy = function() {
    client.removeListener('end', listener);

    client.quit();
  };
};



var poolId = function(config) {
  return config.host + ':' + config.port + ':' + config.db;
};



var RedisPool = function(spec) {
  debug('new instance of RedisPool');

  var obj = {};

  var pools = {};
  
  var makePool = function(config) {
    config = config || {};
    config.host = config.host || 'localhost';
    config.port = config.port || 6379;
    config.db = config.db || 0;
    config.options = config.options || {};
    config.options.detect_buffers = config.options.detect_buffers || true;
    config.pool = config.pool || {};

    var pool = Pool({
      name: poolId(config),
      create: function(callback) {
        var client = redis.createClient(config.port, config.host, config.options);     

        replaceClientAsNecessary(client);

        client.on('connect', function() {
          client.send_anyway = true;
          client.select(config.db, function(err) {
            if (err) throw err;
          });
          client.send_anyway = false;
        });

        client.on('error', function(err) {
          //if (err) throw err;
          console.error(err);
        });

        return callback(null, client);
      },
      destroy: function(client) {
        //return client.quit();
        return client._destroy();
      },
      // Maximum number of concurrent clients
      max: config.pool.max || 1,
      // Minimum number of connections ready in the pool
      // If set, then make sure to drain() on process shutdown
      min: config.pool.min || 0,
      // How long a resource can stay idle before being removed
      idleTimeoutMillis: config.pool.idleTimeoutMillis || 30*1000,
      reapIntervalMillis: config.pool.reapIntervalMillis || 1*1000,
      // Use console.log if true, but it can also be function (message, level, debug)
      log: config.pool.log || debug
    });

    // If a minimum number of clients is set, then process.exit() can hang
    // unless the following listener is set.
    process.on('exit', function() {
      pool.drain(function() {
        pool.destroyAllNow();
      });
    });

    return pool;
  };

  obj.acquire = function(config, callback) {
    var id = poolId(config);

    if (!pools[id]) {
      pools[id] = makePool(config);
    }

    pools[id].acquire(callback);
  };

  obj.release = function(config, client) {
    var id = poolId(config);

    pools[id] && pools[id].release(client);
  };

  return obj;
};

module.exports = RedisPool;
