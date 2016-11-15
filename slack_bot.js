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

  The bot will ask if you are sure, and then shut itself down.

  Make sure to invite your bot into other channels using /invite @<my bot>!

# EXTEND THE BOT:

  Botkit has many features for building cool and useful bots!

  Read all about it here:

    -> http://howdy.ai/botkit

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/


if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('./lib/Botkit.js');
var os = require('os');

var controller = Botkit.slackbot({
    debug: true,
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();


controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });


    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Hello ' + user.name + '!!');
        } else {
            bot.reply(message, 'Hello.');
        }
    });
});

controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function(bot, message) {

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Your name is ' + user.name);
        } else {
            bot.startConversation(message, function(err, convo) {
                if (!err) {
                    convo.say('I do not know your name yet!');
                    convo.ask('What should I call you?', function(response, convo) {
                        convo.ask('You want me to call you `' + response.text + '`?', [
                            {
                                pattern: 'yes',
                                callback: function(response, convo) {
                                    // since no further messages are queued after this,
                                    // the conversation will end naturally with status == 'completed'
                                    convo.next();
                                }
                            },
                            {
                                pattern: 'no',
                                callback: function(response, convo) {
                                    // stop the conversation. this will cause it to end with status == 'stopped'
                                    convo.stop();
                                }
                            },
                            {
                                default: true,
                                callback: function(response, convo) {
                                    convo.repeat();
                                    convo.next();
                                }
                            }
                        ]);

                        convo.next();

                    }, {'key': 'nickname'}); // store the results in a field called nickname

                    convo.on('end', function(convo) {
                        if (convo.status == 'completed') {
                            bot.reply(message, 'OK! I will update my dossier...');

                            controller.storage.users.get(message.user, function(err, user) {
                                if (!user) {
                                    user = {
                                        id: message.user,
                                    };
                                }
                                user.name = convo.extractResponse('nickname');
                                controller.storage.users.save(user, function(err, id) {
                                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                                });
                            });



                        } else {
                            // this happens if the conversation ended prematurely for some reason
                            bot.reply(message, 'OK, nevermind!');
                        }
                    });
                }
            });
        }
    });
});


controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.startConversation(message, function(err, convo) {

        convo.ask('Are you sure you want me to shutdown?', [
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    }, 3000);
                }
            },
        {
            pattern: bot.utterances.no,
            default: true,
            callback: function(response, convo) {
                convo.say('*Phew!*');
                convo.next();
            }
        }
        ]);
    });
});


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
    'direct_message,direct_mention,mention', function(bot, message) {

        var hostname = os.hostname();
        var uptime = formatUptime(process.uptime());

        bot.reply(message,
            ':robot_face: I am a bot named <@' + bot.identity.name +
             '>. I have been running for ' + uptime + ' on ' + hostname + '.');

    });

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}
