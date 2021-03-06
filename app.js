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
// For some API calls when there isn't a token
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

// Listen for message events
slackEvents.on('message', (event, body) => {
	// Check for an auth in the DB
	redis.get(body.team_id).then((auth) => {
		// Make sure there's a valid auth
		if (Object.keys(auth).length > 0) {
			// Check if the event is a bot generated message - if so, don't respond to it to avoid loops
			// NOTE: remove this safety valve and add || (event.subtype === 'bot_message')) if you want to have nested replies and use at your own risk!
			if ((event.type === 'message' && !event.subtype)) { //|| (event.subtype === 'bot_message')) {
				// Retreive the config (or populate from the DB)
				configTools.getConfig(auth.team_id, auth).then((config) => {
					// Matched a trigger from a user so playback the story
					// Do this to hanle slash commands allowing anything after the trigger text
					let regexRes = event.text.match(/(\/.*(?=\s)) .*/);
					let indexMatch = null;
					if (regexRes) {
						// Check for a full slash command trigger match, or if not just the command and exclude any args
						indexMatch = indexOfIgnoreCase(config.keys, regexRes[0]);
						if (indexMatch < 0) {
							indexMatch = indexOfIgnoreCase(config.keys, regexRes[1]);
						}
					} else {
						indexMatch = indexOfIgnoreCase(config.keys, event.text);
					}
					if (indexMatch >= 0) {
						storyBotTools.playbackScript(config, config.keys[indexMatch], event);
					}
				}).catch(console.error);
			}
		} else {
			// Getting a request from an installed app, but there's no info in the DB - prompt to reauth it
			console.log('<AUTH> Request from workspace', team_id, 'does not have valid auth!');
			storyBotTools.adminReauth(req.body.response_url, "https://slack.com/oauth/authorize?" + qs.stringify({
				client_id: process.env.SLACK_CLIENT_ID,
				scope: process.env.SCOPE
			}));
		}
	}).catch(console.error);
});

// Listen for reaction_added event
slackEvents.on('reaction_added', (event, body) => {
	redis.get(body.team_id).then((auth) => {
		if (Object.keys(auth).length > 0) {
			// Put a :skull: on an item and the bot will kill it dead (and any threaded replies)
			if (event.reaction === 'skull') {
				storyBotTools.deleteItem(new WebClient(auth.access_token), event.item.channel, event.item.ts);
			} else {
				configTools.getConfig(auth.team_id, auth).then((config) => {
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
				}).catch(console.error);
			}
		} else {
			// Getting a request from an installed app, but there's no info in the DB - prompt to reauth it
			console.log('<AUTH> Request from workspace', team_id, 'does not have valid auth!');
			storyBotTools.adminReauth(req.body.response_url, "https://slack.com/oauth/authorize?" + qs.stringify({
				client_id: process.env.SLACK_CLIENT_ID,
				scope: process.env.SCOPE
			}));
		}
	}).catch(console.error);
});

// Handle errors (see `errorCodes` export)
slackEvents.on('error', console.error);

// Look for matches for dynamic callbacks
slackInteractions.action(/callback_/, (payload, respond) => {
	redis.get(payload.team.id).then((auth) => {
		if (Object.keys(auth).length > 0) {
			configTools.getConfig(auth.team_id, auth).then((config) => {
				if (payload.callback_id === 'callback_history_cleanup') {
					storyBotTools.historyCleanup(config, payload, respond);
				} else if (payload.callback_id === 'callback_admin_menu') {
					storyBotTools.adminCallback(payload, respond, configTools);
				} else if (payload.callback_id === 'callback_config') {
					// Allow full URLs
					let match = payload.submission['Google Sheet Link'].match(/(?<=https:\/\/docs\.google\.com\/spreadsheets\/d\/).*(?=\/)/);
					if (match) {
						payload.submission['Google Sheet Link'] = match[0];
					}
					redis.set(auth.team_id, Object.assign(auth, {
						configParams: {
							gsheetID: payload.submission['Google Sheet Link'],
							googleCreds: JSON.parse(payload.submission['Google API Credentials'])
						}
					})).catch(console.error);
					configTools.getConfig(auth.team_id, auth);
				} else if (payload.callback_id === 'callback_add_trigger') {
					console.log('<addtrigger> ok lets append this trigger');
					configTools.addTriggerToConfig(auth.team_id, payload.submission);
				} else {
					if (config.scripts.Callbacks.find(o => o.callback_name == payload.callback_id)) {
						storyBotTools.callbackMatch(payload, respond, config, config.scripts.Callbacks.find(o => o.callback_name == payload.callback_id));
					} else {
						console.log('<Callback> No match in the config for', payload.callback_id);
					}
				}
			}).catch(console.error);
		} else {
			// Getting a request from an installed app, but there's no info in the DB - prompt to reauth it
			console.log('<AUTH> Request from workspace', team_id, 'does not have valid auth!');
			storyBotTools.adminReauth(req.body.response_url, "https://slack.com/oauth/authorize?" + qs.stringify({
				client_id: process.env.SLACK_CLIENT_ID,
				scope: process.env.SCOPE
			}));
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

	const {
		command,
		text,
		team_id,
		user_id,
		channel_id,
		headers,
		trigger_id,
		response_url
	} = req.body;

	// Secrets, secrets are no fun
	const timeStamp = req.headers['x-slack-request-timestamp'];
	const slashSig = req.headers['x-slack-signature'];
	const reqBody = JSON.stringify(req.body);
	const baseString = `v0:${timeStamp}:${req.rawBody}`;
	const hmac = crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET);
	JSON.stringify(hmac.update(baseString));
	const mySignature = `v0=${hmac.digest(`hex`)}`;

	// Check if the requesting team / user is already in the DB
	redis.get(team_id).then((auth) => {
		if (Object.keys(auth).length > 0) {
			// Check if there's already a configuration and if not, this will set it up. If there are config params in the DB load them as well
			// Also many hidden commands
			configTools.getConfig(auth.team_id, auth).then((config) => {
				if (command === '/storybot' || command === '/devstorybot') {
					if (text === 'dm') {
						// Toggle for the admin menus to go to DM vs channel
						config.dm = !config.dm;
						redis.set(auth.team_id, Object.assign(auth, {
							dm: config.dm
						})).catch(console.error);
					} else if (text === 'set') {
						// Drop the history to let the played back actions to stay
						config.message_history = [];
					} else if (text === 'cleanup') {
						// Delete all history
						storyBotTools.deleteAllHistory(config);
					} else if (text === 'reload') {
						// Reload the current config
						configTools.loadConfig(team_id).catch(console.error);
					} else if (text === 'uninstall') {
						// Uninstall the app - delete from the DB, revoke the token, and remove from running config
						redis.del(auth.team_id).then((res) => {
							config.webClientBot.auth.revoke({
								token: auth.access_token,
							}).then((res) => {
								configTools.deleteConfig(auth.team_id);
							}).catch(console.error);
						}).catch(console.error);
					} else if (text === 'debug') {
						// Put out the entire running config to console
						console.log('allConfigs =', configTools.debugConfig());
					} else if (text === 'trigger') {
						storyBotTools.newTriggerDialog(config, trigger_id);
					} else {
						// Or, if no options, generate the admin menu
						storyBotTools.adminMenu(req.body, config);
					}
				} else {
					// Look if there's a trigger for a fake slash command and use it with a real slash command!
					let indexMatch = indexOfIgnoreCase(config.keys, command + ' ' + text);
					if (indexMatch >= 0) {
						let slash_event = {
							user: user_id,
							channel: channel_id,
							text: command + ' ' + text,
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
		} else {
			// Getting a request from an installed app, but there's no info in the DB - prompt to reauth it
			console.log('<AUTH> Request from workspace', team_id, 'does not have valid auth!');
			storyBotTools.adminReauth(response_url, "https://slack.com/oauth/authorize?" + qs.stringify({
				client_id: process.env.SLACK_CLIENT_ID,
				scope: process.env.SCOPE
			}));
		}
	}).catch(console.error);
});

// OAuth Handler - this URL is connected through https://myURL/intstall in the Oauth and Permissions page
// Usually the URL is your ngrok redirect until the app gets moved to where ever you would like to host it!
app.get('/install', (req, res) => {
	if (req.query.code) {
		let redirect = team => res.redirect(team.data.url)
		//Storing the team ID in redis so we can verify the app by team token
		//key value pair - team id, auth snippet
		let args = {
			client_id: process.env.SLACK_CLIENT_ID,
			client_secret: process.env.SLACK_CLIENT_SECRET,
			code: req.query.code
		}
		// Exchange the code/token, set up the DB, load the config to running, and make sure the token works, then redirect back to workspace
		axios.post('https://slack.com/api/oauth.access', qs.stringify(args)).then((accessRes) => {
			redis.set(accessRes.data.team_id, accessRes.data).then((redisRes) => {
				configTools.getConfig(redisRes.team_id, redisRes);
				axios.post('https://slack.com/api/auth.test', qs.stringify({
					token: redisRes.access_token
				})).then((authTestRes) => {
					res.redirect(authTestRes.data.url);
				}).catch(console.error);
			})
		}).catch(console.error);
	} else {
		res.redirect("https://slack.com/oauth/authorize?" + qs.stringify({
			client_id: process.env.SLACK_CLIENT_ID,
		}));
	}
})

// Handle the user/admin revoking the apps token (expecting only 1 auth per workspace!)
slackEvents.on('tokens_revoked', (event, body) => {
	// Delete from DB and any running config
	redis.del(body.team_id).then((res) => {
		configTools.deleteConfig(body.team_id);
	}).catch(console.error);
});


// The main site
app.get('/', (req, res) => {
	res.send('<hr> Install Storybot to your workspace here: </hr><p><a href="https://slack.com/oauth/authorize?client_id=176530022562.442738596756&scope=bot,channels:write,channels:read,chat:write:bot,chat:write:user,files:write:user,groups:read,groups:write,reactions:read,reactions:write,users:read,commands,channels:history,groups:history,im:history"><img alt="Add to Slack" height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" /></a>');
});

// Select a port for the server to listen on.
const port = process.env.PORT || 3000;
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