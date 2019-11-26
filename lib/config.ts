import { KMS } from "aws-sdk";
import * as convict from "convict";
import * as yaml from "js-yaml";
import { resolve } from "path";
import * as dotenv from "dotenv";

convict.addParser({
  extension: ["yml", "yaml"],
  parse: str => {
    if (str && str.length) {
      return yaml.safeLoad(str);
    }
    return {};
  }
});

// Define a schema
export const config = convict({
  env: {
    doc: "The application environment.",
    format: ["production", "development", "test"],
    default: "development",
    env: "NODE_ENV"
  },
  logical_env: {
    doc: "The logical env name for loading config file",
    format: String,
    default: "development",
    env: "LOGICAL_ENV"
  },

  logging: {
    level: {
      doc: "Logging level",
      default: "debug",
      format: ["error", "warn", "info", "verbose", "debug", "silly"],
      env: "LOGGING_LEVEL"
    }
  },
  aws: {
    account: {
      number: {
        doc: "AWS Account number",
        format: String,
        env: "AWS_ACCOUNT_NUMBER",
        default: ""
      }
    },
    dynamodb: {
      endpoint: {
        doc: "DynamoDB endpoint",
        format: String,
        default: ""
      },
      initTables: {
        doc: "Whether to create tables",
        format: Boolean,
        default: false
      },
      tableNames: {
        TOKENSBYCODE: {
          doc: "Table for blah",
          format: String,
          default: "WegmansTokensByAccessCode"
        },
        TOKENSBYACCESS: {
          doc: "Table for blah",
          format: String,
          default: "WegmansTokensByAccessToken"
        },
        TOKENSBYREFRESH: {
          doc: "Table for blah",
          format: String,
          default: "WegmansTokensByRefreshToken"
        },
        PREREFRESHEDTOKENSBYREFRESH: {
          doc: "Table for blah",
          format: String,
          default: "WegmansPreRefreshedTokensByRefreshToken"
        },
        ORDERHISTORYBYUSER: {
          doc: "Table for order history",
          format: String,
          default: "WegmansOrderHistoryByUser"
        },
        PRODUCTREQUESTHISTORY: {
          doc: "Table for alexa request history",
          format: String,
          default: "WegmansProductRequestHistory"
        }
      }
    },
    lambda: {
      functionNames: {
        "cdk-wegmans-shopping-list": {
          doc: "lambda function name",
          format: String,
          default: "cdk-wegmans-shopping-list"
        },
        "cdk-wegmans-generate-access-code": {
          doc: "lambda function name",
          format: String,
          default: "cdk-wegmans-generate-access-code"
        },
        "cdk-wegmans-get-tokens": {
          doc: "lambda function name",
          format: String,
          default: "cdk-wegmans-get-tokens"
        },
        "cdk-wegmans-cron-order-history-updater": {
          doc: "lambda function name",
          format: String,
          default: "cdk-wegmans-cron-order-history-updater"
        },
        "cdk-wegmans-cron-access-token-refresher": {
          doc: "lambda function name",
          format: String,
          default: "cdk-wegmans-cron-access-token-refresher"
        },
        "cdk-wegmans-worker-prefix": {
          doc: "lambda function name",
          format: String,
          default: `cdk-wegmans-worker-`
        }
      }
    },
    sqs: {
      queueNames: {
        "worker-queue-prefix": "wegmans-worker-"
      }
    },
    accessKeyId: {
      doc: "AWS Access Key Id",
      env: "AWS_ACCESSKEYID",
      default: "herp"
    },
    secretAccessKey: {
      doc: "AWS Secret Key",
      env: "AWS_SECRETACCESSKEY",
      default: "derp"
    }
  },
  wegmans: {
    email: {
      doc: "Wegmans email login",
      default: "",
      format: String,
      env: "WEGMANS_EMAIL"
    },
    password: {
      doc: "Wegmans password",
      default: "",
      format: String,
      env: "WEGMANS_PASSWORD"
    },
    apikey: {
      doc: "Wegmans API key (for Ocp-Apim-Subscription-Key header)",
      default: "",
      format: String,
      env: "WEGMANS_APIKEY"
    }
  },
  encrypted: {
    doc: "Whether AWS KMS encryption was used to encrypt credentials",
    default: false,
    format: Boolean,
    env: "AWS_ENCRYPTED"
  },
  alexa: {
    skill: {
      name: {
        doc: "Name of the alexa skill.  Used for authenticating access token request.",
        default: "",
        format: String,
        env: "ALEXA_SKILL_NAME"
      },
      secret: {
        doc: "The skill client secret created during Account Linking config.",
        default: "",
        format: String,
        env: "ALEXA_SKILL_SECRET"
      },
      productSearchShortCircuitMillis: {
        doc: "millis to search for product before giving up",
        default: 1500,
        format: Number,
        env: "SEARCH_SHORT_CIRCUIT_MILLIS"
      }
    }
  }
});

// Load environment dependent configuration
const env = config.get("logical_env");

dotenv.config({
  path: `${env}.env`
});

const configFile = resolve("config", env + ".yaml");
config.loadFile(configFile);

// Perform validation
config.validate({ allowed: "strict" });
