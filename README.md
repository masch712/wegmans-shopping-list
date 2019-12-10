# Wegmans

## What it do

### Prereqs

Install ask-cli

### Alexa skill

This is a AWS Lambda endpoint that handles requests from alexa.

### Alexa Account Linking

We also have a lambda that acts as the authorization server for account linking with Wegmans.

## Setup

`docker run -p 8000:8000 --name wegmans-dynamo -d --rm amazon/dynamodb-local`

## Build

`npm run build` to build the .zip file
`npm run deploy` to deploy development env; `LOGICAL_ENV=production npm run deploy` to deploy production

## Testing

Set the log level in jest.config.js
