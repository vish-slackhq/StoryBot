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

* Set up Node/npm: https://nodejs.org/en/download/
* Set up ngrok: https://ngrok.com/download
* Set up Gdrive API access & generate a google-creds.json file: https://www.npmjs.com/package/google-spreadsheet#service-account-recommended-method
***Add `client_email` and `private_key` to your dot.env file

## Create New Slack App

### Basic Info
* Copy `Verification Token` and `Signing Secret` into your `.env` file
* Add Features & functionality
    * Bot Users
        * Enable, choose whatever name
    * Permissions - add these Scopes
        * channels:write
        * channels:read
        * chat:write:bot 
        * chat:write:user
        * files:write:user
        * groups:read
        * groups:write
        * reactions:read
        * reactions:write
        * users:read

### Install App to Team
* get Bot(?) & OAuth token and add to .env file
* Run the app for the first time so it can respond to Events challenges (below):
**Make sure the dot.env.sample file is filled out
***`npm install` first time to get all required modules
***`node index.js -c CONFIG.env`
***** (defaults to .env if no config file is specified)

### Set up additional interactivity and events
* Set up Interactive Components to your ngrok URL + /slack/actions
* Set up a /storybot command to your ngrok URL + /slack/commands
* Event Subscriptions:
    * Setup Request URL with ngrok https URL + /slack/events
    * Subscribe to ***Workspace events*** for:
        * message.channels
        * reaction_added
        * other message.groups/IM if needed


Generate legacy tokens for other users as needed and add to the Tokens sheet

