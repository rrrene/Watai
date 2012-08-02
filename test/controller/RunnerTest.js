var should = require('should'),
	promises = require('q'),
	TestRight = require('../helpers/subject'),
	config = require('../helpers/driver').config;


var subject;

describe('Runner', function() {
	describe('constructor', function() {
		it('should refuse to construct a runner with no config', function() {
			(function() {
				new TestRight.Runner();
			}).should.throw();
		});

		it('should refuse to construct a runner with no base URL', function() {
			(function() {
				new TestRight.Runner({
					seleniumServerURL: 'http://example.com'
				});
			}).should.throw();
		});

		it('should refuse to construct a runner with no Selenium Server URL', function() {
			(function() {
				new TestRight.Runner({
					baseURL: 'http://example.com'
				});
			}).should.throw();
		});

		it ('should not throw when constructing with proper config', function() {
			(function() {
				subject = new TestRight.Runner(config);
			}).should.not.throw();
		});

		it('should emit "ready" when ready', function(done) {
			this.timeout(config.browserWarmupTime);

			subject.isReady().should.not.be.ok;

			subject.once('ready', function() {
				subject.isReady().should.be.ok;
				done();
			});
		});
	});

	describe('driver', function() {
		it('should be defined after constructing a Runner', function() {
			should.exist(subject.getDriver());
		});
	});

	describe('run', function() {
		var callCount = 0,
			secondSubject;

		var feature = new TestRight.Feature('RunnerTest feature', [
			function() { callCount++ }
		], {}),
			failingFeature = new TestRight.Feature('RunnerTest failing feature', [
			function() { throw "It's a trap!" }
		], {});

		before(function() {
			secondSubject = new TestRight.Runner(config);
		});

		after(function() {
			secondSubject.killDriver();
		});


		it('should return a promise', function() {
			promises.isPromise(subject.run()).should.be.ok;
			subject.cancel();
		});

		it('should evaluate features once', function(done) {
			this.timeout(config.browserWarmupTime);
			subject.addFeature(feature);

			subject.run().then(function() {
				if (callCount == 1)
					done();
				else	// .should.equal simply does nothing?!
					done(new Error('Feature has been called ' + callCount + ' times instead of 1'));
			}, done);
		});

		it('should evaluate features once again if called again', function(done) {
			this.timeout(config.browserWarmupTime);
			subject.run().then(function() {
				if (callCount == 2)
					done();
				else	// .should.equal simply does nothing?!
					done(new Error('Feature has been called ' + callCount + ' times instead of 2'));
			}, done);
		});

		it('should run even if called immediately after init', function(done) {
			this.timeout(config.browserWarmupTime);

			secondSubject.addFeature(feature).run().then(function() {
				if (callCount == 3)
					done();
				else	// .should.equal simply does nothing?!
					done(new Error('Feature has been called ' + callCount + ' times instead of 3'));
			}, done);
		});

		it('with failing features should be rejected', function(done) {
			secondSubject.addFeature(failingFeature).run().then(function() {
				done(new Error('Resolved instead of rejected.'))
			}, function(failures) {
				should.equal(typeof failures, 'object');
				should.exist(failures[failingFeature]);
				done();
			});
		});
	});

	describe('cancellation', function() {
		it('should reject the evaluation with an error', function(done) {
			this.timeout(config.browserWarmupTime);

			var rejected = false;
			subject.run().then(function() { done(new Error('Resolved instead of rejected!')) },
							   function() { done() });
			subject.cancel();
		})
	});

	describe('driver kill', function() {
		it('should be idempotent when repeated', function(done) {
			subject.killDriver().then(function() {
				var result = subject.killDriver();
				result.then(done, done);
			}, done);
		});

		it('should not forbid a proper second run', function(done) {
			this.timeout(config.browserWarmupTime);

			subject.run().then(function() { done() }, done);
		});
	});

	describe('automatic quitting', function() {
		it('should not quit if set to "never"', function(done) {
			this.timeout(config.browserWarmupTime);

			subject.config.quit = 'never';
			subject.run().then(function() {
				should.exist(subject.driver);
				done();
			}, done).end();
		});

		it('should quit on success if set to "on success"', function(done) {
			this.timeout(config.browserWarmupTime);

			subject.config.quit = 'on success';
			subject.run().then(function() {
				should.not.exist(subject.driver);
				done();
			}, done).end();
		});

		it('should quit if set to "always"', function(done) {
			this.timeout(config.browserWarmupTime);

			subject.config.quit = 'always';
			subject.run().then(function() {
				should.not.exist(subject.driver);
				done();
			}, done).end();
		});
	})
});
