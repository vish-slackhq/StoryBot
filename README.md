# StoryBot-Node

Bot to respond in Slack to triggers defined in a Google Sheet

Supports:
* User Messages
* Bot messages
* Reactions
* Threaded Replies
* Posts
* Ephemeral bot messages
* Share messages
* Simulated slash commands
* Callbacks/actions from a bot message

## First Things First

Set up Node/npm: https://nodejs.org/en/download/
Set up ngrok: https://ngrok.com/download
Set up Gdrive API access & generate a google-creds.json file: https://www.npmjs.com/package/google-spreadsheet#service-account-recommended-method


## Create New Slack App

### Basic Info:
    * Copy verification token into your .env file
    * Add Features & functionality
        * Bot Users
            * Enable, choose whatever name
        * Permissions
            * channels:write
            * chat:write:bot 
            * chat:write:user
            * files:write:user
            * groups:read
            * reactions:read
            * reactions:write
            * users:read

### Install App to Team

* get Bot & OAuth token and add to .env file

* Event Subscriptions:
    * Setup Request URL with ngrok https URL with /slack/events
    * Subscribe to ***Bot events*** for:
        * message.channels
        * reaction_added

Generate legacy tokens for other users as needed and add to the Tokens sheet

Make sure the dot.env.sample file is filled out

npm install first time to get all required modules

node index.js -c CONFIG.env
* (defaults to .env if no config file is specified)