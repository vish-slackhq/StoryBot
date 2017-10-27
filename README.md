# StoryBot-Node
StoryBot with a Node twist

Info to come

Set up Node/npm: https://nodejs.org/en/download/
Set up ngrok: https://ngrok.com/download
Things for Gdrive API access & generate a google-creds.json file: https://www.npmjs.com/package/google-spreadsheet#service-account-recommended-method


Create New App

* Basic Info:
    * copy verification token into your .env file
    * Add Features & functionality
        * Bot Users
            * Enable, choose whatever name
        * Permissions
            * channels:read
            * chat:write:bot 
            * chat:write:user
            * files:write:user
            * groups:read
            * reactions:write

Install App to Team

* get OAuth tokens (at least for authorized user)

* Event Subscriptions:
    * Setup Request URL with ngrok https URL with /slack/events
    * Subscribe to ***Bot events*** for:
        * message.channels
        * message.im

Generate legacy tokens for other users as needed

Make sure the example.env.rename file is filled out

npm install first time to get all required modules

node index.js -c CONFIG.env