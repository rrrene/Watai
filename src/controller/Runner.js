var webdriver = require('selenium-webdriverjs'),
	promises = require('q'),
	growl;
try {
	growl = require('growl');
} catch (e) {
	growl = false;
}
	
var logger = require('winston').loggers.get('suites');


var Runner = new Class( /** @lends Runner# */ {

	Extends: require('events').EventEmitter,

	Binds: [	// methods listed here will be automatically bound to the current instance
		'startNextFeature',
		'isReady',
		'onReady',
		'start'
	],

	/** A hash mapping all failed features to their reasons for rejection.
	*If empty, the run was successful.
	*@type	{Object.<Feature, String>}
	*@private
	*/
	failures: Object.create(null),
	
	/** The list of all features to evaluate with this configuration.
	*@type	{Array.<Feature>}
	*@private
	*/
	features: [],
	
	/** Index of the currently evaluated feature.
	*@type	{integer}
	*@private
	*/
	currentFeature: 0,

	/** Whether the baseURL page has been loaded or not.
	*@type	{Boolean}
	*@private
	*/
	ready: false,

	/** The promise controller (deferred object) for results, resolved when all features of this Runner have been evaluated.
	*@type	{q.deferred}
	*@private
	*/
	deferred: null,


	/**@class	Manages a set of features and the driver in which they are run.
	*
	* A `Runner` is mostly set up through a configuration object.
	* Such an object should contain the following items:
	*	- `baseURL`: the URL at which the driver should start;
	*	- `driverCapabilities`: an object that will be passed straight to the WebDriver instance.
	*
	*@constructs
	*@param	{Object}	config	A configuration object, as defined above.
	*@see	WebDriver.Builder#withCapabilities
	*/
	initialize: function init(config) {
		if (this.error = this.findConfigError(config))
			throw this.error;	// `this` scoping is here just to avoid leaking, no usage for it

		this.config = config;
		
		this.initDriver();
	},

	/** Checks the passed configuration hash for any missing mandatory definitions.
	*
	*@param	{Object}	config	The configuration object to check (may not be defined, which will return an error).
	*@return	{Error|null}	An error object describing the encountered problem, or `null` if no error was found.
	*@see	#initialize	For details on the configuration object.
	*/
	findConfigError: function findConfigError(config) {
		if (! config)
			return new Error('You need to provide a configuration to create a Runner!');

		if (typeof config.seleniumServerURL != 'string')
			return new Error('The given Selenium server URL ("' + config.seleniumServerURL + '") is unreadable');

		if (typeof config.baseURL != 'string')
			return new Error('The given base URL ("' + config.baseURL + '") is unreadable');

		return null;
	},

	/** Initializes the underlying driver of this Runner.
	*@return	this	For chainability.
	*@private
	*/
	initDriver: function initDriver() {
		this.ready = false;
		this.driver = this.buildDriverFrom(this.config);
		this.loadBaseURL();
		return this;
	},

	/** Navigates to the base page for this runner.
	*@private
	*/
	loadBaseURL: function loadBaseURL() {
		this.driver.get(this.config.baseURL).then(this.onReady);
	},

	/** Constructs a new WebDriver instance based on the given configuration.
	*
	*@param	{Object}	config	The configuration object based on which the driver will be built.
	*@return	{WebDriver}	The matching WebDriver instance.
	*@see	#initialize	For details on the configuration object.
	*@private
	*/
	buildDriverFrom: function buildDriverFrom(config) {
		var result = new webdriver.Builder()
						.usingServer(config.seleniumServerURL)
						.withCapabilities(config.driverCapabilities)
						.build();

		result.manage().timeouts().implicitlyWait(config.timeout * 1000);	// implicitly wait for an element to appear, for asynchronous operations

		return result;
	},

	/** Tells whether the underlying driver of this Runner has loaded the base page or not.
	* This changes after the `ready` event has been emitted by this Runner.
	*
	*@return	{Boolean}	`true` if the page has been loaded, `false` otherwise.
	*/
	isReady: function isReady() {
		return this.ready;
	},

	/** Emits the "ready" event and updates this runner's status.
	*@private
	*/
	onReady: function onReady() {
		this.ready = true;
		this.emit('ready');
	},
	
	/** Adds the given Feature to the list of those that this Runner will evaluate.
	*
	*@param	{Feature}	feature	A Feature for this Runner to evaluate.
	*@return	This Runner, for chaining.
	*/
	addFeature: function addFeature(feature) {
		this.features.push(feature);
		
		return this;
	},
	
	/** Returns the WebDriver instance this Runner created for the current run.
	*
	*@return	WebDriver
	*/
	getDriver: function getDriver() {
		return this.driver;
	},
	
	/** Evaluates all features added to this Runner.
	*
	*@returns	{Promise}	A promise for results, resolved if all features pass (param: this Runner), rejected otherwise (param: hash mapping failed features to their reasons for rejection, or an Error if an error appeared in the runner itself or the evaluation was cancelled).
	*@see	#addFeature
	*/
	run: function run() {
		this.deferred = promises.defer();
		if (this.ready) {
			this.start();
		} else {
			this.once('ready', this.start);

			if (this.driver)
				this.loadBaseURL();
			else
				this.initDriver();
		}
		
		return this.deferred.promise;
	},

	/** Actually starts the evaluation process.
	*@private
	*/
	start: function start() {
		this.failures = Object.create(null);
		this.currentFeature = -1;

		this.startNextFeature();
	},

	/** Increments the feature index, starts evaluation of the next feature, and quits the driver if all features were evaluated.
	*
	*@private
	*/
	startNextFeature: function startNextFeature() {
		this.currentFeature++;
		
		if (this.ready
			&& this.currentFeature < this.features.length)
			this.evaluateFeature(this.features[this.currentFeature]);
		else
			this.finish();
	},
	
	/** Prepares and triggers the evaluation of the given feature.
	*
	*@private
	*/
	evaluateFeature: function evaluateFeature(feature) {
		try {
			feature.test().then(this.handleFeatureResult.bind(this, feature, true),
								this.handleFeatureResult.bind(this, feature)); // leave last arg to pass failure description
		} catch (error) {
			if (growl)
				growl('Error!\n' + error, { priority: 4 });
			this.driver.quit();
			throw error;
		}
	},
	
	/** Callback handler upon feature evaluation.
	* Displays result, errors if there were any, and calls the `startNextFeature` handler.
	*
	*@private
	*
	*@see	#startNextFeature
	*/
	handleFeatureResult: function handleFeatureResult(feature, message) {
		var symbol,
			loggerMethod;
		if (message === true) {
			symbol = '✔';
			loggerMethod = 'info';
		} else {
			if (message.errors.length > 0) {
				symbol = '⚠';
				loggerMethod = 'error';
			} else {
				symbol = '✘';
				loggerMethod = 'warn';
			}

			this.failures[feature] = message;

			this.showFailureDetails(message);
			this.failed = true;
		}

		logger[loggerMethod](symbol + '	' + feature.description);
		
		this.startNextFeature();
	},

	/** Presents details of a test failure / error to the user.
	*
	*@param	{Object.<Array.<String>>}	A hash with two keys containing arrays of strings giving details on failures. One key is `failures` (reasons for test rejection), the other `errors` (reasons for impossibility to evaluate test).
	*@private
	*/
	showFailureDetails: function showFailureDetails(report) {
		if (report.errors.length > 0)
			report.errors.forEach(logger.debug);
		
		if (report.failures.length > 0)
			report.failures.forEach(logger.debug);
	},
	
	/** Informs the user of the end result and cleans up everything after tests runs.
	*
	*@param	{Boolean}	success	Whether all features succeeded or not.
	*@private
	*/
	finish: function finish(success) {
		if (growl) {
			if (Object.getLength(this.failures) > 0)
				growl('Test failed  :(', { priority: 4 });
			else
				growl('Test succeeded!  :)', { priority: 3 });
		}

		if (Object.getLength(this.failures) > 0) {
			this.deferred.reject(this.failures);
		} else {
			this.deferred.resolve(this);

			if (this.config.quit == 'on success')
				this.killDriver();
		}

		if (this.config.quit == 'always')
			this.killDriver();
	},

	/** Stops the current evaluation.
	*@return	this	For chainability.
	*/
	cancel: function cancel() {
		this.removeListener('ready', this.start);
		this.ready = false;
		this.deferred.reject(new Error('Evaluation was cancelled'));
		return this;	//TODO: should return a promise for cancellation, since the current evaluated feature won't be stopped
	},

	/** Quits the managed browser.
	*
	*@return	{Promise}	A promise resolved once the browser has been properly quit.
	*/
	killDriver: function killDriver() {
		var driver = this.driver;
		this.driver = null;
		this.ready = false;

		if (driver)
			return driver.quit();
		else
			return promises.fcall(function() {});	// normalize return type to a promise, so that it can safely be called even if the driver had already been quit
	}
});

module.exports = Runner;	// CommonJS export
