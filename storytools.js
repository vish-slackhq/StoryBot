// Modules
const async = require("async");

// Need this for shared message due to no SDK suppport
const qs = require('querystring');
const axios = require('axios');


// Webhooks for slash command response
const {
	IncomingWebhook
} = require('@slack/client');

// Create a new web client
const {
	WebClient
} = require('@slack/client');
const webClientBot = new WebClient(process.env.SLACK_AUTH_TOKEN);
//const webClientUser = new WebClient(process.env.SLACK_AUTH_TOKEN);

// Global variables - way to not need these?
var message_history = [];
var user_list = [];
var all_users = [];
var channel_list = [];
//exports.authUserID;
//var authBotID = null;


exports.playbackScript = (config, event) => {
	//console.log('<DEBUG> the event is', event);
	const trigger_term = event.text + "-" + event.ts;

	// Make it easy to cleanup the trigger term
	addHistory(trigger_term, {
		item: -1,
		type: 'trigger',
		channel: event.channel,
		ts: event.ts
	});

	// Step through the script in order
	async.eachSeries(config[event.text], function(action, callback) {

		// Ignore blank lines that may have been ingested for some reason 
		if (action.type) {
			//Clean up a fake slash command or other item that has `delete_trigger` set
			if (action.delete_trigger) {

			//	console.log('<DEBUG> Need to delete the trigger message');
				webClientBot.chat.delete({
					channel: event.channel,
					ts: event.ts
				}).catch(console.error);
			}

			//Delay the item if specified, then execute the rest
			delay(action.delay * 1000)
				.then((res) => {
					let apiMethod, token, as_user, target_ts, target_channel, params;

					// Set targets for the actions that need them
					if (action.type === 'reply' || action.type === 'reaction' || action.type === 'share') {
						if (action.target_ts && action.target_channel) {
							target_ts = action.target_ts;
							target_channel = action.target_channel;
						} else if (action.target_item.indexOf('trigger') >= 0) {
							target_ts = event.ts;
							target_channel = event.channel;
						} else {
							target_ts = message_history[trigger_term].find(o => o.item == action.target_item).ts;
							target_channel = message_history[trigger_term].find(o => o.item == action.target_item).channel;
						}
					}

					//	console.log('DEBUG: received event with type ',action.type);

					// Pull together the paramters for the item
					switch (action.type) {
						case 'message':
						case 'reply':
							{
								webClientBot.chat.postMessage({
									token: config['Tokens'].find(o => o.name === action.username).token,
									as_user: true,
									username: action.username,
									channel: action.channel,
									text: action.text,
									thread_ts: target_ts,
									link_names: true,
									unfurl_links: true,
									attachments: action.attachments
								})
								.then((res) => {
									//			console.log('<DEBUG> API call for user postMessage with params', params, 'had response', res.ok);
									//Add what just happened to the history
									addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.channel,
											ts: res.ts
										}).then((res) => {
											//Allow the async series to go forward
											callback();
										})
										.catch(console.error);
								})
								.catch(console.error);
								break;
							}
						case 'bot':
						case 'botdm':
							{
								params = {
									as_user: false,
									username: action.username,
									channel: action.channel,
									text: action.text,
									link_names: true,
									unfurl_links: "true",
									icon_emoji: action.icon_emoji,
									icon_url: action.icon_url,
									attachments: action.attachments
								};

								if (action.channel === 'current') {
									params.channel = event.channel;
								}

								webClientBot.chat.postMessage(params)
								.then((res) => {
									//			console.log('<DEBUG> API call for Bot postMessage with params', params, 'had response', res.ok);
									//Add what just happened to the history
									addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.channel,
											ts: res.ts
										}).then((res) => {
											//Allow the async series to go forward
											callback();
										})
										.catch(console.error);
								})
								.catch(console.error);
								break;
							}
						case 'reaction':
							{
								webClientBot.reactions.add({
									token: config['Tokens'].find(o => o.name === action.username).token,
									as_user: true,
									username: action.username,
									channel: target_channel,
									name: action.reaction,
									timestamp: target_ts
								})
								.then((res) => {
									//		console.log('<DEBUG> API call for reactions.add with params', params, 'had response', res.ok);
									//Add what just happened to the history
									addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.channel,
											ts: res.ts
										}).then((res) => {
											//Allow the async series to go forward
											callback();
										})
										.catch(console.error);
								})
								.catch(console.error);
								break;

							}
						case 'ephemeral':
							{
								webClientBot.chat.postEphemeral({
									user: event.user,
									channel: event.channel,
									as_user: false,
									link_names: true,
									attachments: action.attachments
								})
								.then((res) => {
									//			console.log('<DEBUG> API call for postEphemeral with params', params, 'had response', res);
									//Add what just happened to the history
									addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.channel,
											ts: res.message_ts
										}).then((res) => {
											//Allow the async series to go forward
											callback();
										})
										.catch(console.error);
								})
								.catch(console.error);
								break;
							}
						case 'post':
							{
								webClientBot.files.upload({
									token: config['Tokens'].find(o => o.name === action.username).token,
									channels: action.channel,
									filetype: 'post',
									title: action.title,
									initial_comment: action.text,
									content: action.content
								})
								.then((res) => {
									//			console.log('<DEBUG> API call for files.upload with params', params, 'had response', res);
									//Add what just happened to the history
									addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.channel,
											ts: res.file.id
										}).then((res) => {
											//Allow the async series to go forward
											callback();
										})
										.catch(console.error);
								})
								.catch(console.error);
								break;
							}
						case 'status':
							{

								webClientBot.users.profile.set({
									//user: getUserId(action.username),
									token: config['Tokens'].find(o => o.name === action.username).token,
									profile: {
										"status_text": action.text,
										"status_emoji": action.reaction
									}
								})
								.then((res) => {
									//console.log('<DEBUG> API call for users.profile.set had response', res);
									//Add what just happened to the history
									addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											username: res.username,
											ts: res.message_ts
										}).then((res) => {
											//Allow the async series to go forward
											callback();
										})
										.catch(console.error);
								})
								.catch(console.error);

								break;
							}
						case 'share':
							{
								apiMethod = 'chat.shareMessage';

								params = {
									token: config['Tokens'].find(o => o.name === action.username).token,
									text: action.text,
									share_channel: action.channel,
									channel: target_channel,
									timestamp: target_ts,
									link_names: true
								}

								//Make the call
								axios.post('https://slack.com/api/' + apiMethod, qs.stringify(params))
								.then((result) => {
									let ts = result.data.ts;
									if (action.type === 'post') {
										ts = result.data.file.id;
									}

									console.error('API call for ', apiMethod, ' with params ', params, ' resulted in: ', result.data);

									//Add what just happened to the history
									addHistory(trigger_term, {
										item: action.item,
										type: action.type,
										channel: result.data.channel,
										ts: ts
									}).then((result) => {
										//Allow the async series to go forward
										callback();
									});
								}).catch((err) => {
									console.error('API call for ', apiMethod, 'resulted in: ', err);
								});

								break;
							}
						case 'invite':
							{
								apiMethod = 'channels.invite';

								params = {
									token: config['Tokens'].find(o => o.name === action.username).token,
									channel: event.channel, //not ideal but don't feel like figuring out how to take channel name to channel ID for any channel
									user: getUserId(action.text)
								}
								break;
							}
						default:
							console.log('default callback');
							callback();
							break;
					}
				})
				.catch(console.error);
		}
	})
	//.catch(console.error);
}

// Helper Functions

// Promise delay so we can make time elapse between interactions
const delay = (time) => {
	return new Promise(function(resolve) {
		setTimeout(resolve, time);
	});
}

// Add to the global history for later cleanup
const addHistory = (name, data) => {
	return new Promise(function(resolve) {
		if (!message_history[name]) {
			message_history[name] = [];
		}
		resolve(message_history[name].push(data));
	});
}

// Return History for Admin Callback use
const getHistory = () => {
	return message_history;
}

// Delete something from the history
const deleteHistoryItem = (term) => {
	if (!message_history[term]) {
		console.log('<History> Well this is embarassing:' + term + "doesn't exist in history");
		return 'Well this is embarassing: ' + term + " doesn't exist in history";
	} else {
		for (let i = message_history[term].length - 1; i >= 0; i--) {
			if (message_history[term][i].type === 'post') {
				webClientBot.files.delete({
						file: message_history[term][i].ts
					}).then((res) => {
						//					console.log('<DEBUG> just deleted a history item res is', res);
					})
					.catch(console.error);
			} else if (message_history[term][i].type === 'status') {
				webClientBot.users.profile.set({
						//	token: config['Tokens'].find(o => o.name === message_history[term][i].username).token,
						user: getUserId(message_history[term][i].username),
						profile: {
							"status_text": "",
							"status_emoji": ""
						}
					})
					.then((res) => {
						//			console.log('<DEBUG> just deleted a history item res is', res);
					})
					.catch(console.error);
			} else if (!(message_history[term][i].type === 'reaction') && !(message_history[term][i].type === 'ephemeral')) {
				webClientBot.chat.delete({
						channel: message_history[term][i].channel,
						ts: message_history[term][i].ts
					}).then((res) => {
						//				console.log('<DEBUG> just deleted a history item res is', res);
					})
					.catch(console.error);
			}
		}
		delete message_history[term];
		console.log('<History> Successfully deleted', term, 'from the history.');
		return 'Successfully deleted ' + term + ' from the history.';
	}
}

// Burn it all down
const deleteAllHistory = () => {
	let historyKeys = Object.keys(message_history);
//	console.log('<DEBUG> Time to delete all history with keys', historyKeys);
	if (!(historyKeys.length > 0)) {
		console.log('<History> No history to delete!');
		return "No history to delete!";
	} else {
		historyKeys.forEach(function(key) {
			deleteHistoryItem(key);
		});
		return "All history deleted";
	}
}

exports.deleteItem = (channel, ts) => {
	webClientBot.chat.delete({
		channel: channel,
		ts: ts
	}).catch(console.error);
}

// Get the list of all users and their IDs
const buildUserList = (authBotId) => {

	webClientBot.users.list()
		.then((res) => {
			//	console.log('<DEBUG> getUserList users.list resulted in',res);
			user_list = res.members;
			all_users = authBotId;
			user_list.forEach(function(user) {
				if (!(user.id === module.exports.authUserID || user.name === 'USLACKBOT')) {
					all_users = all_users + "," + user.id;
				}
			});
			//		console.log('<DEBUG> buildUserList final list is',user_list);
		})
		.catch(console.error);
}

// Look up User ID from a Name
const getUserId = (name) => {
	let id = user_list.find(o => o.name === name).id;
	return id;
}

// Get the list of all channels and their IDs
const getChannelList = () => {
	webClientBot.channels.list({
			exclude_members: true,
			exclude_archived: true,
			get_private: true
		})
		.then((res) => {
			//		console.log('DEBUG: channels res:',res);
			channel_list = res.channels;
		})
		.catch(console.log);
}

// Look up Channel ID from a Name
const getChannelId = (name) => {
	let id = channel_list.find(o => o.name === name).id;
	return id;
}

exports.validateBotConnection = () => {
	webClientBot.auth.test()
		.then((res) => {
			const {
				team,
				user_id
			} = res;
			console.log('<Loading> Bot connected to workspace', team);

			// Cache info on the users for ID translation and inviting to channels
			buildUserList(user_id);

			getChannelList();

		})
		.catch(console.error);

}

exports.adminMenu = (body) => {

	const {
		token,
		text,
		response_url,
		trigger_id,
		command
	} = body;

	//Build the admin menu for the bot
	const admin_menu = [{
		fallback: 'Storybot Admin Menu',
		color: '#3f2cbc',
		mrkdwn_in: [
			'text',
			'pretext',
			'fields'
		],
		pretext: 'StoryBot Admin & Config Tools',
		callback_id: 'callback_admin_menu',
		attachment_type: 'default',
		actions: [{
			name: 'Triggers',
			text: 'Triggers',
			type: 'button',
			style: 'default',
			value: 'Triggers'
		}, {
			name: 'History',
			text: 'History',
			type: 'button',
			style: 'default',
			value: 'History'
		}, {
			name: 'Cleanup All',
			text: 'Cleanup All',
			type: 'button',
			style: 'default',
			value: 'Cleanup All'
		}, {
			name: 'Reload Config',
			text: 'Reload Config',
			type: 'button',
			style: 'default',
			value: 'Reload Config'
		}, {
			name: 'Create Channels',
			text: 'Create Channels',
			type: 'button',
			style: 'default',
			value: 'Create Channels'
		}]
	}];

	const webhook = new IncomingWebhook(response_url);

	webhook.send({
		attachments: admin_menu,
		response_type: 'ephemeral',
		replace_original: true
	}).then((res) => {
	//	console.log('<Slash Command> Called webhook');
	}).catch(console.error);
}

// Handle the admin menu callbacks
exports.adminCallback = (payload, respond) => {

//	console.log('<Admin Menu> Payload is', payload);

	switch (payload.actions[0].value) {
		case 'History':
			{
				console.log('<Admin Menu> History is:', message_history);
				let message_history_keys = Object.keys(message_history);

				if (message_history_keys.length > 0) {
					let attachments = [];
					let actions = [];
					message_history_keys.forEach(function(key) {
						actions.push({
							name: key,
							text: key,
							value: key,
							type: 'button'
						});
					});

					attachments.push({
						actions: actions,
						title: "These are the triggers you've run. Click to cleanup:",
						mrkdwn_in: ['text', 'fields'],
						callback_id: 'callback_history_cleanup'
					});

					response = {
						response_type: 'ephemeral',
						replace_original: false,
						attachments: attachments
					};
				} else {
					response = {
						response_type: 'ephemeral',
						replace_original: false,
						text: "No history right now"
					}
				}
				break;
			}
		case 'Cleanup All':
			{
				let msg = deleteAllHistory();

				response = {
					text: msg,
					replace_original: true,
					ephemeral: true
				};
				break;
			}
		default:
			{
				response = {
					text: ":thinking_face: Not sure how that happened",
					replace_original: true,
					ephemeral: true
				};
				break;
			}

	}
	respond(response).catch(console.error);
}

exports.historyCleanup = (payload, respond) => {
	let msg = deleteHistoryItem(payload.actions[0].value);

	response = {
		text: msg,
		replace_original: true,
		ephemeral: true
	};
	respond(response).catch(console.error);
}

exports.callbackMatch = (payload, respond, callback) => {
//	console.log('<Callbacks> DEBUG - this is the matching callback', callback);

	let response = {
		text: "default response"
	};

	if (callback.dialog) {
		response = {
			trigger_id: payload.trigger_id,
			dialog: callback.attachments
		}
		webClientBot.dialog.open(response).catch(console.error);
	} else {
		response = {
			channel: payload.channel.id,
			text: callback.text,
			ts: payload.message_ts,
			icon_url: callback.icon_url,
			icon_emoji: callback.icon_emoji,
			username: callback.username,
			link_names: true,
			as_user: false,
			attachments: callback.attachments
		};

		if (callback.channel != 'current') {
			response.channel = getChannelId(callback.channel);
		}

		if (callback.update) {
		//	console.log('<Callbacks> DEBUG - this is an update, using', response);
			webClientBot.chat.update(response).catch(console.error);


		} else {
		//	console.log('<Callbacks> DEBUG - this is a new message, using', response);
			webClientBot.chat.postMessage(response).catch(console.error);
			/*
						webClientBot.chat.postMessage(response)
							.then((res) => {
								//			console.log('<DEBUG> API call for user postMessage with params', params, 'had response', res.ok);
								//Add what just happened to the history
								addHistory(trigger_term, {
										item: action.item,
										type: action.type,
										channel: res.channel,
										ts: res.ts
									}).then((res) => {
										//Allow the async series to go forward
										callback();
									})
									.catch(console.error);
							})
							.catch(console.error);*/
		}
	}
	const reply = payload.original_message;
	delete reply.attachments[0].actions;
	return reply;
}