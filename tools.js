/*
Tools
*/
const qs = require('querystring');
const axios = require('axios');
const async = require("async");
require('dotenv').config();

var message_history = [];
var user_list = [];
var all_users = [];

exports.authUserID;
exports.authBotID;

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

/*
exports.getHistory = () => {
	return message_history;
}
*/

//Delete something from the history
exports.deleteHistoryItem = (term) => {
	if (!message_history[term]) {
		return "Well this is embarassing: " + term + " doesn't exist in history";
	} else {
		for (let i = message_history[term].length - 1; i >= 0; i--) {
			if (message_history[term][i].type === 'post') {
				axios.post('https://slack.com/api/files.delete', qs.stringify({
					token: process.env.SLACK_AUTH_TOKEN,
					file: message_history[term][i].ts
				})).then((result) => {

				}).catch((err) => {
					console.error('API call resulted in: ', err);
				});
			} else if (!(message_history[term][i].type === 'reaction')) {
				axios.post('https://slack.com/api/chat.delete', qs.stringify({
					token: process.env.SLACK_AUTH_TOKEN,
					channel: message_history[term][i].channel,
					ts: message_history[term][i].ts
				})).then((result) => {

				}).catch((err) => {
					console.error('API call resulted in: ', err);
				});
			}
		}
		delete message_history[term];
		return "Successfully deleted " + term + " from the history.";
	}
}

//Burn it all down
exports.deleteAllHistory = () => {
	let historyKeys = Object.keys(message_history);
	if (!(historyKeys.length > 0)) {
		return "No history to delete!";
	} else {
		historyKeys.forEach(function(key) {
			module.exports.deleteHistoryItem(key);
		});
		return "All history deleted";
	}
}

// The main event - once we match a trigger, play back all the items in the config sheet!
exports.playbackStory = (config, event) => {
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
				axios.post('https://slack.com/api/chat.delete', qs.stringify({
					token: process.env.SLACK_AUTH_TOKEN,
					channel: event.channel,
					ts: event.ts
				})).catch((err) => {
					console.error('API call for delete resulted in: ', err);
				});
			}

			//Delay the item if specified, then execute the rest
			delay(action.delay * 1000)
				.then((res) => {
					let apiMethod, token, as_user, target_ts, target_channel, params;

					// Set targets for the actions that need them
					if (action.type === 'reply' || action.type === 'reaction' || action.type === 'share') {
						if (action.target_item.indexOf('trigger') >= 0) {
							target_ts = event.ts;
							target_channel = event.channel;
						} else if (action.target_ts && action.target_channel) {
							target_ts = action.target_ts;
							target_channel = action.target_channel;
						} else {
							target_ts = message_history[trigger_term].find(o => o.item == action.target_item).ts;
							target_channel = message_history[trigger_term].find(o => o.item == action.target_item).channel;
						}
					}

					// Pull together the paramters for the item
					switch (action.type) {
						case 'message':
						case 'reply':
							{
								apiMethod = 'chat.postMessage';
								params = {
									token: config['Tokens'].find(o => o.name === action.username).token,
									as_user: true,
									username: action.username,
									channel: action.channel,
									text: action.text,
									thread_ts: target_ts,
									link_names: true,
									unfurl_links: "true",
									attachments: action.attachments
								};
								break;
							}
						case 'bot':
							{
								if (action.type === 'ephemeral') {
									apiMethod = 'chat.postEphemeral';
								} else {
									apiMethod = 'chat.postMessage';
								}
								params = {
									token: process.env.SLACK_BOT_TOKEN,
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
								break;
							}
						case 'reaction':
							{
								apiMethod = 'reactions.add';
								params = {
									token: config['Tokens'].find(o => o.name === action.username).token,
									as_user: true,
									username: action.username,
									channel: target_channel,
									name: action.reaction,
									timestamp: target_ts
								};
								break;
							}
						case 'ephemeral':
							{
								apiMethod = 'chat.postEphemeral';

								console.log('debug event: ', event);
								params = {
									token: process.env.SLACK_BOT_TOKEN,
									user: event.user,
									channel: event.channel,
									as_user: false,
									link_names: true,
									attachments: action.attachments
								}
								break;
							}
						case 'post':
							{
								apiMethod = 'files.upload';
								params = {
									token: config['Tokens'].find(o => o.name === action.username).token,
									channels: action.channel,
									filetype: 'post',
									title: action.title,
									initial_comment: action.text,
									content: action.content
								}
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
								break;
							}
						default:
							console.log('default callback');
							callback();
							break;
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
								callback();
							});
						}).catch((err) => {
							console.error('API call for ', apiMethod, 'resulted in: ', err);
						});
				})
		}
	})
}

// Get the list of all users and their IDs
exports.getUserList = () => {
	axios.post('https://slack.com/api/users.list', qs.stringify({
			token: process.env.SLACK_BOT_TOKEN
		}))
		.then((res) => {
			user_list = res.data.members;
			all_users = module.exports.authBotID;

			user_list.forEach(function(user) {
				if (!(user.id === module.exports.authUserID || user.name === 'USLACKBOT')) {
					all_users = all_users + "," + user.id;
				}
			});
		});
}

// Look up User ID from a Name
const getUserId = (name) => {
	let id = user_list.find(o => o.name === name).id;
	return id;
}

// Create channels from the CHannels tab, invite the specified users (or all) and add the bot
exports.createChannels = (channel_info) => {
	console.log('Creating channels now:', channel_info);
	channel_info.forEach(function(channel) {
		console.log('create stuff for chan: ', channel.name);
		axios.post('https://slack.com/api/channels.create', qs.stringify({
				token: process.env.SLACK_AUTH_TOKEN,
				name: channel.name,
				purpose: channel.purpose
			}))
			.then((res) => {
				console.log('res.data = ', res.data);
				console.log('channel ID is now: ', res.data.channel.id);

				let users = channel.users.split(',')
				let userIds = module.exports.authBotID;

				if (channel.users === 'all') {
					userIds = all_users;
				} else {
					users.forEach(function(user) {
						userIds = userIds + "," + getUserId(user);
					});
				}

				axios.post('https://slack.com/api/channels.invite', qs.stringify({
						token: process.env.SLACK_AUTH_TOKEN,
						channel: res.data.channel.id,
						users: userIds
					}))
					.then((res) => {
						console.log('channel creaton had res: ', res.data);
					}).catch((err) => {
						console.log('error inviting to channel: ', err)
					});
			}).catch((err) => {
				console.log('error creating channel: ', err)
			});
	});
}