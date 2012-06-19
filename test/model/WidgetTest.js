var HookTest = require('./HookTest');


/** This test suite is redacted with [Mocha](http://visionmedia.github.com/mocha/) and [Should](https://github.com/visionmedia/should.js).
* It relies on some external setup, see `test/helpers` and `test/index.js`.
*/
describe('Widget', function() {
	var elements = {
		id:		{ id: 'toto' },
		css:	{ css: '.tutu' },
		missing:{ id: 'inexistant' },
		field:	{ css: 'input[name="field"]' }
	}
			
	describe('parsing', function() {
		var subject = new TestRight.Widget('Test widget', {
			elements: elements,
			submit: function submit(value) {
				this.field = value;
				return this.field.submit();
			}
		}, driver);
		
		it('should add all elements as properties', function() {
			for (var key in elements)
				if (elements.hasOwnProperty(key)
					&& key != 'missing')	// Should.js' property checker accesses the property, which would therefore make the missing element throw because it is unreachable
					subject.should.have.property(key);
		});
		
		it('should transform elements into hooks', function(done) {
			subject.id.getText().then(function(text) {
				text.should.equal('This paragraph has id toto');
				done();
			});
		});
		
		it('should bind methods properly', function(done) {
			subject.submit('something');
			
			subject.field.getAttribute('value').then(function(value) {
				value.should.equal('Default');	// because the page has been reloaded
				done();
			});
		});
	});
	
	describe('accesses', function() {
		it('should throw an error if an unreachable element is accessed', function() {
			(function() {
				subject.missing;
			}).should.throw();
		});
	});
});
