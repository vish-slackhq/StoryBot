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
var allUserIds = [];
var channel_list = [];
//exports.authUserID;
var botID;


exports.playbackScript = (config, event) => {
	//console.log('<DEBUG> the event is', event);
	const trigger_term = event.text + "-" + event.ts;

	if (!config[event.text][0].delete_trigger) {
		// Make it easy to cleanup the trigger term
		addHistory(trigger_term, {
			item: -1,
			type: 'trigger',
			channel: event.channel,
			ts: event.ts
		});
	}

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
				}).catch((err) => {
					console.error('<Error><Main Loop><chat.delete trigger message>', err);
				});
			}

			//Delay the item if specified, then execute the rest
			delay(action.delay * 1000)
				.then((res) => {
					let apiMethod, token, as_user, target_ts, target_channel, params;

					// Set targets for the actions that need them

					if (action.type === 'botuser') {
						if (action.target_item) {
							if (action.target_item.indexOf('trigger') >= 0) {
								target_ts = event.ts;
								target_channel = event.channel;
							} else {
								target_ts = message_history[trigger_term].find(o => o.item == action.target_item).ts;
								target_channel = message_history[trigger_term].find(o => o.item == action.target_item).channel;
							}
						}

						if (action.reaction) {
							webClientBot.reactions.add({
									as_user: false,
									username: action.username,
									channel: target_channel,
									name: action.reaction,
									timestamp: target_ts
								})
								.then((res) => {
									//Add what just happened to the history
									addHistory(trigger_term, {
										item: action.item,
										type: action.type,
										channel: res.channel,
										ts: res.ts
									}).then((res) => {
										//Allow the async series to go forward
										callback();
									}).catch((err) => {
										console.error('<Error><Main Loop><addHistory>', err);
									});
								}).catch((err) => {
									console.error('<Error><Main Loop><reactions.add>', err);
								});
						} else {
							webClientBot.chat.postMessage({
								as_user: false,
								username: action.username,
								channel: action.channel,
								text: action.text,
								thread_ts: target_ts,
								link_names: true,
								unfurl_links: true,
								icon_emoji: action.icon_emoji,
								icon_url: action.icon_url,
								attachments: action.attachments
							}).then((res) => {
								//Add what just happened to the history
								addHistory(trigger_term, {
									item: action.item,
									type: action.type,
									channel: res.channel,
									ts: res.ts
								}).then((res) => {
									//Allow the async series to go forward
									callback();
								}).catch((err) => {
									console.error('<Error><Main Loop><addHistory>', err);
								});
							}).catch((err) => {
								console.error('<Error><Main Loop><chat.postMessage>', err);
							});
						}
					} else {

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
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><chat.postMessage>', err);
									});
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
										unfurl_links: true,
										icon_emoji: action.icon_emoji,
										icon_url: action.icon_url,
										attachments: action.attachments
									};

									if (action.channel === 'current') {
										params.channel = event.channel;
									}

									webClientBot.chat.postMessage(params)
									.then((res) => {
										//	console.log('<DEBUG> API call for Bot postMessage with params', params, 'had response', res.ok);
										//Add what just happened to the history
										addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.channel,
											ts: res.ts
										}).then((res) => {
											//Allow the async series to go forward
											callback();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><chat.postMessage>', err);
									});
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
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><reactions.add>', err);
									});
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
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><chat.postEphemeral>', err);
									});
									break;
								}
							case 'file':
								{
									webClientBot.files.upload({
										token: config['Tokens'].find(o => o.name === action.username).token,
										channels: action.channel,
										filetype: action.filetype,
										title: action.title,
										initial_comment: action.text,
										content: action.content
									})
									.then((res) => {
										console.log('<DEBUG> API call for files.upload had response', res, 'with shares in chan', res.file.shares.public[res.file.channels[0]]['ts'], 'and ts', res.file.shares.public[res.file.channels[0]].ts);
										//Add what just happened to the history
										addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.file.channels[0],
											ts: res.file.id
										}).then((res) => {
											//Allow the async series to go forward
											callback();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><files.upload>', err);
									});
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
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><users.profile.set>', err);
									});
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
										link_names: true,
										unfurl_links: true
									}

									//Make the call
									axios.post('https://slack.com/api/' + apiMethod, qs.stringify(params))
									.then((result) => {
										let ts = result.data.ts;
										if (action.type === 'post') {
											ts = result.data.file.id;
										}

										console.log('API call for ', apiMethod, ' with params ', params, ' resulted in: ', result.data);

										//Add what just happened to the history
										addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: result.data.channel,
											ts: ts
										}).then((result) => {
											//Allow the async series to go forward
											callback();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
										});
									}).catch((err) => {
										console.error('API call for ', apiMethod, 'resulted in: ', err);
									});

									break;
								}
								case 'sharefile':
								{
									apiMethod = 'files.share';

									params = {
										token: config['Tokens'].find(o => o.name === action.username).token,
										comment: action.text,
										channel: getChannelId(action.channel),
										file: target_ts
									}

									//Make the call
									axios.post('https://slack.com/api/' + apiMethod, qs.stringify(params))
									.then((result) => {
										let ts = result.data.ts;
										if (action.type === 'post') {
											ts = result.data.file.id;
										}

										console.log('API call for ', apiMethod, ' with params ', params, ' resulted in: ', result.data);

										//Add what just happened to the history
										addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: result.data.channel,
											ts: ts
										}).then((result) => {
											//Allow the async series to go forward
											callback();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
										});
									}).catch((err) => {
										console.error('API call for ', apiMethod, 'resulted in: ', err);
									});

									break;
								}
							case 'invite':
								{

									webClientBot.channels.invite({
										token: config['Tokens'].find(o => o.name === action.username).token,
										channel: getChannelId(action.channel),
										user: getUserId(action.text)
									})
									.then((res) => {
										//Add what just happened to the history
										addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.channel.id,
											ts: null
										}).then((res) => {
											//Allow the async series to go forward
											callback();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><channels.invite>', err);
									});

									break;
								}
							default:
								console.log('default callback');
								callback();
								break;
						}
					}
				})
				.catch((err) => {
					console.error('<Error><Delay><Main Loop>', err);
				});
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
			if (message_history[term][i].type === 'file') {
				webClientBot.files.delete({
						file: message_history[term][i].ts
					}).then((res) => {
						//					console.log('<DEBUG> just deleted a history item res is', res);
					})
					.catch((err) => {
						console.error('<Error><deleteHistoryItem><files.delete>', err);
					});
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
					.catch((err) => {
						console.error('<Error><deleteHistoryItem><users.profile.set>', err);
					});
			} else if (!(message_history[term][i].type === 'reaction') && !(message_history[term][i].type === 'ephemeral')) {
				webClientBot.chat.delete({
						channel: message_history[term][i].channel,
						ts: message_history[term][i].ts
					}).then((res) => {
						//				console.log('<DEBUG> just deleted a history item res is', res);
					})
					.catch((err) => {
						console.error('<Error><deleteHistoryItem><chat.delete> for term', term, '\nError is', err);
					});
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

// Delete a message (or, if it's the first message in a thread, delete the whole thread)
exports.deleteItem = (channel, ts) => {

	webClientBot.channels.replies({
		channel: channel,
		thread_ts: ts
	}).then((res) => {
		res.messages.forEach(function(message) {
			webClientBot.chat.delete({
				channel: channel,
				ts: message.ts
			}).catch(console.error);
		});

	}).catch((err) => {
		console.error('<Error><deleteItem><chat.delete>', err);
	});
	/*
		webClientBot.chat.delete({
			channel: channel,
			ts: ts
		}).catch(console.error);
		*/
}

// Get the list of all users and their IDs
const buildUserList = (authBotId) => {
	botId = authBotId;
	webClientBot.users.list()
		.then((res) => {
			//	console.log('<DEBUG> getUserList users.list resulted in',res);
			user_list = res.members;
			allUserIds = [];
			user_list.forEach(function(user) {
				if (!(user.id === authBotId || user.id === 'USLACKBOT')) {
					allUserIds = allUserIds + "," + user.id;
				}
			});
			//		console.log('<DEBUG> buildUserList final list is', user_list);
		})
		.catch((err) => {
			console.error('<Error><buildUserList><users.list>', err);
		});
}

// Look up User ID from a Name
const getUserId = (name) => {
	name = name.replace(/\s+/g, '');
	console.log('Getting user ID for ', name);
	let id = user_list.find(o => o.name === name).id;
	console.log('Retrieved id', id, 'for user name', name);
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
		.catch((err) => {
			console.error('<Error><getChannelListm><channels.list>', err);
		});
}

// Look up Channel ID from a Name
const getChannelId = (name) => {
	console.log('<DEBUG><getChannelId> Called for name', name);

	let result = null;

	if (channel_list.find(channel => channel.name === name)) {
		result = channel_list.find(channel => channel.name === name).id;
	}

	console.log('<DEBUG><getChannelId> Called for name', name, 'with result id', result);
	return result;
}

const inviteUsersToChannel = (channelId, userIdList) => {
	console.log('<Debug><inviteUsersToChannel> Inviting users to channel ID', channelId, 'now for userIds', userIdList);
	webClientBot.channels.invite({
		channel: channelId,
		users: userIdList
	}).catch((err) => {
		console.log('<Error><InviteUsers>', err.data);
	});
}

exports.createChannels = (channelInfo) => {
	console.log('<Debug><Create Channels> Creating channels now for', channelInfo);

	channelInfo.forEach(function(channel) {
		console.log('<Debug><Create Channels> Creating for', channel);

		let id = getChannelId(channel.name);
		let userIdsToInvite = [];

		console.log('<Debug> Getting ready to do the check for who to invite for channel', channel.name, 'with id', id);

		if (channel.users === 'all') {
			userIdsToInvite = allUserIds;
		} else if (channel.users) {
			channel.users.split(',').forEach(function(user) {
				userIdsToInvite = userIdsToInvite + "," + getUserId(user);
			});
		}

		console.log('<MEGA DEBUG> About to figure out which Invite to do with ', id, 'and userIdsToInvite is', userIdsToInvite);

		if (id) {
			console.log('<DEBUG><Invite Users> Found an existing channel', channel.name, 'matched with', id);
			inviteUsersToChannel(id, userIdsToInvite);
		} else {
			console.log('<DEBUG><Create Channels> Creating the new channel', channel.name);

			webClientBot.channels.create({
				name: channel.name
			}).then((res) => {
				//need to invite users to channel now
				console.log('<DEBUG><Channel Create><channels.create> Success:', res)
				console.log('MEGA DEBUG trying to setPurpose for ', res.data.channel.id, ' do we havea purpose?', channel.purpose);

				if (channel.purpose) {
					webClientBot.channels.setPurpose({
						channel: res.data.channel.id,
						purpose: channel.purpose
					}).then((res) => {
						console.log('<DEBUG><Channel Purpose>', res.data);
					}).catch(console.error);
				}
				console.log('<DEBUG><Invite Users> About to invite users to new channel ID', res.data.channel.id);
				inviteUsersToChannel(res.data.channel.id, userIdsToInvite);

			}).catch((err) => {
				console.log('<Error><ChannelCreate>', err);
			});

		}
	});
}

exports.validateBotConnection = () => {
	webClientBot.auth.test()
		.then((res) => {

			//	console.log('<DEBUG>auth result is',res);
			const {
				team,
				user_id
			} = res;
			console.log('<Loading> Bot connected to workspace', team);

			// Cache info on the users for ID translation and inviting to channels
			buildUserList(user_id);

			getChannelList();

		})
		.catch((err) => {
			console.error('<Error><validateBotConnection><auth.test>', err);
		});

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
	}).catch((err) => {
		console.error('<Error><Admin Menu><webhook.send>', err);
	});
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
						replace_original: true,
						attachments: attachments
					};
				} else {
					response = {
						response_type: 'ephemeral',
						replace_original: true,
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
	console.log('<CallbacksMatch> DEBUG - received', callback, 'this is the payload', payload);

	let response = {
		text: "default response"
	};

	if (callback.dialog) {
		response = {
			trigger_id: payload.trigger_id,
			dialog: callback.attachments
		}
		webClientBot.dialog.open(response).then((res) => {
			console.log('<Debug><Callbacks> Dialog.Open worked with result', res);
		}).catch((err) => {
			console.error('<Error><callbackMatch><dialog.open> Dialog Open errored out with', err, 'and response_metadata', err.data.response_metadata);
			console.error(err);
		});

	}
	if (callback.ephemeral) {
		webClientBot.chat.postEphemeral({
			user: payload.user.id,
			channel: payload.channel.id,
			as_user: false,
			link_names: true,
			attachments: callback.attachments
		}).catch((err) => {
			console.error('<Error><callbackMatch><chat.postEphemeral>', err);
		});
	}
	if (callback.invite) {
		response = {
			user: getUserId(callback.username),
			channel: payload.channel.id
		}
		console.log('INVITING response', response);
		//Delay the item if specified, then execute the rest
		delay(callback.delay * 1000)
			.then((res) => {
				webClientBot.channels.invite(response).catch((err) => {
					console.error('<Error><callbackMatch><channels.invite>', err);
				});;
			}).catch(console.error);

	}

	// try this to let multiple types of actions happen on a single callback script line
	if ((!callback.dialog && !callback.ephemeral && !callback.invite) || (callback.invite && callback.update)) {
		response = {
			channel: payload.channel.id,
			text: callback.text,
			ts: payload.message_ts,
			icon_url: callback.icon_url,
			icon_emoji: callback.icon_emoji,
			username: callback.username,
			thread_ts: null,
			link_names: true,
			as_user: false,
			attachments: callback.attachments
		};

		if (callback.channel != 'current') {
			response.channel = getChannelId(callback.channel);
		}

		if (callback.update) {
			//	console.log('<Callbacks> DEBUG - this is an update, using', response);
			webClientBot.chat.update(response).catch((err) => {
				console.error('<Error><callbackMatch><chat.update>', err);
			});

		} else {
			console.log('<Callbacks> DEBUG - this is a new message, using', response);
			webClientBot.chat.postMessage(response).catch((err) => {
				console.error('<Error><callbackMatch><chat.postMessage>', err);
			});;
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

	//return {text: "yoyoyoy"};
}