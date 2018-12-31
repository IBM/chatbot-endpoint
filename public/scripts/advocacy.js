var loadingMsgIndex,
  botui = new BotUI('stars-bot'),
  API = './message';

var sessionid;

setup();

function sendXHR(question, cb) {
  var xhr = new XMLHttpRequest();
  var self = this;
  xhr.open("POST", "./message");
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");

  xhr.onload = function() {
    var res = JSON.parse(xhr.responseText)
    console.log(res)

    botui.message
      .bot({
        delay: 1000,
        content: res.response
      })

    res.resources.forEach(function(item) {

      var text = '... a pattern titled ' + item.title

      botui.message
        .bot({
          delay: 1000,
          content: text + ' [link](' + item.url + ')'
        })
    })

    cb();
  }
  xhr.send(JSON.stringify({
    "input": question,
    "session": sessionid
  }));
}


function init() {
  botui.message
    .bot({
      delay: 1000,
      content: 'Ask me about IBM Developer content ...'
    })
    .then(function() {
      return botui.action.text({
        delay: 1000,
        action: {
          value: '',
          placeholder: 'question'
        }
      })
    }).then(function(res) {
      sendXHR(res.value, init)
    });
}

function showItems() {
  botui.message
    .bot({
      delay: 1000,
      content: 'Ask me about IBM Developer content ...'
    })
    .then(function() {
      return botui.action.text({
        delay: 1000,
        action: {
          value: '',
          placeholder: 'question'
        }
      })
    }).then(function(res) {
      sendXHR(res.value, showItems)
    });
}

function setup(){

  botui.message
    .bot({
      delay: 1000,
      content: 'Establishing a Watson Assistant session ...  please standby ...'
    }) // cb(showIt

  var sessionrequest = new XMLHttpRequest();
  sessionrequest.onload = function(e) {
    var res = JSON.parse(sessionrequest.responseText)
    sessionid = res.session;

    botui.message
      .bot({
        delay: 1000,
        content: '... ready ...'
      }).then(init())

    console.log('sessionid: ' + res.session)
  }
  sessionrequest.open("GET", "./session");
  sessionrequest.send();
}
