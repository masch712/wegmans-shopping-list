aws s3 cp .\\build\\Release\\build.zip s3://wegmans-lambda-builds;
aws lambda update-function-code --function-name wegmans-shopping-list --s3-bucket wegmans-lambda-builds --s3-key build.zip
aws lambda update-function-configuration --function-name wegmans-shopping-list --handler 'lambda/index.handler'
