const extractGSheet = require('spreadsheet-to-json');
require('dotenv').config();

// Load config
exports.loadConfig = () => {
  return new Promise((resolve) => {
    extractGSheet.extractSheets({
    // your google spreadhsheet key 
    spreadsheetKey: process.env.GSHEET_ID,
    // your google oauth2 credentials 
    credentials: require('./google_sheets_creds.json'),
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

