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
// Defaults to .env
var config_file = '.env';

// Or can be specified with -c your_file.env
if (argv.c) {
  config_file = argv.c;
}
console.log('Config file is', config_file);

// Config file
require('dotenv').config({
  path: `${config_file}`
});

app.set('port', process.env.PORT || 3000);

/*
 * Parse application/x-www-form-urlencoded && application/json
 */
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

//Load the appropriate config file from Google Sheets
var scriptConfig = require('./load-conf-google');
var triggerKeys = [];
var callbackData = [];

scriptConfig.loadConfig().then((result) => {
  triggerKeys = Object.keys(result);

  // If we're specifying dynamic callbacks in this config
  if (result.Callbacks) {
    result.Callbacks.forEach(function(callback) {
      callbackData.push(callback.callback_name);
    });
  }
  console.log('Loaded config for keys: ', triggerKeys, 'and Callbacks are: ', callbackData);
});

// Events API Adapter & Endpoint
const slackEvents = slackEventsAPI.createSlackEventAdapter(process.env.SLACK_VERIFICATION_TOKEN);
app.use('/slack/events', slackEvents.expressMiddleware());

// Message Event Handler
slackEvents.on('message', (event) => {
  // Matched a trigger from a user so playback the story
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

  const {
    token,
    text,
    response_url,
    trigger_id,
    command
  } = req.body;

  if (token === process.env.SLACK_VERIFICATION_TOKEN) {

    // respond immediately!
    res.status(200).end();

    let response_text = "filler material!";
    let response = {};

    //Build the admin menu for the bot
    const admin_menu = [{
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
      }, {
        name: 'Create Channels',
        text: 'Create Channels',
        type: 'button',
        style: 'default',
        value: 'Create Channels'
      }]
    }];

    response = {
      attachments: admin_menu,
      response_type: 'ephemeral',
      replace_original: true
    };

    axios.post(response_url, response)
      .then(function(res, err) {});
  } else {
    res.sendStatus(500);
  }
});

//Interactive messages
app.post('/slack/actions', (req, res) => {
  const body = JSON.parse(req.body.payload);

  // check that the verification token matches expected value
  if (body.token === process.env.SLACK_VERIFICATION_TOKEN) {
    // immediately respond with a empty 200 response to let
    // Slack know the command was received
    res.send('');

    // Handle the admin menu callbacks
    switch (body.callback_id) {

      case 'callback_admin_menu':
        {
          let response = {};

          switch (body.actions[0].value) {
            case 'History':
              {
                let message_history = storyTools.getHistory();
                console.log('History is: ', message_history);
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
                    if (!(key === 'Tokens' || key === 'Channels')) {
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

                scriptConfig.loadConfig().then((result) => {
                  triggerKeys = Object.keys(result);
                  console.log('Re-loaded config for keys: ', triggerKeys, 'and Callbacks are: ', callbackData);
                  result.Callbacks.forEach(function(callback) {
                    callbackData.push(callback.callback_name);
                  });
                });
                break;
              }
            case 'Create Channels':
              {
                response = {
                  text: "Creating channels now",
                  response_type: 'ephemeral',
                  replace_original: true
                };
                storyTools.createChannels(scriptConfig.config['Channels']);
                break;
              }
            default:
              break;
          }

          axios.post(body.response_url, response)
          .then((result) => {})
          .catch((error) => {
            console.log('ERROR: ', error);
          });
          break;
        }
      case 'callback_history_cleanup':
        {
          let msg = storyTools.deleteHistoryItem(body.actions[0].value);

          response = {
            text: msg,
            replace_original: true,
            ephemeral: true
          };

          axios.post(body.response_url, response)
          .then((result) => {})
          .catch((error) => {
            console.log('ERROR: ', error);
          });
          break;
        }

        //Handle what happens with dynamic callbacks defined in the script sheet
      default:
        {
          if (callbackData.indexOf(body.callback_id) >= 0) {

            let callbackMatch = scriptConfig.config.Callbacks.find(o => o.callback_name == body.callback_id);

            // Is it a dialog?
            if (callbackMatch.dialog) {
              response = {
                token: process.env.SLACK_BOT_TOKEN,
                trigger_id: body.trigger_id,
                dialog: callbackMatch.attachments
              }

              axios.post('https://slack.com/api/dialog.open', qs.stringify(response))
                .then((result) => {
                  console.log('API call for dialog resulted in: ', result.data);

                }).catch((err) => {
                  console.error('API call for  dialog resulted in: ', err);
                });
            } else {
              response = {
                token: process.env.SLACK_BOT_TOKEN,
                channel: body.channel.id,
                text: callbackMatch.text,
                ts: body.message_ts,
                as_user: false,
                response_type: callbackMatch.response_type,
                replace_original: callbackMatch.replace_original,
                attachments: callbackMatch.attachments
              };

              axios.post('https://slack.com/api/chat.update', qs.stringify(response))
                .then((result) => {

                }).catch((err) => {
                  console.error('API call for  update resulted in: ', err);
                });
            }

          } else {
            console.log('Eh, no matching action!');

          }
          break;
        }
    }
  } else {
    debug('Token mismatch');
    res.sendStatus(500);
  }
});

// Listen for reaction_added event
slackEvents.on('reaction_added', (event) => {
  // Put a :skull: on an item and the bot will kill it dead
  if (event.reaction === 'skull') {
    axios.post('https://slack.com/api/chat.delete', qs.stringify({
      token: process.env.SLACK_AUTH_TOKEN,
      channel: event.item.channel,
      ts: event.item.ts
    })).then((result) => {

    }).catch((err) => {
      console.error('API call resulted in: ', err);
    });
  }
});

// Handle errors (see `errorCodes` export)
slackEvents.on('error', console.error);

/*
 * Start the express server
 */
app.listen(app.get('port'), () => {
  console.log(`App listening on port ${app.get('port')}!`);

  axios.post('https://slack.com/api/auth.test', qs.stringify({
      token: process.env.SLACK_BOT_TOKEN
    }))
    .then((res) => {
      console.log("Bot connected to", res.data.team, '(', res.data.url, ')');
      storyTools.authBotID = res.data.user_id;
      
      // Cache info on the users for ID translation and inviting to channels
      storyTools.getUserList();
    })

  axios.post('https://slack.com/api/auth.test', qs.stringify({
      token: process.env.SLACK_AUTH_TOKEN
    }))
    .then((res) => {
      console.log("User connected to", res.data.team, '(', res.data.url, ')');
      storyTools.authUserID = res.data.user_id;

    })
});