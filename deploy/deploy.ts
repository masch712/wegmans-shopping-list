import { App } from "@aws-cdk/cdk";
import { WegmansCdkStack } from "./wegmans-shopping-list";
import { config } from "../lib/config";

const app = new App();

if (config.get('logical_env') === 'production') {
  new WegmansCdkStack(app, 'WegmansSkill', {
    env: {
      region: 'us-east-1',
      account: config.get('aws.account.number'),
    },
  });
}
else {
  new WegmansCdkStack(app, 'devWegmansSkill', {
    env: {
      region: 'us-east-1',
      account: config.get('aws.account.number'),
    },
  });
}

app.run();
