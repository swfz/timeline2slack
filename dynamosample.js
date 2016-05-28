var AWS = require('aws-sdk');
AWS.config.update({endpoint: 'http://192.168.30.11:8001', region: 'localhost'});
var doc = require('dynamodb-doc');
var dynamo = new doc.DynamoDB();

var pfunc = function(err, data) {
    if (err) {
        console.log(err, err.stack);
    }
    else {
        console.log(data);
    }
}

var e = {};
e.payload = {
  "TableName": "tw2slack",
  "Key": {
    "key": "last_post_id"
  },
}

// 検索
dynamo.getItem(e.payload,function(err, data){
  if(err) {
    console.log(err);
  }
  else{
    console.dir(data);

    if ( data.Item.key ) {
      console.log('exist data');
      putItem(data.Item.value);
    }
    else {
      //新規作成
      putItem(0);
    }
  }
});

// 更新
function putItem(last_post_id){
  var params = {
    TableName: "tw2slack",
    Item: {
      key: "last_post_id",
      value: last_post_id
    }
  };

  dynamo.putItem(params,pfunc);
}

// カウンター
function incrementItem() {
  var params = {
    TableName: "tw2slack",
    Key: {
      "key": "last_post_id",
    },
    UpdateExpression: "SET #v = #v + :n",
    ExpressionAttributeNames: {"#v": "value"},
    ExpressionAttributeValues: { ":n": 1 }
  };
  dynamo.updateItem(params,pfunc);
}
