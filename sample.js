exports.handle = function(event, context) {
  var config = require('config');

  var pfunc = function(err, data) {
      if (err) {
          console.log(err, err.stack);
      }
      else {
          console.log(data);
      }
  }

  Array.prototype.divide = function(n){
    var array = this;
    var index = 0;
    var divided_array = [];
    var length  = array.length;

    while ( index < length ) {
      var partial = array.slice(index,index+n);
      divided_array.push(partial);
      index = index + n;
    }

    return divided_array;
  }

  function make_attachement(tweet) {
    var posted      = Date.parse( tweet.created_at );
    var posted_date = new Date(posted);
    var posted_link = "https://twitter.com/" + tweet.user.screen_name + "/status/" + tweet.id_str;

    var attachment = {
      color: "#334fa6",
      text: tweet.text,
      author_name: tweet.user.name,
      author_link: "https://twitter.com/" + tweet.user.screen_name,
      author_icon: tweet.user.profile_image_url_https,
      fields: [{
        title: "Posted: " + posted_date.toLocaleString(),
        value: posted_link,
        short: true
      }]
    }

    return attachment;
  }

  function post2slack(attachments){
    return new Promise(function(resolve,reject){
      var slackToken = config.slack.token;
      var slackApiClient = require('slack-api-client');
      var slack = new slackApiClient(slackToken);

      slack.api.chat.postMessage({
        channel: config.slack.channel,
        username: config.slack.username,
        text: attachments.length + '/' + config.divide_count + 'tweets',
        attachments: JSON.stringify( attachments ),
      }, function (err,res){
        if (err) {
          console.log(err);
          console.log(res);
        };
        resolve("posted " + attachments.length + " tweet. " + attachments[0].fields[0].title + " TO " + attachments[attachments.length - 1].fields[0].title );
      });
    });
  }

  function read_posted_tweet(){
    return new Promise(function(resolve,reject){
      var dynamo = dynamo_client();
      var params = {
        "TableName": config.dynamo.table,
        "Key": {
          "key": config.dynamo.key
        }
      }

      var async_getitem = new Promise(function(resolve,reject){
        dynamo.getItem(params,function(err, data){
          var posted = [];
          if ( data && data.Item ) {
            posted = JSON.parse(data.Item.value);
          }
          resolve(posted);
        });
      });

      async_getitem.then(function(posted){
        resolve(posted);
      });
    });
  }

  function write_posted_tweet( posted_tweet ){
    var dynamo = dynamo_client();

    var params = {
      TableName: config.dynamo.table,
      Item: {
        key: config.dynamo.key,
        value: posted_tweet
      }
    };

    dynamo.putItem(params,pfunc);
  }

  function dynamo_client(){
    var AWS = require('aws-sdk');
    if ( process.env.AWS_PROFILE ) {
      AWS.config.update({endpoint: config.dynamo.endpoint, region: config.dynamo.region });
    }
    var doc = require('dynamodb-doc');
    var dynamo = new doc.DynamoDB();

    return dynamo;
  }

  function is_already_posted(posted,index,array){
    return this.id == posted.tweet_id;
  }

  function timeline2slack(error,tweets,response){
    if (error) {
      console.log(error);
      return;
    }

    var async_read_posted = read_posted_tweet();
    async_read_posted.then(function(posted){

      console.log('tweet count: ' + tweets.length);
      var filtered_tweets = tweets.filter(function(tweet,index,array){
        if ( posted.length == 0 ){
          return true;
        }
        return ( !posted.some(is_already_posted, tweet) );
      });

      console.log('filtered_tweet: ' + filtered_tweets.length);

      attachments = [];
      filtered_tweets.forEach(function(tweet){
        attachments.push( make_attachement(tweet) );
      });

      divided_attachements = attachments.reverse().divide(config.divide_count);
      divided_attachements.reduce(function(promise,partial_attachments){
        return promise.then(function(result){
          console.log(result);
          return post2slack(partial_attachments);
        });
      },
        Promise.resolve()
      );

      var posted_tweet = tweets.map(function(tweet, index, array){
        return {tweet_id: tweet.id, posted: tweet.created_at};
      });
      write_posted_tweet( JSON.stringify(posted_tweet) )
      context.succeed( {"to slack tweets": filtered_tweets.length} );
    });
  }

  var Twitter = require('twitter');
  var twitter_client = new Twitter({
    consumer_key: config.twitter.consumer_key,
    consumer_secret: config.twitter.consumer_secret,
    access_token_key: config.twitter.access_token_key,
    access_token_secret: config.twitter.access_token_secret
  });

  var params = { count: config.tweet_count };
  twitter_client.get('statuses/home_timeline', params, timeline2slack);
}
