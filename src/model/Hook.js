var promises = require('q');

/** Mapping from short selector types to WebDriver's fully qualified selector types.
*
*@see	{@link http://code.google.com/p/selenium/wiki/JsonWireProtocol#POST_/session/:sessionId/element|JsonWire sessionId}
*/
var WATAI_SELECTOR_TYPES_TO_WEBDRIVER_TYPES = {
	css		: 'css selector',
	xpath	: 'xpath',
	a		: 'partial link text',
	linkText: 'link text',
	id		: 'id',
	name	: 'name',
	'class'	: 'class name',
	tag		: 'tag name'
}

/** Default Watai selector type
*
*@type	{String}
*/
var DEFAULT_SELECTOR_TYPE = 'css';

/**@class	A Hook allows one to target a specific element on a web page.
* It is a wrapper around both a selector and its type (css, xpath, id…).
*
*@param	{Object}	hook	A single value-pair hash whose key may be one of `css`, `id`, or any other value of Selenium's `By` class; and whose value must be a string of the matching form.
*@param	{WebDriver}	driver	The WebDriver instance in which the described elements are to be sought.
*/
var Hook = function Hook(hook, driver) {
	if (typeof hook == 'string') {
		this.type = DEFAULT_SELECTOR_TYPE;
		this.selector = hook;
	} else {
		this.type = Object.getOwnPropertyNames(hook)[0]
		this.selector = hook[this.type];
	}

	this.driver = driver;

	/** Returns the element this hook points to in the given driver, as an object with all WebDriver methods.
	*
	*@see	{@link http://seleniumhq.org/docs/03_webdriver.html|WebDriver}
	*@private
	*/
	this.toSeleniumElement = function toSeleniumElement() {
		return this.driver.element(WATAI_SELECTOR_TYPES_TO_WEBDRIVER_TYPES[this.type] || this.type, this.selector);
	}

	/** Sends the given sequence of keystrokes to the element pointed by this hook.
	*
	*@param	{String}	input	A string that will be sent to this element.
	*@returns	{QPromise}	A promise, resolved when keystrokes have been received, rejected in case of a failure.
	*@see	{@link http://seleniumhq.org/docs/03_webdriver.html#sendKeys|WebDriver.sendKeys}
	*@private
	*/
	this.handleInput = function handleInput(input) {
		var element;

		return this.toSeleniumElement().then(function(elm) {
			element = elm;
			return elm.clear();
		}).then(function() {
			return element.type(input);
		}).then(function() {
			return element;	// allow easier chaining
		});
	}
}

/** Adds a getter and a setter to the given Object, allowing access to the Selenium element corresponding to the given hook description.
* The getter dynamically retrieves the Selenium element pointed at by the given selector description.
* The setter will pass the value to the `Hook.handleInput` method.
*
*@param	{Object}	target			The Object to which the getter and setter will be added.
*@param	{String}	key				The name of the property to add to the target object.
*@param	{Object}	typeAndSelector	A hook descriptor, as defined in the Hook constructor.
*@param	{WebDriver}	driver			The WebDriver instance in which the described elements are to be sought.
*/
Hook.addHook = function addHook(target, key, typeAndSelector, driver) {
	var hook = new Hook(typeAndSelector, driver);

	var inputHandler = function handleInputAndEmit(input) {
		target.emit('action', key, 'write', [ input ]);

		return hook.handleInput(input);
	}

	var propertyDescriptor = {};

	propertyDescriptor[key] = {
		get: function() {
			target.emit('access', key);
			return hook.toSeleniumElement(hook);
		},
		set: inputHandler	// TODO: remove in v0.7, deprecated since v0.6
	};

	Object.defineProperties(target, propertyDescriptor);

	var setterName = 'set' + key.capitalize();

	target[setterName] = function(input) {	// wrapping to allow call-like syntax in scenarios
		var setter = inputHandler.bind(null, input);

		setter.widget = target;
		setter.reference = setterName;
		setter.title = setterName.humanize();
		setter.args = [ input ];

		return setter;
	};
}

module.exports = Hook;	// CommonJS export
