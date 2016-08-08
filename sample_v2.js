exports.handle = function(event, context) {
  process.env.TZ = 'Asia/Tokyo';
  const config = require('config');

  const logger = (f,obj) => {
    console.dir(f);
    console.dir(obj);
  }

  const pfunc = (err,data) => {
    if (err) {
      console.log(err,err.stack);
    }
    else {
      console.log(data);
    }
  }

  Array.prototype.divide = function(n){
    var array = this;
    var index = 0;
    var dividedArray = [];
    var length = array.length;

    while ( index < length ) {
      var partial = array.slice(index,index+n);
      dividedArray.push(partial);
      index = index + n;
    }

    return dividedArray;
  }

  function makeAttachement(tweet) {
    var posted     = Date.parse( tweet.created_at );
    var postedDate = new Date(posted);
    var postedLink = "https://twitter.com/" + tweet.user.screen_name + "/status/" + tweet.id_str;

    // slackAPIのpayloadで使用するためsnake case
    var attachment = {
      color: "#334fa6",
      text: tweet.text,
      author_name: tweet.user.name,
      author_link: "https://twitter.com/" + tweet.user.screen_name,
      author_icon: tweet.user.profile_image_url_https,
      fields: [{
        title: "Posted: " + postedDate.toLocaleString(),
        value: postedLink,
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
        text: attachments.length + '/' + config.divideCount + 'tweets',
        attachments: JSON.stringify( attachments ),
      }, function (err,res){
        if (err) {
          console.log(err);
          console.log(res);
        };
        var log = "posted " + attachments.length + " tweet. " + attachments[0].fields[0].title + " TO " + attachments[attachments.length - 1].fields[0].title;
        console.log(log);
        resolve(log);
      });
    });
  }

  function readPostedTweet(){
    return new Promise(function(resolve,reject){
      var dynamo = dynamoClient();
      var params = {
        "TableName": config.dynamo.table,
        "Key": {
          "key": config.dynamo.key
        }
      }

      var asyncGetitem = new Promise(function(resolve,reject){
        dynamo.getItem(params,function(err, data){
          var posted = [];
          if ( data && data.Item ) {
            posted = JSON.parse(data.Item.value);
          }
          resolve(posted);
        });
      });

      asyncGetitem.then(function(posted){
        resolve(posted);
      });
    });
  }

  function writePostedTweet( posted_tweet ){
    var dynamo = dynamoClient();

    var params = {
      TableName: config.dynamo.table,
      Item: {
        key: config.dynamo.key,
        value: posted_tweet
      }
    };

    dynamo.putItem(params,pfunc);
  }

  var dynamoClient = () => {
    var AWS = require('aws-sdk');
    if ( process.env.AWS_PROFILE ) {
      AWS.config.update({endpoint: config.dynamo.endpoint, region: config.dynamo.region });
    }
    var doc = require('dynamodb-doc');
    var dynamo = new doc.DynamoDB();

    return dynamo;
  }

  // const isAlreadyPosted = (posted,index,array) => {
  //   logger('isAlreadyPosted',self);
  //   self.id == posted.tweet_id;
  // }
  function isAlreadyPosted(posted,index,array){
    return this.id == posted.tweet_id;
  }

  function timeline2Slack(error,tweets,response){
    if (error) {
      console.log(error);
      return;
    }

    var asyncReadPosted = readPostedTweet();
    asyncReadPosted.then(function(posted){

      console.log('tweet count: ' + tweets.length);
      var filteredTweets = tweets.filter(function(tweet,index,array){
        if ( posted.length == 0 ){
          return true;
        }
        // console.log( !posted.some(isAlreadyPosted, tweet) );
        return ( !posted.some(isAlreadyPosted, tweet) );
      });

      console.log('filtered_tweet: ' + filteredTweets.length);

      attachments = [];
      filteredTweets.forEach(function(tweet){
        attachments.push( makeAttachement(tweet) );
      });

      divided_attachements = attachments.reverse().divide(config.divideCount);
      divided_attachements.reduce(function(promise,partialAttachements){
        return promise.then(function(result){
          return post2slack(partialAttachements);
        });
      },
        Promise.resolve()
      );

      var posted_tweet = tweets.map(function(tweet, index, array){
        return {tweet_id: tweet.id, posted: tweet.created_at};
      });
      writePostedTweet( JSON.stringify(posted_tweet) )
      context.succeed( {"to slack tweets": filteredTweets.length} );
    });
  }

  console.log('aaa');
  var Twitter = require('twitter');
  const twitterClient = new Twitter({
    consumer_key: config.twitter.consumer_key,
    consumer_secret: config.twitter.consumer_secret,
    access_token_key: config.twitter.access_token_key,
    access_token_secret: config.twitter.access_token_secret
  });

  const params = { count: config.tweetCount };
  twitterClient.get('statuses/home_timeline', params, timeline2Slack);
}
