# Wegmans
##What it do
###Alexa skill
This is a AWS Lambda endpoint that handles requests from alexa.
###Alexa Account Linking
We also have a lambda that acts as the authorization server for account linking with Wegmans.  TODO: this should serve up a react UI for the login page.
##Setup
`npm install -g typescript ts-jest`
## Build
`npm run build` to build the .zip file
`npm run deploy` to deploy it to AWS S3