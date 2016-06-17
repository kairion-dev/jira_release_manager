"use strict";

/**
 * Base class for webhooks.
 * Please inherit this class to build own webhooks that should be processed by the Release-Manager Webhook Engine.
 */
class Webhook {

  /**
   * @param  {String} id
   *   Is required to identify the webhook within the engine
   * @param  {Object} params
   *   Additional parameter to work with - such as databases or configs
   *   Parameters are automatically added to be used by the webhook that extends this class.
   */
  constructor(id, params) {
    this.id = id; 
    this.params = params || {};
  }


  /**
   * Init webhook, e.g. while it is registered by the webhook-engine.
   * 
   * @return {Promise}
   */
  init() {
    return Promise.resolve(); // by default we have nothing to initialize.
  }


/**
 * Checks if the current webhook should be executed on invoke or not.
 * 
 * @param  {Object} data
 *   Data posted from the remote server.
 * @return {Promse<Boolean>}
 *   true if the webhook should be executed, false otherwise
 */
  shouldBeExecuted(data) {
    return Promise.resolve(true); // by default the webhook is invoked
  }

/**
 * Invoke the webhook and process the data. This is the method that provides the webhook logic.
 * A promise is mandatory as return value, but no result value is expected even though it can be returned for logging in the webhook engine.
 * 
 * @param  {Object} data
 *   Data posted from the remote server.
 * @return {Promise}
 */
  invoke(data) {
    throw new Error('Implement me');
  }

}

module.exports = Webhook;