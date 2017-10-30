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
	//	console.log('adding ', data.item);
	resolve(message_history[name].push(data));
});
}

exports.getHistory = () => {
	console.log('getting history ', message_history);
	return message_history;
}

exports.playbackStory = (config, event) => {
	//	console.log('story is ', story);
	message_history[event.text] = [];

	async.eachSeries(config[event.text], function(action, callback) {
	//	console.log('action right now is ', action.item);
		//	console.log('history ', message_history)

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
						target_ts = message_history[event.text].find(o => o.item == action.target_item).ts;
						target_channel = message_history[event.text].find(o => o.item == action.target_item).channel;
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

				//	console.log('method is ', apiMethod, 'params are ', params);
					axios.post('https://slack.com/api/' + apiMethod, qs.stringify(params))
					.then((result) => {
							//		console.log('API call for ', apiMethod, 'resulted in: ', result.data);
							addHistory(event.text, {
								item: action.item,
								type: action.type,
								channel: result.data.channel,
								ts: result.data.ts
							}).then((result) => {
								console.log('History currently is ', message_history);
								callback();
							});

						}).catch((err) => {
							console.error('API call for ', apiMethod, 'resulted in: ', err);
						});
					})
		}
	})
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
}

// send an IM to user with id
exports.sendDM = (id, msg) => {
	// Open and send intial DM
	bot.im.open(id)
	.then((info) => { bot.chat.postMessage(info.channel.id, msg)})
	.catch(console.error);
};


*/