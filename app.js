//require('dotenv').config();
const axios = require('axios');
const bodyParser = require('body-parser');
const express = require('express');
const qs = require('querystring');
const app = express();
const slackEventsAPI = require('@slack/events-api');
const slackInteractiveMessages = require('@slack/interactive-messages');
const storyTools = require('./tools.js');

// Command line args
var argv = require('minimist')(process.argv.slice(2));
// variable to contain the .env file for this session
var config_file = '.env';

if (argv.c) {
  config_file = argv.c;
} 
console.log('Config file is',config_file);

// Config file
require('dotenv').config({path: `${config_file}`}); 

console.log('REQUESTED PORT IS ',process.env.PORT);
app.set('port', process.env.PORT || 3000);

/*
 * Parse application/x-www-form-urlencoded && application/json
 */
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

//Load the appropriate config file
var triggerKeys = [];
var scriptConfig = require('./load-conf-google');
scriptConfig.loadConfig(process.env.GSHEET_ID, process.env.GOOGLE_API_CREDS).then((result) => {
  triggerKeys = Object.keys(result);
  console.log('Loaded config for keys: ', triggerKeys);
});


// Events API Adapter & Endpoint
const slackEvents = slackEventsAPI.createSlackEventAdapter(process.env.SLACK_VERIFICATION_TOKEN);
app.use('/slack/events', slackEvents.expressMiddleware());
// Interactive Messages Adapter & endpoint
const slackMessages = slackInteractiveMessages.createMessageAdapter(process.env.SLACK_VERIFICATION_TOKEN);
app.use('/slack/actions', slackMessages.expressMiddleware());


// Message Event Handler
slackEvents.on('message', (event) => {
  if (event.type === 'message' && !event.bot_id) {
    if (triggerKeys.indexOf(event.text) >= 0) {
      storyTools.playbackStory(scriptConfig.config, event);
    }
  }
});

/*
 * Endpoint to receive slash commands from Slack.
 * Launches the dialog for the bug tracking ticket
 */
app.post('/slack/commands', (req, res) => {
  // respond immediately!
  res.status(200).end();

  const {
    token,
    text,
    response_url,
    trigger_id,
    command
  } = req.body;

  if (token === process.env.SLACK_VERIFICATION_TOKEN) {
    let response_text = "filler material!";
    let response = {};

    switch (text) {
      default: const admin_menu = [{
        fallback: 'Pre-filled because you have actions in your attachment.',
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
        }]
      }];

  response = {
        attachments: admin_menu,
        response_type: 'ephemeral',
        replace_original: true
      };
      break;
    }

    axios.post(response_url, response)
      .then(function(res, err) {});
  } else {
    res.sendStatus(500);
  }
});

// Attach action handlers
slackMessages.action('callback_admin_menu', (payload) => {
  // Same as above...
  console.log('Received action callback!', payload.actions[0].value);
  let response = {};

  switch (payload.actions[0].value) {
    case 'History':
      {
        let message_history = storyTools.getHistory();
        console.log('Hsotyr is: ',message_history);
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
    case 'Triggers':
      {

        if (triggerKeys.length > 0) {
          let attachments = [];
          let key_list = ""
          triggerKeys.forEach(function(key) {
            if (!(key === 'Tokens')) {
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

          response = {
            response_type: 'ephemeral',
            replace_original: false,
            attachments: attachments
          };
        }
        break;
      }
    case 'Cleanup All':
      {
        let msg = storyTools.deleteAllHistory();

        response = {
          text: msg,
          replace_original: true,
          ephemeral: true
        };
        break;
      }
    case 'Reload Config':
      {
        response = {
          text: "OK! I'm re-loading!",
          response_type: 'ephemeral',
          replace_original: false
        };

        scriptConfig.loadConfig(process.env.GSHEET_ID, process.env.GOOGLE_API_CREDS).then((result) => {
          triggerKeys = Object.keys(result);
          console.log('Re-loaded config for keys: ', triggerKeys);
        });
        break;
      }
    default:
      break;
  }

  axios.post(payload.response_url, response)
    .then((result) => {})
    .catch((error) => {
      console.log('ERROR: ', error);
    });
});

slackMessages.action('callback_history_cleanup', (payload) => {
  let msg = storyTools.deleteHistoryItem(payload.actions[0].value);

  axios.post(payload.response_url, {
      text: msg,
      replace_original: true,
      ephemeral: true
    }).then((result) => {})
    .catch((error) => {
      console.log('ERROR: ', error);
    });

});

// Listen for reaction_added event
slackEvents.on('reaction_added', (event) => {
  // Maybe have ad-hoc cleanup with a custom emoji? react to have it deleted?
  console.log('reaction! ',event);
  if (event.reaction === 'skull') {
    axios.post('https://slack.com/api/chat.delete', qs.stringify({
          token: process.env.SLACK_AUTH_TOKEN,
          channel: event.item.channel,
          ts: event.item.ts
        })).then((result) => {
            //        console.log('DELETE API result is ',result.data);
        }).catch((err) => {
                  console.error('API call resulted in: ', err);
        });
  }
});

// Handle errors (see `errorCodes` export)
slackEvents.on('error', console.error);

/*
const slack = require('tinyspeck');

// OAuth Handler
slack.on('/install', (req, res) => {
    console.log('Oauth handler was called: ',req.query);

  if (req.query.code) {
    let redirect = team => res.redirect(team.url)
  //  let setAuth = auth => redis.set(auth.team_id, auth)
    let testAuth = auth => slack.send('auth.test', { token: auth.access_token })
        console.log('auth.access_token: ',testAuth.access_token);

    let args = { client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET, code: req.query.code }
    slack.send('oauth.access', args).then(testAuth).then(redirect)
  } else {
    let url = slack.authorizeUrl({ client_id: process.env.CLIENT_ID, scope: process.env.SCOPE })
    res.redirect(url)
  }
})

*/


// OAuth Handler
app.get('/install', (req, res) => {
//  console.log('Oauth handler was called: ',res.redirect);
  if (req.query.code) {
    console.log('query.code needs to be ',req);
    let redirect = res.redirect('https://wayfair-eng-demo.slack.com')
   // console.log('ok well now the redirect is ',redirect.url)

//    let setAuth = auth => redis.set(auth.team_id, auth)
    let testAuth = auth => axios.post('https://slack.com/api/auth.test', { token: auth.access_token })
    testAuth;
       console.log('auth.access_token: ',testAuth)
  

    let args = { client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET, code: req.query.code }
    console.log('going to call with args: ',args)
    axios.post('https://slack.com/api/oauth.access', qs.stringify(args))
    .then((res) => {console.log('this is what happened: ',res.data)}).then(redirect)
    
    //.then(testAuth). //then(redirect) //.then(setAuth).then(testAuth).then(redirect) 
  } else {
    let url = "https://slack.com/oauth/authorize?" + qs.stringify({ client_id: process.env.CLIENT_ID, scope: process.env.SCOPE });
    res.redirect(url)
  }
});

      
app.get('/', (req, res) => {
  res.send('<a href="https://slack.com/oauth/authorize?&client_id=176530022562.261958402900&scope=bot,chat:write:bot,chat:write:user,reactions:write,commands"><img alt="Add to Slack" height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" /></a>');
});


/*
 * Start the express server
 */
app.listen(app.get('port'), () => {
  console.log(`App listening on port ${app.get('port')}!`);
  
  axios.post('https://slack.com/api/auth.test', qs.stringify({ token: process.env.SLACK_BOT_TOKEN}))
  .then((res) => {
          console.log("Bot connected to", res.data.team,'(',res.data.url,')');
  }); 
});