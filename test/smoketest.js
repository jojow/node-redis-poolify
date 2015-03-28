var chai = require('chai');
var expect = chai.expect;
chai.should();

var RedisPool = require('../');
var clientPool = RedisPool();
var config = {};



describe('RedisPool smoke test', function() {
  describe('#acquire()', function() {
    it('should acquire client instance, set value, and get value', function(done) {
      var key = 'foo';
      var value = 'bar';

      clientPool.acquire(config, function(err, client) {
        expect(err).to.not.exist;

        client.set(key, value, function(err, result) {
          expect(err).to.not.exist;

          client.get(key, function(err, result) {
            expect(err).to.not.exist;

            result.should.equal(value);

            clientPool.release(config, client);

            done();
          });
        });
      });
    });
  });

  describe('#release()', function() {
    it('should acquire and then release client instance', function(done) {
      clientPool.acquire(config, function(err, client) {
        expect(err).to.not.exist;

        clientPool.release(config, client);

        done();
      });
    });
  });
});
