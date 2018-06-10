import * as yaml from "js-yaml";
import { resolve } from "path";
import * as convict from "convict";

convict.addParser({extension: ['yml', 'yaml'], parse: yaml.safeLoad });

// Define a schema
const config = convict({
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test', 'development-aws'],
    default: 'development',
    env: 'NODE_ENV',
  },
  logical_env: {
    doc: 'The logical env name for loading config file',
    format: String,
    default: 'local',
    env: 'LOGICAL_ENV',
  },
  logging: {
    level: {
      doc: 'Logging level',
      default: 'debug',
      format: ['error', 'warn', 'info', 'verbose', 'debug', 'silly'],
      env: 'LOGGING_LEVEL',
    },
  },
  aws: {
    dynamodb: {
      endpoint: {
        doc: 'DynamoDB endpoint',
        default: 'http://localhost:8000',
      },
    },
    accessKeyId: {
      doc: 'AWS Access Key Id',
      env: 'AWS_ACCESSKEYID',
      default: 'herp',
    },
    secretAccessKey: {
      doc: 'AWS Secret Key',
      env: 'AWS_SECRETACCESSKEY',
      default: 'derp',
    },
  },
  wegmans: {
    email: {
      doc: 'Wegmans email login',
      default: '',
      format: String,
      env: 'WEGMANS_EMAIL',
    },
    password: {
      doc: 'Wegmans password',
      default: '',
      format: String,
      env: 'WEGMANS_PASSWORD',
    },
    apikey: {
      doc: 'Wegmans API key (for Ocp-Apim-Subscription-Key header)',
      default: '',
      format: String,
      env: 'WEGMANS_APIKEY',
    },
    encrypted: {
      doc: 'Whether AWS KMS encryption was used to encrypt the credentials',
      default: false,
      format: Boolean,
      env: 'WEGMANS_ENCRYPTED',
    }
  }
});

// Load environment dependent configuration
const env = config.get('logical_env');
const configFile = resolve('config', env + '.yaml');

config.loadFile(configFile);

// Perform validation
config.validate({allowed: 'strict'});

export default config;
