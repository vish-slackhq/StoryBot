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

// TODO: figure out this whole token mess
// const webClientBot = new WebClient(process.env.SLACK_BOT_TOKEN);
const webClientBot = new WebClient(process.env.SLACK_AUTH_TOKEN);

// Global variables - way to not need these?
var message_history = []; // maintains the running session history, used for deletes and reply/reaction targets
var user_list = []; // cached user list for quicker lookups
var channel_list = []; // cached channel list for quicker lookups
//var allUserIds = [];

// The main function that plays back a given trigger once it's matched
// Takes the config for the specific trigger we are playing back, list of user tokens, and event data
exports.playbackScript = (config, tokens, event) => {
	// Form the string for unique message_history entry
	const trigger_term = event.text + "-" + event.ts;
	console.log('<DEBUG><playbackScript> Starting playback for', trigger_term);

	// Add history for a reaction trigger
	if (event.reaction) {
		addHistory(trigger_term, {
			item: -1,
			type: 'reaction_trigger',
			channel: event.channel,
			ts: event.ts,
			reaction: event.reaction
		});
		// TODO - what is this doing, are we sure we want to delete the triggering item in these cases?
	} else if (!config[0].delete_trigger && !(config[0].type == 'reply' && config[0].target_item === 'trigger')) {

		// Make it easy to cleanup the trigger term
		addHistory(trigger_term, {
			item: -1,
			type: 'trigger',
			channel: event.channel,
			ts: event.ts
		});
	}

	// Step through the trigger's script in the specified order
	async.eachSeries(config, function(action, nextItem) {

		// Ignore blank lines that may have been ingested for some reason 
		if (action.type) {

			//Clean up a fake slash command or other item that has `delete_trigger` set
			if (action.delete_trigger) {
				webClientBot.chat.delete({
					channel: event.channel,
					ts: event.ts
				}).catch((err) => {
					console.error('<Error><Main Loop><chat.delete trigger message>', err);
				});
			}

			//Delay an item for specified number of seconds, then execute it
			delay(action.delay * 1000)
				.then((res) => {
					let apiMethod, target_ts, target_channel, params;

					// As long as we aren't in prototype mode, this is the real stuff
					if (!(action.type === 'botuser')) {

						// Set targets for the actions that need them - reply, reaction, share, and files in a thread
						if (action.type === 'reply' || action.type === 'reaction' || action.type === 'share' || ((action.type === 'file') && action.target_item)) {
							// If these are manually specified, set them directly (used for sharing existing messages)
							if (action.target_ts && action.target_channel) {
								target_ts = action.target_ts;
								target_channel = action.target_channel;
							} else if (action.target_item.indexOf('thread') >= 0 && action.type === 'reaction') {
								// If trigger = `thread`, reaction is to the thread parent, not the triggering message
								target_ts = event.thread_ts;
								target_channel = event.channel;
							} else if (action.target_item.indexOf('trigger') >= 0) {
								// Respond in a thread to the triggering event and not the channel
								if ((action.type === 'file' || action.type === 'reply') && event.thread_ts) {
									target_ts = event.thread_ts;
								} else {
									target_ts = event.ts;
								}
								target_channel = event.channel;
							} else {
								// Otherwise just set the targets by looking them up in the existing message_history
								target_ts = message_history[trigger_term].find(o => o.item == action.target_item).ts;
								target_channel = message_history[trigger_term].find(o => o.item == action.target_item).channel;
							}
						}

						// Take action on the item by type
						switch (action.type) {
							case 'message':
							case 'reply':
								{
									webClientBot.chat.postMessage({
										token: tokens.find(o => o.name === action.username).token, //look up the user's token to post on their behalf
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
										//Add what just happened to the history
										addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.channel,
											ts: res.ts
										}).then((res) => {
											//Allow the async series to go forward
											nextItem();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
											nextItem();
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><chat.postMessage>', err);
										nextItem();
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

									// Bot messages can be sent to current channel for fake /commands
									if (action.channel === 'current') {
										params.channel = event.channel;
									}

									webClientBot.chat.postMessage(params)
									.then((res) => {
										//Add what just happened to the history
										addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.channel,
											ts: res.ts
										}).then((res) => {
											//Allow the async series to go forward
											nextItem();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
											nextItem();
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><chat.postMessage>', err);
										nextItem();
									});
									break;
								}
							case 'reaction':
								{
									webClientBot.reactions.add({
										token: tokens.find(o => o.name === action.username).token,
										as_user: true,
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
											nextItem();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
											nextItem();
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><reactions.add>', err);
										nextItem();
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
										//Add what just happened to the history
										addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.channel,
											ts: res.message_ts
										}).then((res) => {
											//Allow the async series to go forward
											nextItem();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
											nextItem();
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><chat.postEphemeral>', err);
										nextItem();
									});
									break;
								}
							case 'file':
								{
									webClientBot.files.upload({
										token: tokens.find(o => o.name === action.username).token,
										channels: action.channel,
										filetype: action.filetype,
										title: action.title,
										initial_comment: action.text,
										content: action.content,
										thread_ts: target_ts
									})
									.then((res) => {
										// Assuming we are using the first time the file has been shared
										let fileChannel = res.file.channels[0];
										let fileShareTS = res.file.shares.public[fileChannel][0].ts;
										//Add what just happened to the history - File
										addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.file.channels[0],
											ts: res.file.id
										}).then((res) => {
											//Add what just happened to the history - message that referenced the file
											addHistory(trigger_term, {
												item: -1 * action.item,
												type: 'message',
												channel: fileChannel,
												ts: fileShareTS
											}).catch((err) => {
												console.error('<Error><Main Loop><addHistory>', err);
												nextItem();
											});
											//Allow the async series to go forward
											nextItem();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
											nextItem();
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><files.upload>', err);
										nextItem();
									});
									break;
								}
							case 'status':
								{
									webClientBot.users.profile.set({
										token: tokens.find(o => o.name === action.username).token,
										profile: {
											"status_text": action.text,
											"status_emoji": action.reaction
										}
									})
									.then((res) => {
										//Add what just happened to the history
										addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											username: res.username,
											ts: res.message_ts // TODO - is this legit?
										}).then((res) => {
											//Allow the async series to go forward
											nextItem();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
											nextItem();
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><users.profile.set>', err);
										nextItem();
									});
									break;
								}
							case 'share':
								{
									// Private API method to share a message, needs to be called manually
									apiMethod = 'chat.shareMessage';

									params = {
										token: tokens.find(o => o.name === action.username).token,
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

										//Add what just happened to the history
										addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: result.data.channel,
											ts: ts
										}).then((result) => {
											//Allow the async series to go forward
											nextItem();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
											nextItem();
										});
									}).catch((err) => {
										console.error('API call for ', apiMethod, 'resulted in: ', err);
										nextItem();
									});
									break;
								}
							case 'sharefile':
								{
									// Private API method to share a file, needs to be called manually
									apiMethod = 'files.share';
									let sharefileChannelId = getChannelId(action.channel);

									params = {
										token: tokens.find(o => o.name === action.username).token,
										comment: action.text,
										channel: sharefileChannelId,
										file: action.target_item
									}

									//Make the call
									axios.post('https://slack.com/api/' + apiMethod, qs.stringify(params))
									.then((result) => {
										// Need to get back some additional information to account for File Threads
										webClientBot.files.info({
											file: action.target_item
										}).then((res) => {
											//Add what just happened to the history
											addHistory(trigger_term, {
												item: action.item,
												type: 'message',
												channel: sharefileChannelId,
												ts: res.file.shares.public[sharefileChannelId][0].ts
											}).then((result) => {
												//Allow the async series to go forward
												nextItem();
											}).catch((err) => {
												console.error('<Error><Main Loop><addHistory>', err);
												nextItem();
											});
										}).catch((err) => {
											console.error('<Error><Main Loop><ShareFile><files.info>', err);
											nextItem();
										});
									}).catch((err) => {
										console.error('API call for ', apiMethod, 'resulted in: ', err);
										nextItem();
									});
									break;
								}
							case 'invite':
								{
									let userId = getUserId(action.text)
									webClientBot.channels.invite({
										token: tokens.find(o => o.name === action.username).token,
										channel: getChannelId(action.channel),
										user: userId
									})
									.then((res) => {
										//Add what just happened to the history
										addHistory(trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.channel.id,
											user: userId
										}).then((res) => {
											//Allow the async series to go forward
											nextItem();
										}).catch((err) => {
											console.error('<Error><Main Loop><addHistory>', err);
											nextItem();
										});
									})
									.catch((err) => {
										console.error('<Error><Main Loop><channels.invite>', err);
										nextItem();
									});
									break;
								}
							default:
								console.log('Nothing matched to the action type?');
								nextItem();
								break;
						}
						// All of this botuser stuff enables quick protyping without tokens
					} else {
						// Is this something that has a target - i.e. a reaction or reply? Set up the targets
						if (action.target_item) {
							// Is the target the message/reaction that triggered this?
							if (action.target_item.indexOf('trigger') >= 0) {
								target_ts = event.ts;
								target_channel = event.channel;
								// Otherwise look up the referenced trigger item in the existing message_history
							} else {
								target_ts = message_history[trigger_term].find(o => o.item == action.target_item).ts;
								target_channel = message_history[trigger_term].find(o => o.item == action.target_item).channel;
							}
						}
						// Prototype reaction
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
										nextItem();
									}).catch((err) => {
										console.error('<Error><Main Loop><Prototype addHistory>', err);
										nextItem();
									});
								}).catch((err) => {
									console.error('<Error><Main Loop><Prototype reactions.add>', err);
									nextItem();
								});
							// Otherwise this is a message/bot message
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
									nextItem();
								}).catch((err) => {
									console.error('<Error><Main Loop><addHistory>', err);
									nextItem();
								});
							}).catch((err) => {
								console.error('<Error><Main Loop><chat.postMessage>', err);
								nextItem();
							});
						}
					}
				})
				.catch((err) => {
					console.error('<Error><Delay><Main Loop>', err);
					nextItem();
				});
		}
	})
}

// Process a match from the dynamic callback sheet
exports.callbackMatch = (payload, respond, callback) => {
	console.log('<DEBUG><callbackMatch> Starting callback match for', callback.callback_name);

	let response = {
		text: "default response"
	};

	//Delay the item if specified, then execute the rest
	delay(callback.delay * 1000).then((res) => {
		// Check for some of the options for a Callback - these can be combined together

		// Dialog response to callback is true
		if (callback.dialog) {
			response = {
				trigger_id: payload.trigger_id,
				dialog: callback.attachments
			}
			webClientBot.dialog.open(response).catch((err) => {
				console.error('<Error><callbackMatch><dialog.open> Dialog Open errored out with', err, 'and response_metadata', err.data.response_metadata);
			});
		}

		// Ephemeral response as well
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

		// Invite based on an interactive message
		if (callback.invite) {
			let userId = getUserId(callback.username)
			response = {
				user: userId,
				channel: payload.channel.id
			}
			webClientBot.channels.invite(response)
				.then((res) => {
					//Add what just happened to the history
					addHistory(callback.callback_name, {
						item: 0,
						type: "invite",
						channel: res.channel.id,
						user: userId
					}).catch((err) => {
						console.error('<Error><CallbackMatchInvite><addHistory>', err);
					});
				})
				.catch((err) => {
					console.error('<Error><callbackMatch><channels.invite> with params', response, 'and err:', err);
				});
		}

		// If there are additional callback items to process, do them
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
				webClientBot.chat.update(response)
					.then((res) => {
						//Add what just happened to the history
						addHistory(callback.callback_name, {
							item: -10,
							type: 'callback_postMessage',
							channel: res.channel,
							ts: res.ts
						}).catch((err) => {
							console.error('<Error><CallbackMatch><addHistory>', err);
						});
					}).catch((err) => {
						console.error('<Error><callbackMatch><chat.update>', err);
					});
			} else {
				webClientBot.chat.postMessage(response)
					.then((res) => {
						//Add what just happened to the history
						addHistory(callback.callback_name, {
							item: -10,
							type: 'callback_postMessage',
							channel: res.channel,
							ts: res.ts
						}).catch((err) => {
							console.error('<Error><CallbackMatch><addHistory>', err);
						});
					})
					.catch((err) => {
						console.error('<Error><callbackMatch><chat.postMessage>', err);
					});;
			}
		}
	}).catch(console.error);
}

// Delete something from the history
const deleteHistoryItem = (term) => {
	if (!message_history[term]) {
		console.log('<Error><deleteHistoryItem> Well this is embarassing:' + term + "doesn't exist in history");
		// Send this back to format an in-Slack message
		return 'Well this is embarassing: ' + term + " doesn't exist in history";
	} else {
		async.each(message_history[term], function(historyItem, nextItem) {
			if (historyItem.type === 'file') {
				webClientBot.files.delete({
					file: historyItem.ts
				}).catch((err) => {
					console.error('<Error><deleteHistoryItem><files.delete>', err);
				});
			} else if (historyItem.type === 'status') {
				webClientBot.users.profile.set({
					user: getUserId(historyItem.username),
					profile: {
						"status_text": "",
						"status_emoji": ""
					}
				}).catch((err) => {
					console.error('<Error><deleteHistoryItem><users.profile.set>', err);
				});
			} else if (historyItem.type === 'invite') {
				webClientBot.channels.kick({
					channel: historyItem.channel,
					user: historyItem.user
				}).catch((err) => {
					console.error('<Error><deleteHistoryItem><channels.kick>', err);
				});
			} else if (historyItem.type === 'reaction_trigger') {
				console.log('<DEBUG><reaction trigger history delete> name:', historyItem.reaction, 'channel:', historyItem.channel, 'timestamp:', historyItem.ts);
				webClientBot.reactions.remove({
					name: historyItem.reaction,
					channel: historyItem.channel,
					timestamp: historyItem.ts
				}).catch((err) => {
					console.error('<Error><deleteHistoryItem><reactions.remove> for term', term, 'and item', historyItem, '\nError is', err);
					console.log('<DEBUG><ERROR><reaction trigger history delete> name:', historyItem.reaction, 'channel:', historyItem.channel, 'timestamp:', historyItem.ts);

				});
			} else if (!(historyItem.type === 'reaction') && !(historyItem.type === 'ephemeral')) { //&& !(message_history[term][i].type === 'trigger')) {
				webClientBot.chat.delete({
					channel: historyItem.channel,
					ts: historyItem.ts
				}).catch((err) => {
					console.error('<Error><deleteHistoryItem><chat.delete> for term', term, '\nError is', err);
				});
			}
			nextItem();
		});
		delete message_history[term];
		console.log('<History> Successfully deleted', term, 'from the history.');
		return 'Successfully deleted ' + term + ' from the history.';
	}
}

// Build and send the StoryBot admin menu when called
exports.adminMenu = (body) => {

	const {
		//	token,
		text,
		response_url,
		//	trigger_id,
		//	command
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
	// TODO - consider cleaning these up to avoid excess clutter in the channel
	webhook.send({
		attachments: admin_menu,
		response_type: 'ephemeral',
		replace_original: true
	}).catch((err) => {
		console.error('<Error><Admin Menu><webhook.send>', err);
	});
}

// Handle the admin menu callbacks
exports.adminCallback = (payload, respond) => {
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
	// Send back something immediately
	// TODO - response prob isn't anything, right?
	respond(response).catch(console.error);
}

//
// Helper Functions
//

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
// This is used with an event subscription to delete things that might not already be in the history
exports.deleteItem = (channel, ts) => {
	// Get a list of any thread replies to delete as well
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
}

// Get the list of all users and their IDs and store it for faster caching
const buildUserList = (authBotId) => {
	webClientBot.users.list()
		.then((res) => {
			user_list = res.members;
		}).catch((err) => {
			console.error('<Error><buildUserList><users.list>', err);
		});
}

// Look up User ID from a Name
const getUserId = (name) => {
	//remove any spaces in the names being passed
	name = name.replace(/\s+/g, '');
	// TODO	let id = user_list.find(o => o.name === name).id;
	// TODO	return id;
	return user_list.find(o => o.name === name).id
}

// Get the list of all channels and their IDs and cache it
const getChannelList = () => {
	webClientBot.channels.list({
			exclude_members: true,
			exclude_archived: true,
			get_private: true
		})
		.then((res) => {
			channel_list = res.channels;
		})
		.catch((err) => {
			console.error('<Error><getChannelListm><channels.list>', err);
		});
}

// Look up Channel ID from a Name
const getChannelId = (name) => {
	let result = null;
	if (channel_list.find(channel => channel.name === name)) {
		result = channel_list.find(channel => channel.name === name).id;
	}
	return result;
}

// Invite a list of users to a channel
const inviteUsersToChannel = (channelId, userIdList) => {
	webClientBot.channels.invite({
		channel: channelId,
		users: userIdList
	}).catch((err) => {
		console.log('<Error><InviteUsers>', err.data);
	});
}

// Create channels from the config info
exports.createChannels = (channelInfo) => {
	console.log('<Debug><Create Channels> Creating channels now for', channelInfo);

	channelInfo.forEach(function(channel) {
		console.log('<Debug><Create Channels> Creating for', channel);

		let id = getChannelId(channel.name);
		let userIdsToInvite = [];

		console.log('<Debug> Getting ready to do the check for who to invite for channel', channel.name, 'with id', id);

		if (channel.users === 'all') {
			//		userIdsToInvite = allUserIds;

			user_list.forEach(function(user) {
				if (!(user.id === authBotId || user.id === 'USLACKBOT')) {
					userIdsToInvite = userIdsToInvite + "," + user.id;
				}
			});
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

// Do the initial work to make sure there's a valid connection, cache users and channels
exports.validateBotConnection = () => {
	webClientBot.auth.test()
		.then((res) => {

			console.log('<DEBUG>auth result is', res);
			const {
				team,
				user_id
			} = res;
			console.log('<Loading> Bot connected to workspace', team);

			// Cache info on the users for ID translation and inviting to channels
			// TODO - make this the bot's ID so it's excluded?
			buildUserList(user_id);
			getChannelList();
		})
		.catch((err) => {
			console.error('<Error><validateBotConnection><auth.test>', err);
		});
}

// Clean up the history when a specific history term is being cleaned
exports.historyCleanup = (payload, respond) => {
	let msg = deleteHistoryItem(payload.actions[0].value);

	response = {
		text: msg,
		replace_original: true,
		ephemeral: true
	};
	respond(response).catch(console.error);
}