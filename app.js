/* dependency setup */

var express = require("express");
var bodyParser = require('body-parser');
var sender = require('request');

var wc = require('wrike-client');

var axios = require('axios');

console.log(wc)

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

configurationdata.forEach(function(data){
  if(data.service === "assistant"){
      config = data.credentials;
  }

  if(data.service === "wrike"){
      token = data.credentials.token;
  }
})

axios.get(
    "https://www.wrike.com/api/v4/folders",
    {headers: {
        "Authorization" : "Bearer " + token
      }
    }
  )
  .then((response) => {
      var response = response.data;

      console.log(response)
    },
    (error) => {
      var status = error.response.status
    }
  );

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

assistant.createSession({
  assistant_id: config.id,
}, function(err, response) {
  if (err) {
    console.error(err);
  } else {

    sessionid = response.session_id;
    logger.debug('established watson assistant session')
    logger.debug('session id: ' + sessionid);
  }
});

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
  } else(
    console.log(req.body)
  )

  var payload = {
    assistant_id: config.id,
    session_id: sessionid,
    context: contextWithAcc,
    input: {
      message_type: 'text',
      text: textIn,
      options: {
        return_context: true
      }
    }
  };

  return payload;
}

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

    // console.log(data)

    var keyword = '';

    if (data.output.entities != undefined) {

      var p = new Promise(function(resolve, reject) {
        keyword = decideOnKeywords(data.output.entities);
        logger.debug('keyword ' + keyword.value);
        if (keyword != undefined) {
          logger.debug("watson assistant suggesed keywords");
          resolve(keyword)

        } else {
          logger.debug("failed to find entities")
          reject(Error("It broke"));
        }
      }).then(function(keyword){return callElasticSearch(keyword)}).then(

        function(result){
          logger.debug('chained promise');
          logger.debug(result);

          var chatbotresponse = buildBotResponse(result)

          res.send(JSON.stringify(chatbotresponse, null, 3));

          // return res.json(result);
        });
    }
  });
});

function buildBotResponse(content) {

    content = JSON.parse(content)

    var response = {response:'This is what I was able to find ...', resources:[]};

    content.hits.hits.forEach(function(hit){
      var item ={type:'pattern',url:hit._source.codeRepoUrl,title:hit._source.id};
      response.resources.push(item);
    })

    logger.debug(response);

    return response;
}


function decideOnKeywords(entities) {

  logger.debug("watson assistant matched some entities")
  // console.log(entities)

  var sortedentities = entities.sort(compare);

  logger.debug("sorted entities in order of confidence")
  // console.log(sortedentities)

  var reverseorder = sortedentities.reverse()

  if (reverseorder.length > 0) {
    var strongestcandidate = reverseorder[0];
  }

  logger.debug("proposing strongest candidate: " + strongestcandidate.value)

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

app.get('/content', function(req, res) {

  res.setHeader('Content-Type', 'application/json');

  /* First, send a message to Watson Assistant, to derive
     entities */

  var path = 'http://169.55.81.195:31726/codey/v1/codepattern?search=istio';
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

  var elasticSearchResults;

  sender(options, function(err, newresponse, clinics) {

    elasticSearchResults = newresponse.body;
    // console.log(newresponse.body);
  })


  /* Secondly, send those entities on to Elastic Search, to
     ask for code patterns */

  res.send(JSON.stringify({
    outcome: elasticSearchResults
  }, null, 3));

});

app.listen(port);
logger.debug("Listening on port ", port);
