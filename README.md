# Wegmans
##What it do
###Alexa skill
This is a AWS Lambda endpoint that handles requests from alexa.
###Alexa Account Linking
We also have a lambda that acts as the authorization server for account linking with Wegmans.
##Setup
`npm install -g typescript ts-jest`
`docker run -d -p 8000:8000 dwmkerr/dynamodb`
## Build
`npm run build` to build the .zip file
`npm run deploy` to deploy it to AWS S3
## Testing
Set the log level in jest.config.js