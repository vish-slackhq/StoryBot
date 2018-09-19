/*
  Code to load data from a Google Sheet
  Parameters from the dot.env used to call StoryBot
  Requires a valid set of Google API Creds
*/

const extractGSheet = require('spreadsheet-to-json');
require('dotenv').config();

//var configData
var googleData = [];

exports.setConfig = (team_id, args) => {
  // TODO this is not elegant, but let's just test if this can work
  if (args.gsheetID) {
    googleData.gsheetID = args.gsheetID;
  }
   if (args.clientEmail) {
    googleData.clientEmail = args.clientEmail;
  }
   if (args.privateKey) {
    googleData.privateKey = args.privateKey;
  }
}

exports.getConfig = (team_id) => {

}

// Load config
exports.loadConfig = () => {
  console.log('<DEBUG><Config><loadConfig> googleData:',googleData);
  return new Promise((resolve) => {
    extractGSheet.extractSheets({
      // your google spreadhsheet key 
      spreadsheetKey: googleData.gsheetID, // || process.env.GSHEET_ID,
      // your google oauth2 credentials 
      //   credentials: require(process.env.GOOGLE_API_CREDS || './google_sheets_creds.json'),
      credentials: {
        client_email: googleData.clientEmail, // || process.env.GOOGLE_CLIENT_EMAIL,
        private_key: googleData.privateKey, // || process.env.GOOGLE_PRIVATE_KEY
      },
      // names of the sheet you want to extract (or [] for all) 
      sheetsToExtract: []
    }, function(err, data) {
      if (err) {
        console.log(err);
      }
      exports.config = data;
      exports.triggerKeys = Object.keys(data);
      console.log('<Loading> Loaded config for keys:', exports.triggerKeys);
      resolve(data);
    });
  })
}