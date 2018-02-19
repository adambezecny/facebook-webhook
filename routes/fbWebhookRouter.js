"use strict";

const path     = require('path');
const express  = require('express');
const request  = require("request");
const requestp = require("request-promise");
var bodyParser = require('body-parser');
let log4js     = require('log4js-config');
let logger     = log4js.get('[fbWebhookRouter]');
const config   = require('../config/config');
const PubSub   = require('@google-cloud/pubsub');

const FB_GRAPH_API_VERSION = "2.11"

const fbWebhookRouter = express.Router();


function publishedHandler(err, messageIds, responseBody) {
    if (err) {
        
        logger.error("publishedHandler: " + JSON.stringify(err));
        
    }
    logger.info("publishedHandler OK " + messagesIds);
}

function subscriptionHandler(err, subscription, responseBody) {
    if (err) {
        logger.error("subscriptionHandler: " + JSON.stringify(err));
    }
    logger.info("subscriptionHandler OK " + responseBody);
}

const pubsub = PubSub({
    projectId: config.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: path.join(__dirname, '..', 'config', config.GOOGLE_CLOUD_SERVICE_ACCOUNT_FILE)
});

const topic = pubsub.topic(config.GOOGLE_CLOUD_TOPIC);

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
  
//do we need this? 
//doFBSubscribeRequest();

const sendTextMessage = (senderId, text) => {
    let echoText = "ECHO "+text;
    requestp({
        uri: "https://graph.facebook.com/v"+  FB_GRAPH_API_VERSION + "/me/messages",
        qs: { access_token: config.FACEBOOK_PAGE_ACCESS_TOKEN },
        "json": true,
        method: 'POST',
        body: {
            recipient: { id: senderId },
            message: { text: echoText }
        }
    })
    .then((parsedBody) => {
        logger.info("sendTextMessage OK");
    })
    .catch((err) => {
        logger.error("sendTextMessage KO " + JSON.stringify(err));
    });
}


fbWebhookRouter.use(bodyParser.json());

fbWebhookRouter.route("/")
.get((req,res,next) => {
    logger.info("fbwebhook get handler called");

    let hubChallenge = req.query['hub.challenge'];
    let hubMode = req.query['hub.mode'];
    let verifyTokenMatches = (req.query['hub.verify_token'] === config.FACEBOOK_VERIFICATION_TOKEN);

    if (hubMode && verifyTokenMatches) {
        logger.info("token validated");
        res.status(200).send(hubChallenge);
    } else {
        logger.error("token not validated");
        res.status(403).end();
    }    

})
.post((req,res,next) => {
    logger.info("fbwebhook post handler called");

    if (req.body.object === 'page') {
        req.body.entry.forEach(entry => {

            entry.messaging.forEach(event => {
                if (event.message && event.message.text) {
                    logger.info("Forwarding the facebook event to gcloud topic : " + JSON.stringify(event));

                    topic.publisher().publish(
                        Buffer.from(JSON.stringify(event))
                    )
                    .then(results => {
                        logger.info("google cloud topic publication ok!");
                    })
                    .catch(err => {
                        logger.error("Error when publishing to gcloud" + JSON.stringify(err));
                        next(err);
                    });                    
                      
                      //simple echo functionality
                      //let sender = event.sender.id;
                      //let text = event.message.text;
                      //sendTextMessage(sender, text);
                      //logger.info("echo message sent back to FB");

                }
            });

        });
        
        res.status(200).end();    
    }    

});

module.exports = fbWebhookRouter;