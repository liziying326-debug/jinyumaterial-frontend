var p = require('./translations.json');
['vi','tl','zh'].forEach(function(l){
  var keys = Object.keys(p[l] || {});
  console.log(l + ':' + keys.length);
});
