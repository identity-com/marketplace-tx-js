/* eslint-disable no-console */
/**
 * Sets up a logger by storing a singleton and exporting it on future calls.
 * If a logger is passed in, it replaces the current singleton.
 * The initial value for the singleton is the console.
 *
 */

// proxy the console, allowing for the fact that console.debug does not
// exist on older node versions
const defaultLogger = {
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  info: (...args) => console.info(...args),
  debug: (...args) => (console.debug ? console.debug(...args) : console.info(...args))
};

let logger = defaultLogger;

module.exports = newLogger => {
  logger = newLogger || logger;

  logger.debugLogResolvedValue = message => result => {
    logger.debug(message, result);
    return result;
  };

  logger.debugLogTap = (...messages) => result => {
    logger.debug(...messages);
    return result;
  };

  return logger;
};
