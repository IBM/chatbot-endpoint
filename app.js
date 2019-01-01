/* dependency setup */

var express = require("express");
var bodyParser = require('body-parser');
var sender = require('request');
var axios = require('axios');
var moment = require('moment');
var momentRange = require('moment-range');
momentRange.extendMoment(moment);

/* https://www.wrike.com/api/v4/folders/IEAA3JYPI4EY2YDH/tasks */

/* For each city in the cities folder, get the event tasks
   - then for each task check status for current

   I think we want an endpoint to return the names of the cities

   and then an endpoint for events in each city - a good
   opportunity to use the city icons */

var assistantv2 = require('watson-developer-cloud/assistant/v2'); // watson sdk

var configurationdata = require('./config.json');

var config;
var token;

configurationdata.forEach(function(data) {
  if (data.service === "assistant") {
    config = data.credentials;
  }

  if (data.service === "wrike") {
    token = data.credentials.token;
  }
})

function dateMaker(datestring) {
  datestring = datestring.split('T');
  datestring = datestring[0].split('-');
  var newDate = new Date(datestring[0], datestring[1], datestring[2]);
  return newDate;
}


var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = 'debug';
logger.debug("launching advocacy chatbot endpoint");

/* end of dependency setup */

var port = process.env.PORT || 8080;

var app = express();

app.post('/location', function(req, res) {

  console.log('setting geographic location');

  res.setHeader('Content-Type', 'application/json');

  latitude = parseFloat(req.body.latitude);
  longitude = parseFloat(req.body.longitude);

  res.send(JSON.stringify({
    outcome: "success"
  }, null, 3));

});

// Bootstrap application settings
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

// Create the service wrapper

var assistant = new assistantv2({
  version: config.version,
  iam_apikey: config.apikey,
  url: config.url
});

var sessionid;

var newContext = {
  global: {
    system: {
      turn_count: 1
    }
  }
};

function getWatsonPayload(req) {

  var contextWithAcc = (req.body.context) ? req.body.context : newContext;

  if (req.body.context) {
    contextWithAcc.global.system.turn_count += 1;
  }

  var textIn = '';

  if (req.body.input) {
    textIn = req.body.input;

    console.log('input text:' + textIn)

  } else(
    console.log(req.body)
  )

  var mysession = req.body.session;

  var payload = {
    assistant_id: config.id,
    session_id: mysession,
    context: contextWithAcc,
    input: {
      message_type: 'text',
      text: textIn,
      options: {
        return_context: true
      }
    }
  };

  console.log(payload)

  return payload;
}

app.get('/session', function(req, res) {

  console.log('calling session endpoint');

  assistant.createSession({
    assistant_id: config.id,
  }, function(err, response) {
    if (err) {
      console.error(err);
    } else {
      logger.debug('established watson assistant session')
      logger.debug('session id: ' + response.session_id);
      res.send(JSON.stringify({
        session: response.session_id
      }, null, 3));
    }

  });
})


// Endpoint to be call from the client side
app.post('/message', function(req, res) {

  // res.setHeader('Content-Type', 'application/json');
  logger.debug("hit watson message endpoint");

  var payload = getWatsonPayload(req);

  logger.debug("sending message to watson assistant")
  // console.log(payload)

  // Send the input to the assistant service
  assistant.message(payload, function(err, data) {

    var assistantId = config.id;

    if (err) {
      console.log(err)
      return res.status(err.code || 500).json(err);
    }

    logger.debug("received response from watson assistant")

    var keyword = '';

    if (data.output.entities != undefined && data.output.entities.length > 0) {

      logger.debug(data);

      var p = new Promise(function(resolve, reject) {
        keyword = decideOnKeywords(data.output.entities);
        logger.debug('keyword ' + keyword.value);
        if (keyword != undefined) {
          logger.debug("watson assistant suggested keywords");
          resolve(keyword)

        } else {
          logger.debug("failed to find entities")
          reject(Error("It broke"));
        }
      }).then(function(keyword) {
        return callElasticSearch(keyword)
      }).then(

        function(result) {
          logger.debug('chained promise');
          logger.debug(result);

          var chatbotresponse = buildBotResponse(result)

          res.send(JSON.stringify(chatbotresponse, null, 3));

          // return res.json(result);
        });
    } else {
      var response = {
        response: 'I got nothing ...',
        resources: []
      };
      res.send(JSON.stringify(response, null, 3));
    }
  });
});

function buildBotResponse(content) {

  content = JSON.parse(content)

  var response = {
    response: 'This is what I was able to find ...',
    resources: []
  };

  content.hits.hits.forEach(function(hit) {
    var item = {
      type: 'pattern',
      url: hit._source.codeRepoUrl,
      title: hit._source.id
    };
    response.resources.push(item);
  })

  logger.debug(response);

  return response;
}


function decideOnKeywords(entities) {

  logger.debug("watson assistant matched some entities")
  console.log(entities)

  var sortedentities = entities.sort(compare);

  logger.debug("sorted entities in order of confidence")
  // console.log(sortedentities)

  var reverseorder = sortedentities.reverse()

  if (reverseorder.length > 0) {
    var strongestcandidate = reverseorder[0];
  }



  if (strongestcandidate.value != undefined) {
    logger.debug("proposing strongest candidate: " + strongestcandidate.value)
  }

  return strongestcandidate;
}

function getElasticSearchOptions(keyword) {

  var path = 'http://169.55.81.195:31726/codey/v1/codepattern?search=' + keyword;
  // clinics = clinics + '?id_remedio=' + req.body.drug.id;

  var options = {
    url: path,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla'
    },
    json: null
  };

  return options;
}

function callElasticSearch(keyword) {

  logger.debug("calling elastic search with ")
  var elasticSearchResults;

  var outcome = new Promise(function(resolve, reject) {

    sender(getElasticSearchOptions(keyword.value), function(err, newresponse, clinics) {
      elasticSearchResults = newresponse.body;
      logger.debug('received elastic search results')
      //      console.log(newresponse.body);

      if (elasticSearchResults != undefined) {
        logger.debug('resolving elastic search promise')
        resolve(elasticSearchResults);
      } else {
        reject("")
      }
      // console.log(newresponse.body);
    })
  })

  return outcome;
}

function compare(a, b) {
  return parseFloat(a.confidence) - parseFloat(b.confidence)
}

var locations = [{
    "name": "London",
    "eventfolder": "IEAA3JYPI4EIRYFG",
    "contactfolder": ""
  },
  {
    "name": "Amsterdam",
    "eventfolder": "IEAA3JYPI4EIRYFY",
    "contactfolder": ""
  },
  {
    "name": "Bangalore",
    "eventfolder": "IEAA3JYPI4EIRYGT",
    "contactfolder": ""
  },
  {
    "name": "Berlin",
    "eventfolder": "IEAA3JYPI4EIRYFT",
    "contactfolder": ""
  },
  {
    "name": "Beijing",
    "eventfolder": "IEAA3JYPI4EIRYGH",
    "contactfolder": ""
  },
  {
    "name": "New York",
    "eventfolder": "IEAA3JYPI4EIRYEV",
    "contactfolder": ""
  }
]

var months = [{
    "name": "January",
    "start": 1,
    "end": 31,
    "id":1
  },
  {
    "name": "February",
    "start": 1,
    "end": 28,
    "id":2
  },
  {
    "name": "March",
    "start": 1,
    "end": 31,
    "id":3
  },
  {
    "name": "April",
    "start": 1,
    "end": 30,
    "id":4
  },
  {
    "name": "May",
    "start": 1,
    "end": 31,
    "id":5
  },
  {
    "name": "June",
    "start": 1,
    "end": 30,
    "id":6
  },
  {
    "name": "July",
    "start": 1,
    "end": 31,
    "id":7
  },
  {
    "name": "August",
    "start": 1,
    "end": 31,
    "id":8
  },
  {
    "name": "September",
    "start": 1,
    "end": 30,
    "id":9
  },
  {
    "name": "October",
    "start": 1,
    "end": 31,
    "id":10
  },
  {
    "name": "November",
    "start": 1,
    "end": 30,
    "id":11
  },
  {
    "name": "December",
    "start": 1,
    "end": 31,
    "id":12
  }
]

app.get('/events', function(req, res) {

  logger.debug("Received request for event data");

  var month;
  var year;
  var location;

  var activeEvents = [];


  if (req.body.month) {
    month = req.body.month;
    year = req.body.year;
    location = req.body.location;

    logger.debug("Month: " + month);
    logger.debug("Year: " + year);
    logger.debug("Location: " + location);
  } else(
    console.log(req.body)
  )

  var folder;

  var monthrange;

  var monthContent = { 'month': month, 'year':year, days:[]}

  locations.forEach(function(city) {
    if (location === city.name) {
      folder = city.eventfolder;
      logger.debug("Matched a city from the request: " + location);
    }
  })

  months.forEach(function(mth){
    if(mth.name === month){
      monthrange = mth;
      logger.debug("Establising month range");
    }
  })

  logger.debug("Sending request to Wrike for folder data");
  axios.get(
      // "https://www.wrike.com/api/v4/folders",
      "https://www.wrike.com/api/v4/folders/" + folder + "/tasks", {
        headers: {
          "Authorization": "Bearer " + token
        }
      }
    )
    .then((response) => {

        logger.debug("Received data from Wrike");

        var response = response.data;

        // console.log(response)

        const start = new Date(2019, monthrange.id, monthrange.start);
        const end = new Date(2019, monthrange.id, monthrange.end);
        const range = moment.range(start, end);

        logger.debug("Building event list for " + month);

        response.data.forEach(function(event) {

          if (event.status === 'Active') {

            if (event.dates.start != undefined) {

              var testDate = dateMaker(event.dates.start);

              if (range.contains(testDate)) {

                activeEvents.push(event);

                var newEvent = {
                  "url":"",
                  "title":event.title,
                  "image":"",
                  "description":"",
                  "location":"",
                  "time":""
                }

                var filedEvent = false;
                var eventDay = testDate.getDate()
                monthContent.days.forEach( function(dayContent){
                    if( dayContent.day == eventDay ){
                      dayContent.events.push(newEvent)
                      filedEvent = true;
                    }
                })

                if( filedEvent == false ){
                    var dayContent = { 'day':eventDay, 'events':[]};
                    dayContent.events.push(newEvent);
                    monthContent.days.push(dayContent);
                }
              }
            }
          }
        })

        logger.debug("Replying with data for " + activeEvents.length + " events");

        res.send(JSON.stringify({
          outcome: monthContent
        }, null, 3));

        // console.log(response)
      },
      (error) => {
        var status = error.response.status
      }
    );
});

app.listen(port);
logger.debug("Listening on port ", port);
