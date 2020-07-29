import { KMS } from "aws-sdk";
import * as convict from "convict";
import * as yaml from "js-yaml";
import { resolve } from "path";
import * as dotenv from "dotenv";

convict.addParser({
  extension: ["yml", "yaml"],
  parse: (str) => {
    if (str && str.length) {
      return yaml.safeLoad(str);
    }
    return {};
  },
});

// Define a schema
export const config = convict({
  env: {
    doc: "The application environment.",
    format: ["production", "development", "test"],
    default: "development",
    env: "NODE_ENV",
  },
  logical_env: {
    doc: "The logical env name for loading config file",
    format: String,
    default: "development",
    env: "LOGICAL_ENV",
  },

  logging: {
    level: {
      doc: "Logging level",
      default: "debug",
      format: ["error", "warn", "info", "verbose", "debug", "silly"],
      env: "LOGGING_LEVEL",
    },
    logDuration: {
      logResolveValue: {
        doc: "Whether to log the promise resolution value in logDuration(...) calls",
        default: false,
        format: Boolean,
        env: "LOGGING_LOGDURATION_LOGRESOLVEVALUE",
      },
    },
  },
  aws: {
    account: {
      number: {
        doc: "AWS Account number",
        format: String,
        env: "AWS_ACCOUNT_NUMBER",
        default: "",
      },
    },
    dynamodb: {
      endpoint: {
        doc: "DynamoDB endpoint",
        format: String,
        default: "",
      },
      initTables: {
        doc: "Whether to create tables",
        format: Boolean,
        default: false,
      },
      tableNamePrefix: {
        doc: "Prefix for dynamo table names",
        format: String,
        default: "",
      },
      tableNames: {
        ORDERHISTORYBYUSER: {
          doc: "table for blah",
          format: String,
          default: "WegmansOrderHistoryByUser",
        },
        TOKENSBYCODE: {
          doc: "Table for blah",
          format: String,
          default: "WedgiesTokensByAccessCode",
        },
        TOKENSBYACCESS: {
          doc: "Table for blah",
          format: String,
          default: "WedgiesTokensByAccessToken",
        },
        TOKENSBYREFRESH: {
          doc: "Table for blah",
          format: String,
          default: "WedgiesTokensByRefreshToken",
        },
        PREREFRESHEDTOKENSBYREFRESH: {
          doc: "Table for blah",
          format: String,
          default: "WedgiesPreRefreshedTokensByRefreshToken",
        },
        PRODUCTREQUESTHISTORY: {
          doc: "Table for alexa request history",
          format: String,
          default: "WegmansProductRequestHistory",
        },
      },
    },
    lambda: {
      functionNames: {
        //TODO: this seems silly?  just have a "prefix" config instead?
        "cdk-wegmans-shopping-list": {
          doc: "lambda function name",
          format: String,
          default: "cdk-wegmans-shopping-list",
        },
        "cdk-wegmans-generate-access-code": {
          doc: "lambda function name",
          format: String,
          default: "cdk-wegmans-generate-access-code",
        },
        "cdk-wegmans-get-tokens": {
          doc: "lambda function name",
          format: String,
          default: "cdk-wegmans-get-tokens",
        },
        "cdk-wegmans-cron-order-history-updater": {
          doc: "lambda function name",
          format: String,
          default: "cdk-wegmans-cron-order-history-updater",
        },
        "cdk-wegmans-cron-access-token-refresher": {
          doc: "lambda function name",
          format: String,
          default: "cdk-wegmans-cron-access-token-refresher",
        },
        "cdk-wegmans-worker-prefix": {
          doc: "lambda function name",
          format: String,
          default: `cdk-wegmans-worker-`,
        },
      },
    },
    sqs: {
      queueNames: {
        "worker-queue-prefix": "wegmans-worker-",
      },
    },
    accessKeyId: {
      doc: "AWS Access Key Id",
      env: "AWS_ACCESSKEYID",
      default: "herp",
    },
    secretAccessKey: {
      doc: "AWS Secret Key",
      env: "AWS_SECRETACCESSKEY",
      default: "derp",
    },
  },
  runWorkersInProcess: {
    doc: "Whether to run work in-process rather than enqueueing it",
    default: false,
    format: Boolean,
    env: "RUN_WORKERS_IN_PROCESS",
  },
  wegmans: {
    email: {
      doc: "Wegmans email login",
      default: "",
      format: String,
      env: "WEGMANS_EMAIL",
    },
    password: {
      doc: "Wegmans password",
      default: "",
      format: String,
      env: "WEGMANS_PASSWORD",
    },
    apikey: {
      doc: "Wegmans API key (for Ocp-Apim-Subscription-Key header)",
      default: "",
      format: String,
      env: "WEGMANS_APIKEY",
    },
  },
  encrypted: {
    doc: "Whether AWS KMS encryption was used to encrypt credentials",
    default: false,
    format: Boolean,
    env: "AWS_ENCRYPTED",
  },
  jwtSecret: {
    doc: "Secret string for signing our own JWT tokens",
    default: "super duper secret!  tehe",
    format: String,
    env: "JWT_SECRET",
  },
  jwtOverrideExpiresInSeconds: {
    doc:
      "Set the number of seconds until our wrapped JWT expires.  Normally we just use the exp value of the wegmans access token.",
    default: 0,
    format: Number,
    env: "JWT_OVERRIDE_EXPIRES_IN_SECS",
  },
  usePreRefreshedTokens: {
    doc:
      "Should we use pre-refreshed wegmans auth tokens when available?  If false,, we refresh via wegmans auth API any time we need a refresh.",
    default: true,
    format: Boolean,
    env: "PREREFRESHED_TOKENS",
  },
  alexa: {
    skill: {
      id: {
        doc: "Alexa skill id.",
        default: "",
        format: String,
        env: "ALEXA_SKILL_ID",
      },
      utterance: {
        doc: "Alexa invocation utterance word(s)",
        default: "",
        format: String,
        env: "ALEXA_SKILL_UTTERANCE",
      },
      name: {
        doc: "Name of the alexa skill.  Used for authenticating access token request.",
        default: "",
        format: String,
        env: "ALEXA_SKILL_NAME",
      },
      secret: {
        doc: "The skill client secret created during Account Linking config.",
        default: "",
        format: String,
        env: "ALEXA_SKILL_SECRET",
      },
      productSearchShortCircuitMillis: {
        doc: "millis to search for product before giving up",
        default: 500,
        format: Number,
        env: "SEARCH_SHORT_CIRCUIT_MILLIS",
      },
    },
  },
});

// Load environment dependent configuration
const env = config.get("logical_env");

dotenv.config({
  path: `${env}.env`,
});

const configFile = resolve("config", env + ".yaml");
config.loadFile(configFile);

// Perform validation
config.validate({ allowed: "strict" });
