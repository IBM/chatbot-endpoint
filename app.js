/* dependency setup */

var express = require("express");
var bodyParser = require('body-parser');
var sender = require('request');
var watson = require('watson-developer-cloud');

var assistantv2 = require('watson-developer-cloud/assistant/v2'); // watson sdk

var config = require('./config.json');

/* end of dependency setup */

var port = process.env.PORT || 8080;

var app = express();

if( process.env ){
  console.log(process.env)
}

// app.use(express.static(__dirname + '/public'));
//
// app.use(bodyParser());

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

console.log("got to here")

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
  } else{

    sessionid = response.session_id;

    console.log(JSON.stringify(response, null, 2));
  }
});

var newContext = {
  global : {
    system : {
      turn_count : 1
    }
  }
};

// Endpoint to be call from the client side
app.post('/message', function (req, res) {

  res.setHeader('Content-Type', 'application/json');

  console.log("hit watson message endpoint")

  var contextWithAcc = (req.body.context) ? req.body.context : newContext;

  if (req.body.context) {
    contextWithAcc.global.system.turn_count += 1;
  }

  //console.log(JSON.stringify(contextWithAcc, null, 2));

  var textIn = '';

  if(req.body.input) {
    textIn = req.body.input;
  }else(
    console.log(req.body)
  )

  var payload = {
    assistant_id: config.id,
    session_id: sessionid,
    context: contextWithAcc,
    input: {
      message_type : 'text',
      text : textIn,
      options : {
        return_context : true
      }
    }
  };

  console.log("sending message to Watson with this payload:")

  console.log(payload)

  // Send the input to the assistant service
  assistant.message(payload, function (err, data) {

    var assistantId = config.id;

    if (err) {

      console.log(err)

      return res.status(err.code || 500).json(err);
    }

    console.log("Watson Response")

    console.log(data)

    var keyword = '';

    if(data.output.entities != undefined){

      keyword = decideOnKeywords(data.output.entities);

    }

    console.log('keyword ' + keyword.value);

    return res.json(data);
  });
});


function decideOnKeywords(entities){

    console.log("entites matched")

    console.log(entities)

    var sortedentities = entities.sort(compare);

    console.log("sorted in order of confidence")

    console.log(sortedentities)

    var reverseorder = sortedentities.reverse()

    if(reverseorder.length > 0){
        var strongestcandidate = reverseorder[0];
    }

    console.log("strongest candidate")

    console.log(strongestcandidate)

    return strongestcandidate;
}


function compare(a,b) {

  return parseFloat(a.confidence) - parseFloat(b.confidence)
  // if (a.confidence < b.confidence)
  //    return -1;
  // if (a.confidence > b.confidence)
  //   return 1;
  // return 0;
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
    console.log(newresponse.body);
  })


  /* Secondly, send those entities on to Elastic Search, to
     ask for code patterns */

  res.send(JSON.stringify({
    outcome: elasticSearchResults
  }, null, 3));

});

app.listen(port);
console.log("Listening on port ", port);
