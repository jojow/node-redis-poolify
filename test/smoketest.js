var chai = require('chai');
chai.should();

var RedisPool = require('../');
var clientPool = new RedisPool();
var config = {};



describe('RedisPool', function() {
  describe('#acquire()', function() {
    it('should acquire client instance, set value, and get value', function() {
      clientPool.acquire(config, function(err, client) {
        if (err) throw err;

        client.set('foo', 'bar', function(err, result) {
          if (err) throw err;

          client.get('foo', function(err, result) {
            if (err) throw err;

            result.should.equal('bar');

            clientPool.release(config, client);
          });
        });
      });
    });
  });

  describe('#release()', function() {
    it('should acquire and then release client instance', function() {
      clientPool.acquire(config, function(err, client) {
        if (err) throw err;

        clientPool.release(config, client);
      });
    });
  });
});
