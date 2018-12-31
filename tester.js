var moment = require('moment');
var momentRange = require('moment-range');
momentRange.extendMoment(moment);

const start = new Date(2019, 1, 1);
const end   = new Date(2019, 1, 31);
const range = moment.range(start, end);

var testDate = new Date(2019,1,17);

var ts = '2019-01-17'
var p = ts.split('T')

var datestring = '2019-01-17T09:00:00';

var newDate = dateMaker(datestring);

if( range.contains(newDate) ){
  console.log('TEST PASSED')
}else{
  console.log('TEST FAILED')
}

function dateMaker(datestring){
  datestring = datestring.split('T');
  datestring = datestring[0].split('-');
  var newDate = new Date( datestring[0], datestring[1], datestring[2] );
  return newDate;
}
