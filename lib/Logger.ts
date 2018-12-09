import * as winston from "winston";
import { config } from "./config";
import { LoggedEvent } from "../models/LoggedEvent";

// TODO: winston v3 @types

export const logger = new winston.Logger({
  transports: [new winston.transports.Console({
    timestamp: true,
    showLevel: true,
    level: config.get("logging.level"),
  })],
});

/**
 * Decorator for logging duration of a method call
 * @param target 
 * @param propertyKey 
 * @param propertyDescriptor 
 */
export function traceMethod(async: boolean) {
  return (target, propertyKey: string, propertyDescriptor: PropertyDescriptor) => {
    const constructorName = target.constructor && target.constructor.name;
    const traceLocation = `${(constructorName + '.' || '')}${propertyKey}`;

    if (propertyDescriptor === undefined) {
      propertyDescriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
    }
    const originalMethodDefinition = propertyDescriptor.value;

    const wrappedCall = 
    propertyDescriptor.value = function () {
      const startTime = new Date().valueOf();
      const returnValue = originalMethodDefinition.apply(this, arguments);
      const endTime = new Date().valueOf();
      logger.debug(new LoggedEvent('trace').addProperty('call', traceLocation).addProperty('duration', endTime - startTime).toString());
      return returnValue;
    };
  };
}
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
