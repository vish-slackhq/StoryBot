/*
Tools
*/
const qs = require('querystring');
const axios = require('axios');
const async = require("async");
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
		//  console.log("Overall history is ",message_history[term]);
		for (let i = message_history[term].length - 1; i >= 0; i--) {
		//	 console.log("i is now ",i, " and the item is ",message_history[term][i]);
			if (message_history[term][i].type === 'post') {
				axios.post('https://slack.com/api/files.delete', qs.stringify({
					token: process.env.SLACK_AUTH_TOKEN,
					file: message_history[term][i].ts
				})).then((result) => {
							//			console.log('DELETE API result is ',result.data);
				}).catch((err) => {
									console.error('API call resulted in: ', err);
				});
			} else if (!(message_history[term][i].type === 'reaction')) {

				axios.post('https://slack.com/api/chat.delete', qs.stringify({
					token: process.env.SLACK_AUTH_TOKEN,
					channel: message_history[term][i].channel,
					ts: message_history[term][i].ts
				})).then((result) => {
						//				console.log('DELETE API result is ',result.data);
				}).catch((err) => {
									console.error('API call resulted in: ', err);
				});

			}
    }
			delete message_history[term];
			return "Successfully deleted " + term + " from the history.";
		
	}
}

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

			//CLean up a fake slash command or other item that has `delete_trigger` set
			if (action.delete_trigger) {
				axios.post('https://slack.com/api/chat.delete', qs.stringify({
					token: process.env.SLACK_AUTH_TOKEN,
					channel: event.channel,
					ts: event.ts
				})).catch((err) => {
					console.error('API call for delete resulted in: ', err);
				});
			}

			//Get out delay on UP FRONT, then execute the rest
			delay(action.delay * 1000)
				.then((res) => {
					let apiMethod, token, as_user, target_ts, target_channel, params;

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
						case 'ephemeral':
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
							/*
							case 'ephemeral': {
								apiMethod = 'chat.postEphemeral';
								params = {
									token: process.env.SLACK_BOT_TOKEN,
									username: action.username,
									channel: action.channel,
									as_user: false,
									link_names: true,
									attachments: action.attachments
								}
								break;
							}*/
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
					axios.post('https://slack.com/api/' + apiMethod, qs.stringify(params))
						.then((result) => {
							//		console.log('API call for ', apiMethod, 'resulted in: ', result.data);
							
							let ts = result.data.ts;
							if (action.type === 'post') {
								ts = result.data.file.id;
							}

							addHistory(trigger_term, {
								item: action.item,
								type: action.type,
								channel: result.data.channel,
								ts: ts
							}).then((result) => {
						//		console.log('History is now: ', message_history[trigger_term]);
								callback();
							});
						}).catch((err) => {
							console.error('API call for ', apiMethod, 'resulted in: ', err);
						});
				})
		}
	})
}