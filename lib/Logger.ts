import * as winston from "winston";
import { config } from "./config";
import { LoggedEvent } from "../models/LoggedEvent";

import * as uuid from "uuid/v4";

// TODO: winston v3 @types

const _logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      timestamp: true,
      showLevel: true,
      level: config.get("logging.level")
    })
  ]
});

export function logger() {
  return _logger;
}

// /**
//  * Decorator for logging duration of a method call
//  * @param target
//  * @param propertyKey
//  * @param propertyDescriptor
//  */
// export function traceMethod(async: boolean) {
//   return (target, propertyKey: string, propertyDescriptor: PropertyDescriptor) => {
//     const constructorName = target.constructor && target.constructor.name;
//     const traceLocation = `${(constructorName + '.' || '')}${propertyKey}`;

//     if (propertyDescriptor === undefined) {
//       propertyDescriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
//     }
//     const originalMethodDefinition = propertyDescriptor.value;

//     const wrappedCall =
//     propertyDescriptor.value = function () {
//       const startTime = new Date().valueOf();
//       const returnValue = originalMethodDefinition.apply(this, arguments);
//       const endTime = new Date().valueOf();
//       logger().debug(new LoggedEvent('trace').addProperty('call', traceLocation).addProperty('duration', endTime - startTime).toString());
//       return returnValue;
//     };
//   };
// }
// winston3 style:
// export const logger = winston.createLogger({
//   transports: [
//     new winston.transports.Console({
//       level: config.get('logging.level'),
//     }),
//   ],
//   format: winston.format.combine(
//     winston.format.timestamp(),
//     winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
//   ),
// });

/**
 * Wrapper for logging duration of a promise
 * @param eventName
 * @param promise
 */
export async function logDuration<T>(eventName: string, promise: Promise<T> | (() => Promise<T>)): Promise<T> {
  const id = uuid();
  logger().debug(new LoggedEvent("starting").addProperty("eventName", eventName).toString());
  const startTime = new Date().getTime();

  let result;
  if (promise instanceof Promise) {
    result = await promise;
  } else {
    result = await promise();
  }
  const endTime = new Date().getTime();
  const loggedEvent = new LoggedEvent("finished")
    .addProperty("eventName", eventName)
    .addProperty("durationMillis", endTime - startTime);

  if (config.get("logging.logDuration.logResolveValue")) {
    loggedEvent.addProperty("result", result);
  }

  logger().debug(loggedEvent.toString());

  return result;
}
