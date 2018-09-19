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
const axios = require('axios');
// Fun with oAuth
redis = require('./redis');
// Create a new web client
const {
	WebClient
} = require('@slack/client');
// use this to handle install requests
const webClientAuth = new WebClient(process.env.SLACK_BOT_TOKEN);
const qs = require('querystring');

// Load the appropriate config file from Google Sheets
var configTools = require('./load-conf-google');
// Set up the Storybot tools - where the magic happens
const storyBotTools = require('./storytools.js');

//for testing purposes only - populating my dev org until we can get some DB persistence for the 3 google vars
redis.get('T56FL0NGJ').then((auth) => {
	//	console.log('redis results for team', auth.team_id, 'are', auth);
	let configParams = null;
	if (!auth.configParams) {
		//	console.log('storing shit')
		configParams = {
			gsheetID: process.env.GSHEET_ID,
			clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
			privateKey: process.env.GOOGLE_PRIVATE_KEY
		};
		//	redis.set(auth.team_id, configParams);
	}
	configTools.setConfig(auth.team_id, {
		gsheetID: process.env.GSHEET_ID,
		clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
		privateKey: process.env.GOOGLE_PRIVATE_KEY
	}); //auth.configParams || configParams);
	configTools.loadConfig(auth.team_id).catch(console.error);
	configTools.createWebClient(auth.team_id, auth.access_token);
	storyBotTools.setupNewConfig(configTools.getConfig(auth.team_id));
});
// end testing section

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

// Create the adapter using the app's verification token, read from environment variable
const slackInteractions = createMessageAdapter(process.env.SLACK_SIGNING_SECRET);
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET, {
	includeBody: true
});

// Initialize an Express application
// NOTE: You must use a body parser for the urlencoded format before attaching the adapter
const app = express();
// Attach the adapter to the Express application as a middleware
app.use('/slack/actions', slackInteractions.expressMiddleware());
// Mount the event handler on a route
app.use('/slack/events', slackEvents.expressMiddleware());

// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
slackEvents.on('message', (event, body) => {
	redis.get(body.team_id).then((auth) => {
		// Check if the event is a bot generated message - if so, don't respond to it to avoid loops
		// NOTE: remove this safety valve of `&& !event.bot_id` if you want to have nested replies and use at your own risk!
		if (event.type === 'message' && !event.subtype && !event.bot_id) {
			let config = configTools.getConfig(auth.team_id);
			// Matched a trigger from a user so playback the story
			let indexMatch = indexOfIgnoreCase(config.keys, event.text);
			if (indexMatch >= 0) {
				storyBotTools.playbackScript(config, config.keys[indexMatch], event);
			}
		}
	}).catch(console.error);
});

// Listen for reaction_added event
slackEvents.on('reaction_added', (event, body) => {
	redis.get(body.team_id).then((auth) => {
		let config = configTools.getConfig(auth.team_id);
		// Put a :skull: on an item and the bot will kill it dead (and any threaded replies)
		if (event.reaction === 'skull') {
			storyBotTools.deleteItem(config, event.item.channel, event.item.ts);
		} else {
			// Allow reacjis to trigger a story but WARNING this can be recursive right now!!!! 
			// Use a unique reacji vs one being used elsewhere in the scripts
			if (config.keys.indexOf(':' + event.reaction + ':') >= 0) {
				// Need to pass some basic event details to mimic what happens with a real event
				let reaction_event = {
					channel: event.item.channel,
					ts: event.item.ts,
					text: ':' + event.reaction + ':',
					reaction: event.reaction
				};
				storyBotTools.playbackScript(config, reaction_event.text, reaction_event);
			}
		}
	}).catch(console.error);
});

// Handle errors (see `errorCodes` export)
slackEvents.on('error', console.error);

// Look for matches for dynamic callbacks
slackInteractions.action(/callback_/, (payload, respond) => {
	redis.get(payload.team.id).then((auth) => {
		let config = configTools.getConfig(auth.team_id);
		// If This is the first admin menu call, nothing has been setup yet - really should trigger a setup DM to prompt to [config]
		// lets just create a new webclient so we can get to the config menu stuff
		if (!config) {
			configTools.createWebClient(payload.team.id, auth.access_token);
			config = configTools.getConfig(payload.team.id);
		}

		if (payload.callback_id === 'callback_history_cleanup') {
			storyBotTools.historyCleanup(config, payload, respond);
		} else if (payload.callback_id === 'callback_admin_menu') {
			storyBotTools.adminCallback(payload, respond, configTools);
		} else if (payload.callback_id === 'callback_config') {
			configTools.setConfig(auth.team_id, {
				gsheetID: payload.submission['Google Sheet Link'],
				clientEmail: payload.submission['Google API Email'],
				privateKey: payload.submission['Google Private Key']
			});
			configTools.loadConfig(auth.team_id);
			//	configTools.createWebClient(auth.team_id, auth.access_token);
			storyBotTools.setupNewConfig(config);
		} else {
			if (config.scripts.Callbacks.find(o => o.callback_name == payload.callback_id)) {
				storyBotTools.callbackMatch(payload, respond, config, config.scripts.Callbacks.find(o => o.callback_name == payload.callback_id));
			} else {
				console.log('<Callback> No match in the config for', payload.callback_id);
			}
		}
	}).catch(console.error);
});

// 
// Secrets secrets are no fun
// 
const bodyParser = require('body-parser');
const crypto = require('crypto');

app.use(bodyParser.urlencoded({
	extended: false,
	verify: function(req, res, body) {
		req.rawBody = body.toString();
	}
}));

app.use(bodyParser.json());

// Handle slash commands and check secrets
app.post('/slack/commands', function(req, res) {
	// respond immediately!
	res.status(200).end();

	let command = req.body.command;
	let args = req.body.text;
	const timeStamp = req.headers['x-slack-request-timestamp'];
	const slashSig = req.headers['x-slack-signature'];
	const reqBody = JSON.stringify(req.body);
	const baseString = `v0:${timeStamp}:${req.rawBody}`;
	const hmac = crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET);
	JSON.stringify(hmac.update(baseString));
	const mySignature = `v0=${hmac.digest(`hex`)}`;

	if (mySignature == slashSig) {
		//	console.log(`Success
		//     Signature: ${mySignature}`);
	} else {
		//	console.log(`SIGNATURES DO NOT MATCH
		//   Expected: ${mySignature}
		// Actual: ${slashSig}`);
	}

	//	console.log('<DEBUG><oAuth><slash handler> request is', req.body);
	// Check if the requesting team / user is already in the DB
	redis.get(req.body.team_id).then((auth) => {
		//console.log('<DEBUG><oAuth><slash handler> team_id lookup result is', auth);
		if (command === '/storybot') {
			storyBotTools.adminMenu(req.body);
		} else {
			let config = configTools.getConfig(auth.team_id);
			// Look if there's a trigger for a fake slash command and use it with a real slash command!
			let indexMatch = indexOfIgnoreCase(config.keys, command + ' ' + args);
			if (indexMatch >= 0) {
				let slash_event = {
					user: req.body.user_id,
					channel: req.body.channel_id,
					text: command + ' ' + args,
					ts: 'slash',
				};
				// When matching a slash command, no need to delete the trigger as if it was a fake text command
				config.scripts[config.keys[indexMatch]][0].delete_trigger = null;
				storyBotTools.playbackScript(config, config.keys[indexMatch], slash_event);
			} else {
				console.error('<Slash Command> No matching command');
			}
		}
	}).catch(console.error);
});

// OAuth Handler - this URL is connected through https://myURL/intstall in the Oauth and Permissions page
// Usually the URL is your ngrok redirect until the app gets moved to where ever you would like to host it!
app.get('/install', (req, res) => {
			if (req.query.code) {
				console.log('<oAUTH><INSTALL> CODE is ', req.query);
				let redirect = team => res.redirect(team.url)
				//Storing the team ID in redis so we can verify the app by team token
				//key value pair - team id, auth snippet
				let setAuth = auth => redis.set(auth.team_id, auth)
				let testAuth = auth => //{
					//			webClientAuth.auth.test({
					//				token: auth.access_token
					//			});
					axios.post('https://slack.com/api/auth.test', qs.stringify({
						token: auth.access_token
					}));
				/*	}).then((res) => {
						console.log('<Loading> Bot connected to workspace', res.team);
						return res;
					}).catch(console.error);*/
				//	}
				let args = {
					client_id: process.env.SLACK_CLIENT_ID,
					client_secret: process.env.SLACK_CLIENT_SECRET,
					code: req.query.code
				}
				//	webClientAuth.oauth.access(args).then(setAuth).then(testAuth).then(redirect);
				axios.post('https://slack.com/api/oauth.access', qs.stringify(args).then(setAuth).then(testAuth).then(redirect);

				}
				else {
					res.redirect("https://slack.com/oauth/authorize?" + qs.stringify({
						client_id: process.env.SLACK_CLIENT_ID,
						scope: process.env.SLACK_SCOPE
					}));
				}
			})

		// The main site
		app.get('/', (req, res) => {
			res.send('<h2>StoryBot is running</h2>');
		});

		// Select a port for the server to listen on.
		const port = process.env.PORT || 3000; console.log('PORT?', port);
		// Start the express application server
		http.createServer(app).listen(port, () => {
			console.log(`<Startup> server listening on port ${port}`);
		});

		//
		// Borrowed code to do case-insensitive Array.indexOf
		//

		/**
		 * Find the index of a string in an array of string.
		 * @param {Array} array
		 * @param {String} element
		 * @returns {Number} the index of the element in the array or -1 if not found.
		 */
		function indexOfIgnoreCase(array, element) {
			let ret = -1;
			array.some(function(ele, index, array) {
				if (element.toLowerCase() === ele.toLowerCase()) {
					ret = index;
					return true;
				}
			});
			return ret;
		}