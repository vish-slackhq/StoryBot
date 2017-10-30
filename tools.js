/*
Tools
*/
const qs = require('querystring');
const axios = require('axios');
var async = require("async");
require('dotenv').config();

var message_history = [];

const delay = (time) => {
	return new Promise(function(resolve) {
		setTimeout(resolve, time);
	});
}

const addHistory = (name, data) => {
	return new Promise(function(resolve) {
		if (!message_history[name]) {
			message_history[name] = [];
		}
		resolve(message_history[name].push(data));
	});
}

exports.getHistory = () => {
	return message_history;
}

exports.deleteHistoryItem = (term) => {
	if (!message_history[term]) {
		return "Well this is embarassing: " + term + " doesn't exist in history";
	} else {

		for (var i = 0; i < message_history[term].length; i++) {
			if (!(message_history[term][i].type === 'reaction')) {
				axios.post('https://slack.com/api/chat.delete', qs.stringify({
					token: process.env.SLACK_AUTH_TOKEN,
					channel: message_history[term][i].channel,
					ts: message_history[term][i].ts
				})).then((result) => {
					//		console.log('DELETE API result is ',result);
				}).catch((err) => {
					console.error('API call for ', apiMethod, 'resulted in: ', err);
				});
			}
		}
		delete message_history[term];
		return "Successfully deleted " + term + " from the history.";
	}
}

/*
// Maybe make this return a Promise and kill the message history for this chapter in the main function!
exports.deleteChapter = (chapter) => {

	if (!message_history[chapter]) return;

	for (let i = 0; i < message_history[chapter].length; i++) {
		if ((message_history[chapter][i][1].indexOf('post') >= 0)) {
			web.files.delete(message_history[chapter][i][2])
			.then((res, err) => {
				if(!err) {

				}
			})
			.catch(console.error);
		} else if (message_history[chapter][i][1].indexOf('reaction') < 0) {
			web.chat.delete(message_history[chapter][i][2],message_history[chapter][i][3])
			.then((res, err) => {
				if(!err) {
				}
			})
			.catch(console.error);
		}
	}
	delete message_history[chapter];
}*/

exports.deleteAllHistory = () => {
	var historyKeys = Object.keys(message_history);
	if (!(historyKeys.length > 0)) {
		return "No history to delete!";
	} else {
		historyKeys.forEach(function(key) {
			module.exports.deleteHistoryItem(key);
		});
		return "All history deleted";
	}
}

exports.playbackStory = (config, event) => {
	const trigger_term = event.text + "-" + event.ts;
	addHistory(trigger_term, {
		item: -1,
		type: 'trigger',
		channel: event.channel,
		ts: event.ts
	});

	async.eachSeries(config[event.text], function(action, callback) {
		if (action.type) {
			//Get out delay on UP FRONT, then execute the rest
			delay(action.delay * 1000)
				.then((res) => {
					var apiMethod, token, as_user, target_ts, target_channel, params;
					if (action.type === 'reply' || action.type === 'reaction') {
						if (action.target_item.indexOf('trigger') >= 0) {
							target_channel = event.channel;
							target_ts = event.ts;
						} else {
							target_ts = message_history[trigger_term].find(o => o.item == action.target_item).ts;
							target_channel = message_history[trigger_term].find(o => o.item == action.target_item).channel;
						}
					} else {
						target_ts = null;
					}
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
									link_names: 1,
									unfurl_links: "true",
									attachments: action.attachments
								};
								break;
							}
						case 'bot':
							{
								apiMethod = 'chat.postMessage';
								params = {
									token: process.env.SLACK_BOT_TOKEN,
									as_user: false,
									username: action.username,
									channel: action.channel,
									text: action.text,
									link_names: 1,
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
						default:
							console.log('default callback');
							callback();
							break;
					}
					axios.post('https://slack.com/api/' + apiMethod, qs.stringify(params))
						.then((result) => {
							//		console.log('API call for ', apiMethod, 'resulted in: ', result.data);
							addHistory(trigger_term, {
								item: action.item,
								type: action.type,
								channel: result.data.channel,
								ts: result.data.ts
							}).then((result) => {
								callback();
							});
						}).catch((err) => {
							console.error('API call for ', apiMethod, 'resulted in: ', err);
						});
				})
		}
	})
}