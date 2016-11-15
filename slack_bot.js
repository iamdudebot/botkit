'use strict';

var async = require('async');
var escapeStringRegexp = require('escape-string-regexp');
var botkit = require('botkit');
var mongodb = require('mongodb');
var today = new Date().getDate();

function connectToDb() {
  mongodb.MongoClient.connect('mongodb://localhost:27017/talking', function(err, db) {
    if (err) {
      throw err;
    }
    console.log('Connection established to mongodb');
    startBot(db);
  });
}

function startBot(db) {
  var collection = db.collection('talking');
  // collection.remove({});

  collection.updateMany({
    lastChange: today - 1
  }, {
    $set: {
      "score": 0
    }
  });

  var botkitController = botkit.slackbot({
    debug: false
  });

  botkitController.spawn({
    token: process.env.token
  }).startRTM();

  botkitController.on('ambient', function(bot, message, token) {
    var talk = message.text.length;

    collection.findAndModify({
      _id: message.user
    }, [
      ['_id', 1]
    ], {
      $inc: {
        "score": talk
      },
      $set: {
        lastChange: today
      },
      $setOnInsert: {
        dudeStatus: null
      }
    }, {
      new: true,
      upsert: true
    }, function(err, result) {
      if (err) {
        throw err;
      }
      bot.botkit.log('individual message log', result);
    });

  });

  botkitController.hears(['report'], ['direct_message', 'direct_mention'], function(bot, message) {
    bot.reply(message, "First, let's make sure everyone's dude status has been set.");

    function assignDude(status, el, convo) {
      convo.on('end', function(convo) {
        if (convo.status == 'completed') {

          collection.findAndModify({
            _id: el._id
          }, [
            ['_id', 1]
          ], {
            $set: {
              dudeStatus: status
            }
          }, {
            new: true,
            upsert: false
          }, function(err, result) {
            if (err) {
              throw err;
            }
            //bot.botkit.log('individual dude log', result);
            convo.stop();
            talkedToday();
          });
        }
      });
    }

    function askDude(el, convo) {
      convo.ask('Is ' + '<@' + el._id + '>' + ' a dude?', [
        {
          pattern: bot.utterances.yes,
          callback: function(response, convo) {
            assignDude(true, el, convo);
            convo.say('OK! I will update my dossier for ' + '<@' + el._id + '>');
            convo.next();
          }
        },
        {
          pattern: bot.utterances.no,
          callback: function(response, convo) {
            assignDude(false, el, convo);
            convo.say('OK! I will update my dossier for ' + '<@' + el._id + '>');
            convo.next();
          }
        },
        {
          default: true,
          callback: function(response,convo) {
            // just repeat the question
            convo.say("No problem! I'll ask again and you can just say " + '<@' + el._id + '>' + ' is not a dude.');
            convo.repeat();
            convo.next();
          }
        }
      ]);
      convo.activate();
    }

    function getReport(callback) {
      collection.aggregate([{
        $match: { $or: [ { dudeStatus: true }, { dudeStatus: false } ] } },
      {
        $group: {
          _id: {
            "dudeStatus": "$dudeStatus"
          },
          "total": {
            $sum: "$score"
          }
        }
      }]).toArray(
      function(err, result) {
        if (err) {
          throw err;
        } else if (result.length === 2) {
          bot.reply(message, "All dude statuses are in!");

          var dudeTalk = result[0].total;
          var notDudeTalk = result[1].total;
          var totalTalk = dudeTalk + notDudeTalk;
          var percentageDude = Math.trunc((dudeTalk / totalTalk) * 100);

          bot.botkit.log('report total log', totalTalk);
          bot.botkit.log('report result log', result);

          bot.reply(message, 'Dudes have talked:\n' + percentageDude + '% of the time');
        } else {
          bot.botkit.log('report result error', result);
          bot.reply(message, "I don't have enough information to move forward. 😿");
        }
      });
    }

    function talkedToday() {
      collection.aggregate([{
        $match: {
          lastChange: today
        }
      }]).toArray(
        function(err, result) {
          if (err) {
            throw err;
          }

          bot.botkit.log('Talked Today log', result);

          bot.startConversation(message, function(err, convo) {

            async.eachSeries(result, function(el, cb) {
              if (el.dudeStatus === null) {
                askDude(el, convo);
              } else {
                cb();
              }
            }, function(err) {
              if( err ) {
                bot.reply(message, 'Something went wrong. Try again?');
              } else {
                getReport();
              }
            })
          })
        })
    }

    talkedToday();

  });

}

if (!process.env.token) {
  console.log('Error: Specify token in environment');
  process.exit(1);
}

connectToDb();
