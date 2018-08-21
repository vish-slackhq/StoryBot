/*
  Code to load data from a Google Sheet
  Parameters from the dot.env used to call StoryBot
  Requires a valid set of Google API Creds
*/

const extractGSheet = require('spreadsheet-to-json');
require('dotenv').config();

// Load config
exports.loadConfig = () => {
  return new Promise((resolve) => {
    extractGSheet.extractSheets({
    // your google spreadhsheet key 
    spreadsheetKey: process.env.GSHEET_ID,
    // your google oauth2 credentials 
 //   credentials: require(process.env.GOOGLE_API_CREDS || './google_sheets_creds.json'),
 credentials: {
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  private_key: process.env.GOOGLE_PRIVATE_KEY
 },
    // names of the sheet you want to extract (or [] for all) 
    sheetsToExtract: []
  }, function(err, data) {
    if (err) {
      console.log(err);
    }
    exports.config = data;
    resolve(data);
  });
  })
}

