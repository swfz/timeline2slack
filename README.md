# timeline2slack

## module install

```
npm install
```

## set aws credential setting
- ~/.aws/config
- ~/.aws/credentials

## set config/default.json
- tiwtter token
- slack token
- dynamo endpoint(development)

### e.g) use dynamodb-local

```
aws dynamodb create-table --endpoint-url http://192.168.30.11:8001 --profile localtest --table-name tw2slack \
--attribute-definitions AttributeName=key,AttributeType=S \
--key-schema AttributeName=key,KeyType=HASH \
--provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1
```

## function.json
- for apex. lambda function.

