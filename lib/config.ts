import { KMS } from "aws-sdk";
import * as convict from "convict";
import * as yaml from "js-yaml";
import { resolve } from "path";

convict.addParser({
  extension: ["yml", "yaml"], parse: (str) => {
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
    format: ["production", "development", "test", "development-aws"],
    default: "development",
    env: "NODE_ENV",
  },
  logical_env: {
    doc: "The logical env name for loading config file",
    format: String,
    default: "local",
    env: "LOGICAL_ENV",
  },

  logging: {
    level: {
      doc: "Logging level",
      default: "debug",
      format: ["error", "warn", "info", "verbose", "debug", "silly"],
      env: "LOGGING_LEVEL",
    },
  },
  aws: {
    dynamodb: {
      endpoint: {
        doc: "DynamoDB endpoint",
        format: String,
        default: "",
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
  alexa: {
    skill: {
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
    },
  },
  cache: {
    orderHistory: {
      enabled: {
        doc: "Whether to use the order history cache.  Set to false to retrieve order history every time.",
        default: true,
        format: Boolean,
        env: 'CACHE_ORDERHISTORY_ENABLED',
      },
    },
  },
});

// Load environment dependent configuration
const env = config.get("logical_env");
const configFile = resolve("config", env + ".yaml");
config.loadFile(configFile);

// Perform validation
config.validate({ allowed: "strict" });
