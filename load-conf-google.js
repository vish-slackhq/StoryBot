/*
  Code to load data from a Google Sheet
  Parameters from the dot.env used to call StoryBot
  Requires a valid set of Google API Creds
*/

const extractGSheet = require('spreadsheet-to-json');
// Create a new web client
const {
  WebClient
} = require('@slack/client');

var allConfigs = [];

// Return the requested config - if it doesn't exist, create it
exports.getConfig = (team_id, data) => {
  return new Promise((resolve) => {
    // If there isn't a config for the team, create a blank one
    if (!allConfigs[team_id]) {
      allConfigs[team_id] = {};
      allConfigs[team_id].message_history = [];
      allConfigs[team_id].keys = [];
      allConfigs[team_id].dm = false;
      allConfigs[team_id].configParams = {};
    }
    // If there are config params already stored, load them
    if (data) {
      // create a new web client for the team
      if (!allConfigs[team_id].webClientUser) {
        allConfigs[team_id].webClientUser = new WebClient(data.access_token);
      }
      if (!allConfigs[team_id].webClientBot) {
        allConfigs[team_id].webClientBot = new WebClient(data.bot.bot_access_token);
      }

      if (data.configParams) {
        // Added a switch to see if there was an old-style config in the DB and hack it into place
        // TODO - remove this once the DB is set up correctly again in all instances
        if (data.configParams.clientEmail || data.configParams.privateKey) {
          console.log('<DB DEBUG> Old Style configParams detected. Currently is:',data.configParams);
          data.configParams.googleCreds.client_email = data.configParams.clientEmail;
          delete data.configParams.clientEmail;
          data.configParams.googleCreds.private_key = data.configParams.privateKey;
          delete data.configParams.privateKey;
          console.log('<DB DEBUG> Old Style configParams detected. After change it is:',data.configParams);
          redis = require('./redis');
          redis.set(team_id, data).catch(console.error);
          allConfigs[team_id].configParams = data.configParams;
        }
        if (!(data.configParams.gsheetID === allConfigs[team_id].configParams.gsheetID && data.configParams.googleCreds.client_email === allConfigs[team_id].configParams.googleCreds.client_email && data.configParams.googleCreds.private_key === allConfigs[team_id].configParams.googleCreds.private_key)) {
          allConfigs[team_id].configParams = data.configParams;
          resolve(exports.loadConfig(team_id));
        }
      }
      if (data.dm) {
        allConfigs[team_id].dm = data.dm;
      }
    }
    resolve(allConfigs[team_id]);
  })
}

// Delete a config
exports.deleteConfig = (team_id) => {
  return new Promise((resolve) => {
    //  delete allConfigs[team_id].webClientUser;
    //  delete allConfigs[team_id].webClientBot;
    resolve(delete allConfigs[team_id]);
  })
}

exports.debugConfig = () => {
  return allConfigs;
}

// Load config
exports.loadConfig = (team_id) => {
  return new Promise((resolve, reject) => {
    extractGSheet.extractSheets({
      // your google spreadhsheet key 
      spreadsheetKey: allConfigs[team_id].configParams.gsheetID, // || process.env.GSHEET_ID,
      // your google oauth2 credentials 
      credentials: {
        client_email: allConfigs[team_id].configParams.googleCreds.client_email, // || process.env.GOOGLE_CLIENT_EMAIL,
        private_key: allConfigs[team_id].configParams.googleCreds.private_key, // || process.env.GOOGLE_PRIVATE_KEY
      },
      // names of the sheet you want to extract (or [] for all) 
      sheetsToExtract: []
    }, function(err, data) {
      if (err) {
        console.log(err);
      }
      if (data) {
        allConfigs[team_id].scripts = data;
        allConfigs[team_id].keys = Object.keys(data);
        console.log('<Loading> Loaded config for team', team_id, 'with keys:', allConfigs[team_id].keys);

        allConfigs[team_id].webClientUser.auth.test()
          .then((res) => {
            console.log('<Loading> Bot connected to workspace', res.team);
            // Cache info on the users for ID translation and inviting to channels
            buildUserList(team_id);
            buildChannelList(team_id);
          })
          .catch((err) => {
            console.error('<Error><vsetupNewConfig><auth.test>', err);
          });
        resolve(allConfigs[team_id]);
      } else {
        reject();
      }
    })
  })
}

// Get the list of all channels and their IDs and cache it
const buildChannelList = (team_id) => {
  allConfigs[team_id].webClientUser.channels.list({
      exclude_members: true,
      exclude_archived: true,
      get_private: true
    })
    .then((res) => {
      allConfigs[team_id].channel_list = res.channels;
    })
    .catch((err) => {
      console.error('<Error><buildChannelListm><channels.list>', err);
    });
}

// TODO - put these as helpers in the config?
// Get the list of all users and their IDs and store it for faster caching
const buildUserList = (team_id) => {
  allConfigs[team_id].webClientUser.users.list()
    .then((res) => {
      allConfigs[team_id].user_list = res.members;
    }).catch((err) => {
      console.error('<Error><buildUserList><users.list>', err);
    });
}

exports.addTriggerToConfig = (team_id, data) => {
  console.log('<add trigger> Adding a new trigger for team', team_id, 'with data:', data);
  let newTrigger = {
    item: 0,
    type: data['Type'],
    text: data['Text'],
    username: data['Username'],
    channel: 'current',
    attachments: data['Attachments'],
    delete_trigger: false
  };
  allConfigs[team_id].scripts[data['Trigger Name']] = [newTrigger];
  allConfigs[team_id].keys.push(data['Trigger Name']);
  console.log('keys are', allConfigs[team_id].keys);
}