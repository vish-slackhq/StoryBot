const payload = {
	type: 'dialog_submission',
	token: 'GIJtSJQzgdXXLSesvDZrmmcR',
	action_ts: '1537324680.276554',
	team: {
		id: 'T56FL0NGJ',
		domain: 'smock-test'
	},
	user: {
		id: 'U579VUKUN',
		name: 'dsmock'
	},
	channel: {
		id: 'C7QPAM5V4',
		name: 'test-storybot2'
	},
	submission: {
		'Google Sheet Link': 'Test1',
		'Google API Email': 'Test2',
		'Google Private Key': 'Test3'
	},
	callback_id: 'callback_config',
	response_url: 'https://hooks.slack.com/app/T56FL0NGJ/438391090482/LquqTh1MjFuAMajUFornxwtj',
	state: ''
}

console.log('payload.submission:',payload.submission);
console.log('payload.submission[0]:',payload.submission['Google Sheet Link']);
