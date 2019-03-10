import { App } from "@aws-cdk/cdk";
import { WegmansCdkStack } from "./wegmans-shopping-list";

const app = new App();

const prod = new WegmansCdkStack(app, 'WegmansSkill', {
  env: {
    region: 'us-east-1',
    account: '412272193202',
  },
});

app.run();
