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

exports.setConfig = (team_id, args) => {
  // TODO this is not elegant, but let's just test if this can work
  if (!allConfigs[team_id]) {
    allConfigs[team_id] = {};
    allConfigs[team_id].message_history = [];
  }
  allConfigs[team_id].configParams = {
    gsheetID: args.gsheetID,
    clientEmail: args.clientEmail,
    privateKey: args.privateKey
  }
}

exports.getConfig = (team_id) => {
  if (allConfigs[team_id]) {
    return allConfigs[team_id];
  } else {
    return null;
  }
}

// Load config
exports.loadConfig = (team_id) => {
  return new Promise((resolve) => {
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
      allConfigs[team_id].scripts = data;
      allConfigs[team_id].keys = Object.keys(allConfigs[team_id].scripts);
      console.log('<Loading> Loaded config for team', team_id, 'with keys:', allConfigs[team_id].keys);
      resolve(data);
    });
  })
}

// jank jank jank
exports.createWebClient = (team_id, access_token) => {
//  console.log('<WEB CLIENT> Request for team', team_id);
  if (!allConfigs[team_id]) {
    allConfigs[team_id] = {};
    allConfigs[team_id].message_history = [];
    allConfigs[team_id].keys = [];
  }
  if (!allConfigs[team_id].webClientUser) {
  //  console.log('<WEB CLIENT> Creating a new client');
    allConfigs[team_id].webClientUser = new WebClient(access_token);
  } else {
  //  console.log('<WEB CLIENT> Found an existing client');
  }
}