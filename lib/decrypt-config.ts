import { KMS } from "aws-sdk";
import { config } from "./config";
import { logger } from "./Logger";

// Decrypt the config if appropriate
const kms = new KMS();
let decryptionPromise = Promise.resolve();
if (config.get("encrypted")) {
  // Decrypt code should run once and variables stored outside of the function
  // handler so that these are decrypted once per container
  const encryptedKeys = [
    "wegmans.email",
    "wegmans.password",
    "alexa.skill.secret", //TODO: delete this thing?  it's never used?  wtf
  ];
  const decryptionPromises: Array<Promise<void>> = [];
  encryptedKeys.forEach((key) => {
    if (config.get(key)) {
      decryptionPromises.push(decryptKMS(key));
    }
  });
  config.set("encrypted", false);
  decryptionPromise = Promise.all(decryptionPromises).then(() => {});
}

async function decryptKMS(key: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    logger().silly(`decrypting ${key}`);

    const encrypted = config.get(key);

    kms.decrypt({ CiphertextBlob: new Buffer(encrypted, "base64") }, (err, data) => {
      if (err) {
        // If we failed to decrypt, log and move on.  Hopefully it's already decrypted
        logger().error(`error decrypting ${key}: ` + JSON.stringify(err));
        resolve();
      } else {
        logger().silly(`decrypted ${key}`);
        config.set(key, data.Plaintext!.toString());
        resolve();
      }
    });
  });
}

export { decryptionPromise };
