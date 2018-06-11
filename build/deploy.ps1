aws s3 cp .\\build\\Release\\build.zip s3://wegmans-lambda-builds --profile wegmans;
aws lambda update-function-code --function-name wegmans-shopping-list --s3-bucket wegmans-lambda-builds --s3-key build.zip --profile wegmans;
aws lambda update-function-configuration --function-name wegmans-shopping-list --handler 'lambda/alexa/index.handler' --profile wegmans;
