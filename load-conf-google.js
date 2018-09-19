/*
  Code to load data from a Google Sheet
  Parameters from the dot.env used to call StoryBot
  Requires a valid set of Google API Creds
*/

const extractGSheet = require('spreadsheet-to-json');
// Fun with oAuth
redis = require('./redis');

var allConfigs = [];

exports.setConfig = (team_id, args) => {
  // TODO this is not elegant, but let's just test if this can work

  if (!allConfigs[team_id]) {
    allConfigs[team_id] = {};
  }
  allConfigs[team_id].googleData = {
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
  // console.log('<DEBUG><Config><loadConfig> Loading for team',team_id, 'with googleData:', allConfigs[team_id].googleData);
  return new Promise((resolve) => {
    extractGSheet.extractSheets({
      // your google spreadhsheet key 
      spreadsheetKey: allConfigs[team_id].googleData.gsheetID, // || process.env.GSHEET_ID,
      // your google oauth2 credentials 
      //   credentials: require(process.env.GOOGLE_API_CREDS || './google_sheets_creds.json'),
      credentials: {
        client_email: allConfigs[team_id].googleData.clientEmail, // || process.env.GOOGLE_CLIENT_EMAIL,
        private_key: allConfigs[team_id].googleData.privateKey, // || process.env.GOOGLE_PRIVATE_KEY
      },
      // names of the sheet you want to extract (or [] for all) 
      sheetsToExtract: []
    }, function(err, data) {
      if (err) {
        console.log(err);
      }
      //   exports.config = data;
      //   exports.triggerKeys = Object.keys(data);
      //      console.log('<Loading> Loaded config for keys:', exports.triggerKeys);
      allConfigs[team_id].scripts = data;
      allConfigs[team_id].keys = Object.keys(allConfigs[team_id].scripts);
      console.log('<Loading> Loaded config for team', team_id, 'with keys:', allConfigs[team_id].keys);
      resolve(data);
    });
  })
}