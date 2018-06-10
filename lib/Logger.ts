import * as winston from "winston";
import config from './config';

//TODO: winston v3 @types

export const logger = new winston.Logger({
  transports: [new winston.transports.Console({
    timestamp: true,
    showLevel: true,
    level: config.get('logging.level'),
  })],
});

//winston3 style:
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
