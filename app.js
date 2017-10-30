require('dotenv').config();
const axios = require('axios');
const bodyParser = require('body-parser');
const express = require('express');
const qs = require('querystring');
const app = express();
const slackEventsAPI = require('@slack/events-api');
const slackInteractiveMessages = require('@slack/interactive-messages');
const storyTools = require('./tools.js');

app.set('port', process.env.PORT || 3000);

/*
 * Parse application/x-www-form-urlencoded && application/json
 */
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

// Events API Adapter & Endpoint
const slackEvents = slackEventsAPI.createSlackEventAdapter(process.env.SLACK_VERIFICATION_TOKEN);
app.use('/slack/events', slackEvents.expressMiddleware());
// Interactive Messages Adapter & endpoint
const slackMessages = slackInteractiveMessages.createMessageAdapter(process.env.SLACK_VERIFICATION_TOKEN);
app.use('/slack/actions', slackMessages.expressMiddleware());

//Load the appropriate config file
var triggerKeys = [];
var scriptConfig = require('./load-conf-google');
scriptConfig.loadConfig().then((result) => {
  triggerKeys = Object.keys(result);
  console.log('Loaded config for keys: ', triggerKeys);
});

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
    var response_text = "filler material!";

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
  var response = {};

  switch (payload.actions[0].value) {
    case 'History':
      {
        let message_history = storyTools.getHistory();
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
        var msg = storyTools.deleteAllHistory();

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

        scriptConfig.loadConfig().then((result) => {
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
  var msg = storyTools.deleteHistoryItem(payload.actions[0].value);

  axios.post(payload.response_url, {
      text: msg,
      replace_original: true,
      ephemeral: true
    }).then((result) => {})
    .catch((error) => {
      console.log('ERROR: ', error);
    });

});

// Handle errors (see `errorCodes` export)
slackEvents.on('error', console.error);

/*
 * Start the express server
 */
app.listen(app.get('port'), () => {
  console.log(`App listening on port ${app.get('port')}!`);
});