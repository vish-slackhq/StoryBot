// Command line args
var argv = require('minimist')(process.argv.slice(2));
// variable to contain the .env file for this session
// Defaults to .env
var config_file = '.env';

// Or can be specified with -c your_file.env
if (argv.c) {
	config_file = argv.c;
}
console.log('<Loading> Config file is', config_file);

// Config file
require('dotenv').config({
	path: `${config_file}`
});

//Load the appropriate config file from Google Sheets
var scriptConfig = require('./load-conf-google');
var triggerKeys = [];
var callbackData = [];

scriptConfig.loadConfig().then((result) => {
	triggerKeys = Object.keys(result);

	// If we're specifying dynamic callbacks in this config
	if (result.Callbacks) {
		result.Callbacks.forEach(function(callback) {
			callbackData.push(callback.callback_name);
		});
	}
	console.log('<Loading> Loaded config for keys:', triggerKeys, 'and Callbacks are:', callbackData);
});

// Express app server
const http = require('http');
const express = require('express');

// Require Slack Node SDK web client
const {
	createMessageAdapter
} = require('@slack/interactive-messages');
const {
	createEventAdapter,
	verifyRequestSignature
} = require('@slack/events-api');

// An access token (from your Slack app or custom integration - xoxp, xoxb, or xoxa)
//const token = process.env.SLACK_BOT_TOKEN;

// Create the adapter using the app's verification token, read from environment variable
const slackInteractions = createMessageAdapter(process.env.SLACK_SIGNING_SECRET);
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);

// Initialize an Express application
// NOTE: You must use a body parser for the urlencoded format before attaching the adapter
const app = express();

// Attach the adapter to the Express application as a middleware
app.use('/slack/actions', slackInteractions.expressMiddleware());
// Mount the event handler on a route
app.use('/slack/events', slackEvents.expressMiddleware());

// Set up the Storybot tools - where the magic happens
const storyBotTools = require('./storytools.js');

// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
slackEvents.on('message', (event) => {
	//	console.log(`Received a message event: user ${event.user} in channel ${event.channel} says ${event.text}`);
	//	console.log('INCOMING MESSAGE EVENT: ',event);

	if (event.type === 'message' && (!event.subtype || event.subtype === 'bot_message')) { //&& !event.bot_id) {
		// Matched a trigger from a user so playback the story
		//	if (triggerKeys.indexOf(event.text) >= 0) {
		let indexMatch = indexOfIgnoreCase(triggerKeys, event.text);
		if (indexMatch >= 0) {
			storyBotTools.playbackScript(scriptConfig.config[triggerKeys[indexMatch]], scriptConfig.config.Tokens, event);
			//	storyBotTools.playbackScript(scriptConfig.config[event.text], scriptConfig.config.Tokens, event);
		}
	}
});

// Listen for reaction_added event
slackEvents.on('reaction_added', (event) => {
	//	console.log('INCOMING REACTION EVENT: ',event);
	// Put a :skull: on an item and the bot will kill it dead (and any threaded replies)
	if (event.reaction === 'skull') {
		storyBotTools.deleteItem(event.item.channel, event.item.ts);
	} else {
		// Allow reacjis to trigger a story but WARNING this can be recursive right now!!!!
		// Use a unique reacji vs one being used elsewhere in the scripts
		if (triggerKeys.indexOf(':' + event.reaction + ':') >= 0) {

			let reaction_event = {
				channel: event.item.channel,
				ts: event.item.ts,
				text: ':' + event.reaction + ':',
				reaction: event.reaction
			};

			storyBotTools.playbackScript(scriptConfig.config[reaction_event.text], scriptConfig.config.Tokens, reaction_event);
		}
	}
});

// Handle errors (see `errorCodes` export)
slackEvents.on('error', console.error);

//slackInteractions.action('callback_admin_menu', storyBotTools.adminCallback);
slackInteractions.action('callback_admin_menu', (payload, respond) => {
	//	console.log('OK heres what we have', payload);

	switch (payload.actions[0].value) {
		case 'Triggers':

			{
				if (triggerKeys.length > 0) {
					let attachments = [];
					let key_list = ""
					triggerKeys.forEach(function(key) {
						if (!(key === 'Tokens' || key === 'Channels' || key === 'Callbacks')) {
							key_list = key_list + " \`" + key + "\`";
						}
					});

					attachments.push({
						fields: [{
							value: key_list,
							short: false
						}],
						title: "These are the triggers for the story:",
						mrkdwn_in: ['text', 'fields']
					});

					//		console.log('<DEBUG><Admin Menu> Triggers response is', attachments);
					respond({
						response_type: 'ephemeral',
						replace_original: true,
						attachments: attachments
					}).catch((err) => {
						console.error('<Error><Admin Menu><Triggers>', err);
					});
				}
				break;
			}
		case 'Reload Config':
			{
				// callbackData = [];
				scriptConfig.loadConfig().then((result) => {
					triggerKeys = Object.keys(result);

					// If we're specifying dynamic callbacks in this config
					if (result.Callbacks) {
						result.Callbacks.forEach(function(callback) {
							callbackData.push(callback.callback_name);
						});
					}
					console.log('<Re-Loading> Loaded config for keys:', triggerKeys, 'and Callbacks are:', callbackData);

					console.log('<Re-Loading>re-validating Bot Connection / building channel list');
					storyBotTools.validateBotConnection();

				});

				respond({
					text: "OK! I'm re-loading!",
					response_type: 'ephemeral',
					replace_original: true
				}).catch((err) => {
					console.error('<Error><Admin Menu><Reload Config>', err);
				});
				break;
			}
		case 'Create Channels':
			{
				console.log('<Debug><Creating Channels>');
				storyBotTools.createChannels(scriptConfig.config.Channels);

				respond({
					text: "Creating channels now",
					response_type: 'ephemeral',
					replace_original: true
				}).catch((err) => {
					console.error('<Error><Admin Menu><Create Channels>', err);
				});
				break;
			}
		default:
			{
				storyBotTools.adminCallback(payload, respond);
				break;
			}
	}
});

slackInteractions.action('callback_history_cleanup', storyBotTools.historyCleanup);


slackInteractions.action(/callback_/, (payload, respond) => {

	if (callbackData.indexOf(payload.callback_id) >= 0) {
		//		console.log('<Callback> DEBUG: matched callback for with ', payload.callback_id);
		storyBotTools.callbackMatch(payload, respond, scriptConfig.config.Callbacks.find(o => o.callback_name == payload.callback_id));
	} else {
		console.log('<Callback> No match in the config for', payload.callback_id);
	}

});


////Secrets secrets are no fun
const bodyParser = require('body-parser');
const crypto = require('crypto');

app.use(bodyParser.urlencoded({
	extended: false,
	verify: function(req, res, body) {
		req.rawBody = body.toString();
	}
}));
app.use(bodyParser.json());

app.post('/slack/commands', function(req, res) {

	const timeStamp = req.headers['x-slack-request-timestamp'];
	const slashSig = req.headers['x-slack-signature'];
	const reqBody = JSON.stringify(req.body);
	const baseString = `v0:${timeStamp}:${req.rawBody}`;

	const hmac = crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET);
	JSON.stringify(hmac.update(baseString));
	const mySignature = `v0=${hmac.digest(`hex`)}`;

	//console.log('My signature I generated is', mySignature);

	if (mySignature == slashSig) {
		console.log(`Success
        Signature: ${mySignature}`);
	} else {
		console.log(`SIGNATURES DO NOT MATCH
         Expected: ${mySignature}
         Actual: ${slashSig}`);
	}

	/*
		verifyRequestSignature(
			process.env.SLACK_SIGNING_SECRET,
			req.headers['x-slack-signature'].toString(),
			req.headers['x-slack-request-timestamp'].toString());
	*/
	const {
		//	token,
		command
	} = req.body;

	console.log('<Slash Command> Received command', command);
	//	if (token === process.env.SLACK_VERIFICATION_TOKEN) {
	// respond immediately!
	res.status(200).end();

	if (req.body.command === '/storybot') {
		storyBotTools.adminMenu(req.body);
	} else {
		console.error('<Slash Command> No matching command');
	}
	/*	} else {
			console.error('<Slash Command> Invalid Verification token. Received:', token, 'but wanted', process.env.SLACK_VERIFICATION_TOKEN);
			//Bad token
			res.sendStatus(500);
		}*/
});

app.get('/', (req, res) => {
	res.send('<h2>StoryBot is running</h2>');
});


// Select a port for the server to listen on.
const port = process.env.PORT || 3000;

// Start the express application server
http.createServer(app).listen(port, () => {
	console.log(`<Startup> server listening on port ${port}`);
	storyBotTools.validateBotConnection();

});


// Borrowed code to do case-insensitive Array.indexOf
/**
 * Test for String equality ignoring case.
 * @param {String} str1
 * @param {String} str2
 * @returns {Boolean} true if both string is equals ignoring case.
 */
function equalsIgnoreCase(str1, str2) {
	return str1.toLowerCase() === str2.toLowerCase();
}

/**
 * Find the index of a string in an array of string.
 * @param {Array} array
 * @param {String} element
 * @returns {Number} the index of the element in the array or -1 if not found.
 */
function indexOfIgnoreCase(array, element) {
	var ret = -1;
	array.some(function(ele, index, array) {
		if (equalsIgnoreCase(element, ele)) {
			ret = index;
			return true;
		}
	});
	return ret;
}

/**
 * Test the existence of a string in an array of string.
 * @param {Array} array
 * @param {String} element
 * @returns {Boolean} true if found and false if not found.
 */
function existsIgnoreCase(array, element) {
	return -1 !== indexOfIgnoreCase(array, element);
}

//convenience method
Array.prototype.indexOfIgnoreCase = function(input) {
	return indexOfIgnoreCase(this, input);
};

//convenience method
Array.prototype.existsIgnoreCase = function(input) {
	return -1 !== this.indexOfIgnoreCase(input);
}