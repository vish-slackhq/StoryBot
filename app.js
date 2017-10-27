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

  //console.log('config is ',scriptConfig.config);
  //console.log('EVENT: ', event);

  if (event.type === 'message' && !event.bot_id) {
    if (triggerKeys.indexOf(event.text) >= 0) {
      console.log('Match!');

      //message_history[event.text.concat('-',event.ts)] = 
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
    //do things :)

    var response_text = "filler material!"
    console.log('history: ', JSON.stringify(storyTools.getHistory()));

    switch (text) {

      case 'reload':
        response_text = "OK! I'm re-loading!";
        scriptConfig.loadConfig().then((result) => {
          triggerKeys = Object.keys(result);
          console.log('Re-loaded config for keys: ', triggerKeys);
        });
        break;

      case 'history':
        response_text = text;
        break;

      default:

        break;
    }

    axios.post(response_url, {
        text: response_text
      })
      .then(function(text) {});
  } else {
    res.sendStatus(500);
  }
});

// Attach action handlers
slackMessages.action('welcome_button', (payload) => {
  // Same as above...
});

// Handle errors (see `errorCodes` export)
slackEvents.on('error', console.error);

/*
 * Start the express server
 */
app.listen(app.get('port'), () => {
  console.log(`App listening on port ${app.get('port')}!`);
});