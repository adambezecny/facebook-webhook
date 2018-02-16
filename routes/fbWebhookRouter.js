"use strict";

const path     = require('path');
const express  = require('express');
const request  = require("request")
var bodyParser = require('body-parser');
let log4js     = require('log4js-config');
let logger     = log4js.get('[fbWebhookRouter]');
const config   = require('../config/config');
const PubSub   = require('@google-cloud/pubsub');

const FB_GRAPH_API_VERSION = "2.11"

const fbWebhookRouter = express.Router();

const pubsub = PubSub({
    projectId: config.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: path.join(__dirname, 'config', config.GOOGLE_CLOUD_SERVICE_ACCOUNT_FILE)
});


function doFBSubscribeRequest() {
    request({
      method: "POST",
      url: "https://graph.facebook.com/v" + FB_GRAPH_API_VERSION + "/me/subscribed_apps",
      qs: {
        access_token: config.FACEBOOK_PAGE_ACCESS_TOKEN
      }
    }, function (error, response, body) {
      if (error || body.error) {
        var err = error ? error : body.error
        logger.error("Error in doFBSubscribeRequest " + JSON.stringify(err));
      } else {
        logger.info("Subscription to Facebook result:", response.body);
      }
    });
  }
  
 
doFBSubscribeRequest();

const topic = pubsub.topic(config.GOOGLE_CLOUD_TOPIC);

fbWebhookRouter.use(bodyParser.json());

fbWebhookRouter.route("/")
.get((req,res,next) => {
    //console.log("fbwebhook get handler called");
    logger.info("fbwebhook get handler called");

    let hubChallenge = req.query['hub.challenge'];
    let hubMode = req.query['hub.mode'];
    let verifyTokenMatches = (req.query['hub.verify_token'] === config.FACEBOOK_VERIFICATION_TOKEN);

    if (hubMode && verifyTokenMatches) {
        res.status(200).send(hubChallenge);
    } else {
        res.status(403).end();
    }    

})
.post((req,res,next) => {
    //console.log("fbwebhook post handler called");
    logger.info("fbwebhook post handler called");

    if (req.body.object === 'page') {
        req.body.entry.forEach(entry => {

            entry.messaging.forEach(event => {
                if (event.message && event.message.text) {
                    //console.log("Forwarding to gcloud facebook event: " + JSON.stringify(event));
                    logger.info("Forwarding to gcloud facebook event: " + JSON.stringify(event));
                    topic.publish({
                        data: event
                      }, (err) => {
                        if (err) {
                          //console.log("Error when publishing to gcloud" + JSON.stringify(err));  
                          logger.info("Error when publishing to gcloud" + JSON.stringify(err));
                          next(err);
                          return;
                        }
                      });
                }
            });

        });
        res.status(200).end();    
    }    

});

module.exports = fbWebhookRouter;