// Modules
const async = require("async");

// Need this for shared message due to no SDK suppport
const qs = require('querystring');
const axios = require('axios');

// Webhooks for slash command response
const {
	IncomingWebhook
} = require('@slack/client');

// The main function that plays back a given trigger once it's matched
// Takes the config for the specific trigger we are playing back, list of user tokens, and event data
exports.playbackScript = (config, term, event) => {
	// Get the Slack Web API client for the user's token
	let tokens = config.scripts.Tokens;

	// Form the string for unique message_history entry
	const trigger_term = event.text + "-" + event.ts;
	console.log('<DEBUG><playbackScript> Starting playback for', trigger_term);

	// Add history for a reaction trigger
	if (event.reaction) {
		addHistory(config, trigger_term, {
			item: -1,
			type: 'reaction_trigger',
			channel: event.channel,
			ts: event.ts,
			reaction: event.reaction
		});
		// TODO - what is this doing, are we sure we want to delete the triggering item in these cases?
	} else if (!config.scripts[term][0].delete_trigger && !(config.scripts[term][0].type == 'reply' && config.scripts[term][0].target_item === 'trigger')) {
		// Make it easy to cleanup the trigger term
		addHistory(config, trigger_term, {
			item: -1,
			type: 'trigger',
			channel: event.channel,
			ts: event.ts
		});
	}

	// Step through the trigger's script in the specified order
	async.eachSeries(config.scripts[term], function(action, nextItem) {

		// Ignore blank lines that may have been ingested for some reason 
		if (action.type) {
			//Clean up a fake slash command or other item that has `delete_trigger` set
			if (action.delete_trigger) {
				config.webClientUser.chat.delete({
					//		webClientArray
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

					// check if the action has attachments, then check if the format needs to be cleaned up
					if (action.attachments) {
						// TODO: I'm sure I can do this more elegantly with a single regex
						action.attachments = action.attachments.replace(/\{\n\s*\"attachments\":/, '');
						action.attachments = action.attachments.replace(/}$/, '');
					}

					// check if the action has a reaction, then check if the format needs to be cleaned up for the places where : isn't accepted
					if (action.reaction) {
						action.reaction = action.reaction.replace(/:/g, '');
					}

					// check if the action has an icon_emoji, then check if the format needs to be cleaned up for the places where : is required
					if (action.icon_emoji) {
						if (action.icon_emoji.match(/^(?!:).*(?!:)$/)) {
							action.icon_emoji = ':' + action.icon_emoji + ':';
						}
					}

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
								target_ts = config.message_history[trigger_term].find(o => o.item == action.target_item).ts;
								target_channel = config.message_history[trigger_term].find(o => o.item == action.target_item).channel;
							}
						}

						// Take action on the item by type
						switch (action.type) {
							case 'message':
							case 'reply':
								{
									config.webClientUser.chat.postMessage({
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
										addHistory(config, trigger_term, {
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

									if (!action.ephemeral) {
										config.webClientUser.chat.postMessage(params)
											.then((res) => {
												//Add what just happened to the history
												addHistory(config, trigger_term, {
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
												console.error('<Error><Main Loop><Bot chat.postMessage>', err);
												nextItem();
											});
									} else {
										params.user = event.user;
										config.webClientUser.chat.postEphemeral(params)
											.then((res) => {
												//Add what just happened to the history
												addHistory(config, trigger_term, {
													item: action.item,
													type: 'ephemeral',
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
									}
									break;
								}
							case 'reaction':
								{
									config.webClientUser.reactions.add({
										token: tokens.find(o => o.name === action.username).token,
										as_user: true,
										username: action.username,
										channel: target_channel,
										name: action.reaction,
										timestamp: target_ts
									})
									.then((res) => {
										//Add what just happened to the history
										addHistory(config, trigger_term, {
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
							case 'file':
								{
									config.webClientUser.files.upload({
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
										addHistory(config, trigger_term, {
											item: action.item,
											type: action.type,
											channel: res.file.channels[0],
											ts: res.file.id
										}).then((res) => {
											//Add what just happened to the history - message that referenced the file
											addHistory(config, trigger_term, {
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
									config.webClientUser.users.profile.set({
										token: tokens.find(o => o.name === action.username).token,
										profile: {
											"status_text": action.text,
											"status_emoji": action.reaction
										}
									})
									.then((res) => {
										//Add what just happened to the history
										addHistory(config, trigger_term, {
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
										addHistory(config, trigger_term, {
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
									let sharefileChannelId = getChannelId(config, action.channel);

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
										config.webClientUser.files.info({
											file: action.target_item
										}).then((res) => {
											//Add what just happened to the history
											addHistory(config, trigger_term, {
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
									let userId = getUserId(config, action.text)
									config.webClientUser.channels.invite({
										token: tokens.find(o => o.name === action.username).token,
										channel: getChannelId(config, action.channel),
										user: userId
									})
									.then((res) => {
										//Add what just happened to the history
										addHistory(config, trigger_term, {
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
								target_ts = config.message_history[trigger_term].find(o => o.item == action.target_item).ts;
								target_channel = config.message_history[trigger_term].find(o => o.item == action.target_item).channel;
							}
						}
						// Prototype reaction
						if (action.reaction) {
							config.webClientUser.reactions.add({
									as_user: false,
									username: action.username,
									channel: target_channel,
									name: action.reaction,
									timestamp: target_ts
								})
								.then((res) => {
									//Add what just happened to the history
									addHistory(config, trigger_term, {
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
							config.webClientUser.chat.postMessage({
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
								addHistory(config, trigger_term, {
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
exports.callbackMatch = (payload, respond, config, callback) => {
	console.log('<DEBUG><callbackMatch> Starting callback match for', callback.callback_name);

	let response = {
		text: "default response"
	};

	// check if the callback has attachments, then check if the format needs to be cleaned up
	if (callback.attachments) {
		// TODO: I'm sure I can do this more elegantly with a single regex
		callback.attachments = callback.attachments.replace(/\{\n\s*\"attachments\":/, '');
		callback.attachments = callback.attachments.replace(/}$/, '');
	}

	// Check for some of the options for a Callback - these can be combined together
	// Dialog response to callback is true
	if (callback.dialog) {
		response = {
			trigger_id: payload.trigger_id,
			dialog: callback.attachments
		}
		config.webClientUser.dialog.open(response).catch((err) => {
			console.error('<Error><callbackMatch><dialog.open> Dialog Open errored out with', err, 'and response_metadata', err.data.response_metadata);
		});
	}

	// Ephemeral response as well
	if (callback.ephemeral) {
		config.webClientUser.chat.postEphemeral({
			user: payload.user.id,
			channel: payload.channel.id,
			as_user: false,
			link_names: true,
			attachments: callback.attachments
		}).catch((err) => {
			console.error('<Error><callbackMatch><chat.postEphemeral>', err);
		});
	}

	// Delay the item if specified, then execute the rest
	// I don't know that anything else would need a delay, this is really just for the invite + other messages for Fox WC Demo 
	delay(callback.delay * 1000).then((res) => {
		// Invite based on an interactive message
		if (callback.invite) {
			let userId = getUserId(config, callback.username)
			response = {
				user: userId,
				channel: payload.channel.id
			}
			config.webClientUser.channels.invite(response)
				.then((res) => {
					//Add what just happened to the history
					addHistory(config, callback.callback_name, {
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
	}).catch(console.error);

	// If there are additional callback items to process, do them
	if ((!callback.dialog && !callback.ephemeral && !callback.invite) || (callback.invite && callback.update)) {

		// check if the callback has an icon_emoji, then check if the format needs to be cleaned up for the places where : is required
		if (callback.icon_emoji) {
			if (callback.icon_emoji.match(/^(?!:).*(?!:)$/)) {
				callback.icon_emoji = ':' + callback.icon_emoji + ':';
			}
		}

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
			response.channel = getChannelId(config, callback.channel);
		}

		if (callback.update) {
			// TODO - This should be a respond(), right?
			config.webClientUser.chat.update(response)
				.then((res) => {
					//Add what just happened to the history
					addHistory(config, callback.callback_name, {
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
			// TODO - This should be a respond(), right?
			config.webClientUser.chat.postMessage(response)
				.then((res) => {
					//Add what just happened to the history
					addHistory(config, callback.callback_name, {
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
}

// Delete something from the history
const deleteHistoryItem = (config, term) => {

	if (!config.message_history[term]) {
		console.log('<Error><deleteHistoryItem> Well this is embarassing:' + term + "doesn't exist in history");
		// Send this back to format an in-Slack message
		return 'Well this is embarassing: ' + term + " doesn't exist in history";
	} else {
		async.each(config.message_history[term], function(historyItem, nextItem) {
			if (historyItem.type === 'file') {
				config.webClientUser.files.delete({
					file: historyItem.ts
				}).catch((err) => {
					console.error('<Error><deleteHistoryItem><files.delete>', err);
				});
			} else if (historyItem.type === 'status') {
				config.webClientUser.users.profile.set({
					user: getUserId(config, historyItem.username),
					profile: {
						"status_text": "",
						"status_emoji": ""
					}
				}).catch((err) => {
					console.error('<Error><deleteHistoryItem><users.profile.set>', err);
				});
			} else if (historyItem.type === 'invite') {
				config.webClientUser.channels.kick({
					channel: historyItem.channel,
					user: historyItem.user
				}).catch((err) => {
					console.error('<Error><deleteHistoryItem><channels.kick>', err);
				});
			} else if (historyItem.type === 'reaction_trigger') {
				console.log('<DEBUG><reaction trigger history delete> name:', historyItem.reaction, 'channel:', historyItem.channel, 'timestamp:', historyItem.ts);
				config.webClientUser.reactions.remove({
					name: historyItem.reaction,
					channel: historyItem.channel,
					timestamp: historyItem.ts
				}).catch((err) => {
					console.error('<Error><deleteHistoryItem><reactions.remove> for term', term, 'and item', historyItem, '\nError is', err);
					console.log('<DEBUG><ERROR><reaction trigger history delete> name:', historyItem.reaction, 'channel:', historyItem.channel, 'timestamp:', historyItem.ts);

				});
			} else if (!(historyItem.type === 'reaction') && !(historyItem.type === 'ephemeral')) { //&& !(message_history[term][i].type === 'trigger')) {
				config.webClientUser.chat.delete({
					channel: historyItem.channel,
					ts: historyItem.ts
				}).catch((err) => {
					console.error('<Error><deleteHistoryItem><chat.delete> for term', term, '\nError is', err);
				});
			}
			nextItem();
		});
		delete config.message_history[term];
		console.log('<History> Successfully deleted', term, 'from the history.');
		return 'Successfully deleted ' + term + ' from the history.';
	}
}

// Build and send the StoryBot admin menu when called
exports.adminMenu = (body) => {

	const {
		text,
		response_url,
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
			name: 'Config',
			text: 'Config',
			type: 'button',
			style: 'default',
			value: 'Config'
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
exports.adminCallback = (payload, respond, configTools) => {
	configTools.getConfig(payload.team.id).then((config) => {
	//	console.log('adminCallback config is!', config);
		switch (payload.actions[0].value) {
			case 'Triggers':
				{
					//let triggerKeys = config.keys;
					if (config.keys.length > 0) {
						let attachments = [];
						let key_list = ""
						config.keys.forEach(function(key) {
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
			case 'History':
				{
					console.log('<Admin Menu> History is:', config.message_history);
					let response = {
						response_type: 'ephemeral',
						replace_original: true,
						text: "No history right now"
					}

					let message_history_keys = Object.keys(config.message_history);

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
					}

					respond(response).catch((err) => {
						console.error('<Error><Admin Menu><History>', err);
					});
					break;
				}
			case 'Reload Config':
				{
					// calling this with nulls to use existing sheet values
					configTools.loadConfig(payload.team.id).catch(console.error);

					respond({
						text: "OK! I'm re-loading!",
						response_type: 'ephemeral',
						replace_original: true
					}).catch((err) => {
						console.error('<Error><Admin Menu><Reload Config>', err);
					});
					break;
				}
			case 'Cleanup All':
				{
					let msg = deleteAllHistory(config);
					respond({
						text: msg,
						replace_original: true,
						ephemeral: true
					}).catch((err) => {
						console.error('<Error><Admin Menu><Cleanup All>', err);
					});
					break;
				}
			case 'Config':
				{
					// TODO janky, fix eventually
					console.log('Config request for team', payload.team.id);

					let gsheetID = '',
						clientEmail = '',
						privateKey = '';
					if (config.configParams) {
						gsheetID = config.configParams.gsheetID;
						clientEmail = config.configParams.clientEmail;
						privateKey = config.configParams.privateKey;
					}

					const configDialog = {
						callback_id: 'callback_config',
						title: 'Configuration Menu',
						submit_label: 'Submit',
						elements: [{
							optional: false,
							max_length: 150,
							hint: 'URL to the Google Sheet with the Config Info',
							name: 'Google Sheet Link',
							value: gsheetID,
							placeholder: '',
							min_length: 0,
							label: 'Google Sheet Link',
							type: 'text'
						}, {
							optional: false,
							max_length: 150,
							hint: 'Email address that the sheet is shared with',
							name: 'Google API Email',
							value: clientEmail,
							placeholder: '',
							min_length: 0,
							label: 'Google API Email',
							type: 'text'
						}, {
							optional: false,
							max_length: 2000,
							hint: 'Private key',
							name: 'Google Private Key',
							value: privateKey,
							placeholder: '',
							min_length: 0,
							label: 'Google Private Key',
							type: 'textarea'
						}]
					};

					config.webClientUser.dialog.open({
						trigger_id: payload.trigger_id,
						dialog: configDialog
					}).catch((err) => {
						console.log('<Error><Admin Menu><Config dialog.open>', err);
					});

					break;
				}
			case 'Create Channels':
				{
					console.log('<Debug><Creating Channels>');
					createChannels(configTools.getConfig(payload.team.id).script.Channels);

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
					respond({
						text: ":thinking_face: Not sure how that happened",
						replace_original: true,
						ephemeral: true
					}).catch((err) => {
						console.error('<Error><Admin Menu><Default>', err);
					});
					break;
				}
		}
	});
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
const addHistory = (config, term, data) => {
	return new Promise(function(resolve) {
		if (!config.message_history[term]) {
			config.message_history[term] = [];
		}
		resolve(config.message_history[term].push(data));
	});
}

// Burn it all down
const deleteAllHistory = (config) => {
	let historyKeys = Object.keys(config.message_history);
	if (!(historyKeys.length > 0)) {
		console.log('<History> No history to delete!');
		return "No history to delete!";
	} else {
		historyKeys.forEach(function(key) {
			deleteHistoryItem(config, key);
		});
		return "All history deleted";
	}
}

// Delete a message (or, if it's the first message in a thread, delete the whole thread)
// This is used with an event subscription to delete things that might not already be in the history
exports.deleteItem = (webClient, channel, ts) => {
	// Get a list of any thread replies to delete as well
	webClient.channels.replies({
		channel: channel,
		thread_ts: ts
	}).then((res) => {
		res.messages.forEach(function(message) {
			webClient.chat.delete({
				channel: channel,
				ts: message.ts
			}).catch(console.error);
		});
	}).catch((err) => {
		console.error('<Error><deleteItem><chat.delete>', err);
	});
}

// Look up User ID from a Name
const getUserId = (config, name) => {
	//remove any spaces in the names being passed
	name = name.replace(/\s+/g, '');
	// TODO	let id = user_list.find(o => o.name === name).id;
	// TODO	return id;
	return config.user_list.find(o => o.name === name).id
}

// Look up Channel ID from a Name
const getChannelId = (config, name) => {
	let result = null;
	if (config.channel_list.find(channel => channel.name === name)) {
		result = config.channel_list.find(channel => channel.name === name).id;
	}
	return result;
}

// Invite a list of users to a channel
const inviteUsersToChannel = (channelId, userIdList) => {
	webClientUser.channels.invite({
		channel: channelId,
		users: userIdList
	}).catch((err) => {
		console.log('<Error><InviteUsers>', err.data);
	});
}

// Create channels from the config info
const createChannels = (channelInfo) => {
	console.log('<Debug><Create Channels> Creating channels now for', channelInfo);

	channelInfo.forEach(function(channel) {
		console.log('<Debug><Create Channels> Creating for', channel);

		let id = getChannelId(channel.name);
		let userIdsToInvite = [];

		console.log('<Debug> Getting ready to do the check for who to invite for channel', channel.name, 'with id', id);

		if (channel.users === 'all') {

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

			webClientUser.channels.create({
				name: channel.name
			}).then((res) => {
				//need to invite users to channel now
				console.log('<DEBUG><Channel Create><channels.create> Success:', res)
				console.log('MEGA DEBUG trying to setPurpose for ', res.data.channel.id, ' do we havea purpose?', channel.purpose);

				if (channel.purpose) {
					webClientUser.channels.setPurpose({
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

// Clean up the history when a specific history term is being cleaned
exports.historyCleanup = (config, payload, respond) => {
	let msg = deleteHistoryItem(config, payload.actions[0].value);

	response = {
		text: msg,
		replace_original: true,
		ephemeral: true
	};
	respond(response).catch(console.error);
}