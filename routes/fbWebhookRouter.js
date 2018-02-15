"use strict";

const express  = require('express');
var bodyParser = require('body-parser');
const config   = require('../config/config');
const PubSub   = require('@google-cloud/pubsub');

const fbWebhookRouter = express.Router();

const pubsub = PubSub({
    projectId: config.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: config.GOOGLE_CLOUD_SERVICE_ACCOUNT_FILE
});

const topic = pubsub.topic(config.GOOGLE_CLOUD_TOPIC);

fbWebhookRouter.use(bodyParser.json());

fbWebhookRouter.route("/")
.get((req,res,next) => {
    console.log("fbwebhook get handler called");

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
    console.log("fbwebhook post handler called");

    if (req.body.object === 'page') {
        req.body.entry.forEach(entry => {

            entry.messaging.forEach(event => {
                if (event.message && event.message.text) {
                    console.log("Forwarding to gcloud facebook event: " + JSON.stringify(event));
                    topic.publish({
                        data: event
                      }, (err) => {
                        if (err) {
                          console.log("Error when publishing to gcloud" + JSON.stringify(err));  
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