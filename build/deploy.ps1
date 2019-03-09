aws s3 cp .\\build\\Release\\build.zip s3://wegmans-lambda-builds --profile wegmans;
aws lambda update-function-code --function-name wegmans-shopping-list --s3-bucket wegmans-lambda-builds --s3-key build.zip --profile wegmans;
aws lambda update-function-configuration --function-name wegmans-shopping-list --handler 'lambda/alexa/index.handler' --profile wegmans;

aws lambda update-function-code --function-name wegmans-auth_get-access-code --s3-bucket wegmans-lambda-builds --s3-key build.zip --profile wegmans;
aws lambda update-function-configuration --function-name wegmans-auth_get-access-code --handler 'lambda/server/auth-server.generateAuthCode' --profile wegmans;

aws lambda update-function-code --function-name wegmans-auth_get-access-tokens --s3-bucket wegmans-lambda-builds --s3-key build.zip --profile wegmans;
aws lambda update-function-configuration --function-name wegmans-auth_get-access-tokens --handler 'lambda/server/auth-server.getTokens' --profile wegmans;

aws lambda update-function-code --function-name wegmans-update_order_history_cache --s3-bucket wegmans-lambda-builds --s3-key build.zip --profile wegmans;
aws lambda update-function-configuration --function-name wegmans-update_order_history_cache --handler 'lambda/cron/order-history-updater.handler' --profile wegmans;

# TODO: set env vars and IAM user in this script