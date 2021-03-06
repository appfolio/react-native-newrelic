/* globals ErrorUtils, __DEV__ */
import {NativeModules} from 'react-native';
import * as _ from 'lodash';
import moment from 'moment';

const RNNewRelic = NativeModules.RNNewRelic;

class NewRelic {
  init(config) {
    if (config.overrideConsole) {
      this._overrideConsole();
    }
    if (config.reportUncaughtExceptions) {
      this._reportUncaughtExceptions();
    }
    if (config.reportRejectedPromises) {
      this._reportRejectedPromises();
    }
    if (config.globalAttributes) {
      this.setGlobalAttributes(config.globalAttributes);
    }
  }

  _overrideConsole() {
    const defaultLog = console.log;
    const defaultWarn = console.warn;
    const defaultError = console.error;
    const self = this;

    console.log = function() {
      self.sendConsole('log', arguments);
      defaultLog.apply(console, arguments);
    };
    console.warn = function() {
      self.sendConsole('warn', arguments);
      defaultWarn.apply(console, arguments);
    };
    console.error = function() {
      self.sendConsole('error', arguments);
      defaultError.apply(console, arguments);
    };
  }

  _reportUncaughtExceptions(errorUtils = global.ErrorUtils) {
    const defaultHandler = errorUtils._globalHandler;
    errorUtils._globalHandler = (error) => {
      this.send('Logs', 'JS:UncaughtException', {error, stack: error && error.stack});
      defaultHandler(error);
    };
  }

  _reportRejectedPromises() {
    const rejectionTracking = require('promise/setimmediate/rejection-tracking');
    if (!__DEV__) {
      rejectionTracking.enable({
        allRejections: true,
        onUnhandled: (id, error) => {
          this.send('Logs', 'JS:UnhandledRejectedPromise', {error});
          this.nativeLog('[UnhandledRejectedPromise] ' + error);
        },
        onHandled: () => {
          //
        }
      });
    }
  }

  /**
   * registers global attributes that will be sent with every event
   * @param args
   */
  setGlobalAttributes(args) {
    _.forEach(args, (value, key) => {
      RNNewRelic.setAttribute(String(key), String(value));
    });
  }

  sendConsole(type, args) {
    const argsStr = _.map(args, String).join(', ');
    this.send('Logs', 'JSConsole', {consoleType: type, args: argsStr});
    if (type === 'error') {
      this.nativeLog('[JSConsole:Error] ' + argsStr);
    }
  }

  report(eventName, args) {
    this.send('Logs', eventName, args);
  }

  /*
   logs a message to the native console (useful when running in release mode)
  */
  nativeLog(log) {
    RNNewRelic.nativeLog(log);
  }

  send(eventType, name, args) {
    const eventTypeStr = String(eventType);
    const nameStr = String(name);
    let argsStr = {};
    _.forEach(args, (value, key) => {
      if (typeof value === 'number') {
        argsStr[String(key)] = Number(value);
      } else {
        argsStr[String(key)] = String(value);
      }
    });
    const startingTime = this.startingTimes ? this.startingTimes[name] : null;
    if (startingTime) {
      const duration = moment().diff(startingTime) / 1000;
      // Timeout of 500 seconds to account for timeEvent outliers
      if (duration > 500) {
        return;
      }
      argsStr = {
        ...argsStr,
        duration
      };
      this.startingTimes[name] = null;
    }
    RNNewRelic.send(eventTypeStr, nameStr, argsStr);
  }

  timeEvent(name) {
    this.startingTimes = {
      ...this.startingTimes,
      [name]: moment()
    };
  }
}

export default new NewRelic();
