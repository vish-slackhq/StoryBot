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
// Fun with oAuth
//redis = require('./redis');

var allConfigs = [];

/*
// Store the config parameters in the DB
exports.setConfig = (auth, args) => {
  console.log('setConfig running for ', auth.team_id);
  // Allow full URLs
  let match = args.gsheetID.match(/(?<=https:\/\/docs\.google\.com\/spreadsheets\/d\/).*(?=\/)/);
  if (match) {
    args.gsheetID = match[0];
  }

  redis.set(auth.team_id, Object.assign(auth, {
    configParams: {
      gsheetID: args.gsheetID,
      clientEmail: args.clientEmail,
      privateKey: args.privateKey
    }
  }));
}
*/

// Return the requested config
exports.getConfig = (team_id, data) => {
  return new Promise((resolve) => {
    // If there isn't a config for the team, create a blank one
    if (!allConfigs[team_id]) {
      allConfigs[team_id] = {};
      allConfigs[team_id].message_history = [];
      allConfigs[team_id].keys = [];
      allConfigs[team_id].configParams = {};
      allConfigs[team_id].quiet = false;
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
        if (!(data.configParams.gsheetID === allConfigs[team_id].configParams.gsheetID && data.configParams.clientEmail === allConfigs[team_id].configParams.clientEmail && data.configParams.privateKey === allConfigs[team_id].configParams.privateKey)) {
          allConfigs[team_id].configParams = data.configParams;
          exports.loadConfig(team_id);
        }
      }
    }
    resolve(allConfigs[team_id]);
  })
}

// Load config
exports.loadConfig = (team_id) => {
  return new Promise((resolve, reject) => {
    extractGSheet.extractSheets({
      // your google spreadhsheet key 
      spreadsheetKey: allConfigs[team_id].configParams.gsheetID, // || process.env.GSHEET_ID,
      // your google oauth2 credentials 
      credentials: {
        client_email: allConfigs[team_id].configParams.clientEmail, // || process.env.GOOGLE_CLIENT_EMAIL,
        private_key: allConfigs[team_id].configParams.privateKey, // || process.env.GOOGLE_PRIVATE_KEY
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