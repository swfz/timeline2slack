exports.handle = function(event, context) {
  process.env.TZ = 'Asia/Tokyo';
  const config = require('config');
  const util   = require('util');

  const dump = (o) => {
    util.log(util.inspect(o,{depth: 7}))
  }

  const pfunc = (err,data) => {
    if (err) { util.log(err,err.stack); }
    else     { util.log(data); }
  }

  Array.prototype.divide = function(n){
    const array  = this;
    const length = array.length;
    var index = 0;
    var dividedArray = [];

    while ( index < length ) {
      var partial = array.slice(index,index+n);
      dividedArray.push(partial);
      index = index + n;
    }

    return dividedArray;
  }

  function makeAttachement(tweet) {
    const posted     = Date.parse( tweet.created_at );
    const postedLink = `https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`;

    // dump(tweet);
    // slackAPIのpayloadで使用するためsnake case

    var attachment = {
      color: "#334fa6",
      text: tweet.text,
      title: "to post",
      title_link: postedLink,
      author_name: tweet.user.name,
      author_link: `https://twitter.com/${tweet.user.screen_name}`,
      author_icon: tweet.user.profile_image_url_https,
      fields: [],
      footer: "Posted: ",
      ts: posted / 1000
    }

    if ( tweet.entities.media ) {
      attachment["thumb_url"] = tweet.entities.media[0].media_url
      if ( tweet.entities.media.length > 1 ){ attachment["title"] = "to post. media more posted :rainbow:"; }
    }
    if ( tweet.entities.user_mentions ) {
      tweet.entities.user_mentions.forEach(function(user){
        attachment.fields.push({title: `@${user.screen_name}(${user.name})`, value: `https://twitter.com/${user.screen_name}`, short: true});
      });
    }

    return attachment;
  }

  function post2Slack(attachments){
    return new Promise(function(resolve,reject){
      const slackToken     = config.slack.token;
      const slackApiClient = require('slack-api-client');
      const slack          = new slackApiClient(slackToken);

      slack.api.chat.postMessage({
        channel: config.slack.channel,
        username: config.slack.username,
        text: `${attachments.length}/${config.divideCount}tweets`,
        attachments: JSON.stringify( attachments ),
      }, function (err,res){
        if (err) { util.log(err); util.log(res); };
        const startDate = new Date(attachments[0].ts * 1000);
        const endDate   = new Date(attachments[attachments.length - 1].ts * 1000);
        const log = `posted ${attachments.length} tweet. ${startDate} TO ${endDate}`;
        util.log(log);
        resolve(log);
      });
    });
  }

  function readPostedTweet(){
    return new Promise(function(resolve,reject){
      const dynamo = dynamoClient();
      const params = {
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

      asyncGetitem.then( posted => resolve(posted) )
    });
  }

  function writePostedTweet( postedTweet ){
    const dynamo = dynamoClient();

    const params = {
      TableName: config.dynamo.table,
      Item: {
        key: config.dynamo.key,
        value: postedTweet
      }
    };

    dynamo.putItem(params,pfunc);
  }

  const dynamoClient = () => {
    const AWS = require('aws-sdk');
    if ( process.env.AWS_PROFILE ) {
      AWS.config.update({endpoint: config.dynamo.endpoint, region: config.dynamo.region });
    }
    const doc    = require('dynamodb-doc');
    const dynamo = new doc.DynamoDB();

    return dynamo;
  }

  function isAlreadyPosted(posted,index,array){
    return this.id == posted.tweet_id;
  }

  function timeline2Slack(err,tweets,response){
    if (err) { util.log(err); return; }

    var asyncReadPosted = readPostedTweet();
    asyncReadPosted.then(function(posted){

      util.log(`tweet count: ${tweets.length}`);
      const filteredTweets = tweets.filter(function(tweet,index,array){
        if ( posted.length == 0 ){ return true; }
        return ( !posted.some(isAlreadyPosted, tweet) );
      });

      util.log(`filtered_tweet: ${filteredTweets.length}`);

      attachments = [];
      filteredTweets.forEach( tweet => attachments.push( makeAttachement(tweet) ) );

      divided_attachements = attachments.reverse().divide(config.divideCount);
      divided_attachements.reduce(function(promise,partialAttachements){
        return promise.then( result => post2Slack(partialAttachements) );
      },
        Promise.resolve()
      );

      const postedTweet = tweets.map( (tweet, index, array) => ( {tweet_id: tweet.id, posted: tweet.created_at} ) );
      writePostedTweet( JSON.stringify(postedTweet) )
    });
  }

  const Twitter = require('twitter');
  const twitterClient = new Twitter({
    consumer_key: config.twitter.consumer_key,
    consumer_secret: config.twitter.consumer_secret,
    access_token_key: config.twitter.access_token_key,
    access_token_secret: config.twitter.access_token_secret
  });

  const params = { count: config.tweetCount };
  twitterClient.get('statuses/home_timeline', params, timeline2Slack);
}
